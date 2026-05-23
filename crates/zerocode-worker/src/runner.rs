//! Worker main loop. Two phases of progress:
//!
//! 1. Wait for a wake signal — either a `LISTEN/NOTIFY` on `zerocode.jobs` or a
//!    periodic 2-second poll if the LISTEN connection drops.
//! 2. Drain claimable work — keep calling `claim_next` until it returns `None`,
//!    executing each claimed job via `Sandbox::execute` and writing back the
//!    result. Bounded by a `Semaphore` so we don't fork more children than CPUs.
//!
//! The LISTEN payload (token) is ignored. It's a wake signal only — claims are
//! always FIFO over the queue.

use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use sqlx::PgPool;
use tokio::sync::Semaphore;
use tokio_stream::StreamExt;
use zerocode_cache::{CacheKey, CompileCache};
use zerocode_core::{LanguageRegistry, Status};
use zerocode_sandbox::{Sandbox, SandboxJob, SandboxResult};
use zerocode_stream::{Event, listen_for_jobs, publish_event};

use crate::db::{self, ClaimedJob};
use crate::webhook;

pub struct Runner {
    pool: PgPool,
    worker_id: String,
    languages: Arc<LanguageRegistry>,
    sandbox: Arc<dyn Sandbox>,
    compile_cache: Arc<CompileCache>,
    parallelism: Arc<Semaphore>,
    /// Memory admission: a job reserves `memory_mb` permits here before running,
    /// so the summed memory cap of concurrent sandboxes can't exceed the budget
    /// (prevents host OOM under a burst of heavy JVM/.NET jobs). Bounds memory;
    /// `parallelism` bounds count. Both must clear before a job executes.
    memory: Arc<Semaphore>,
    mem_budget: usize,
    shutdown: Arc<tokio::sync::Notify>,
    http_client: reqwest::Client,
    webhook_secret: Arc<String>,
}

impl Runner {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        worker_id: String,
        languages: LanguageRegistry,
        sandbox: Arc<dyn Sandbox>,
        max_parallel: usize,
        memory_budget_mb: u32,
        webhook_secret: String,
    ) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("zerocode-worker/0.1")
            .build()
            .expect("build reqwest client");

        let compile_cache = Arc::new(CompileCache::new(pool.clone()));
        // Clamp the budget into Tokio's permit ceiling; never below 1.
        let mem_budget = (memory_budget_mb as usize)
            .max(1)
            .min(Semaphore::MAX_PERMITS);
        Self {
            pool,
            worker_id,
            languages: Arc::new(languages),
            sandbox,
            compile_cache,
            parallelism: Arc::new(Semaphore::new(max_parallel.max(1))),
            memory: Arc::new(Semaphore::new(mem_budget)),
            mem_budget,
            shutdown: Arc::new(tokio::sync::Notify::new()),
            http_client,
            webhook_secret: Arc::new(webhook_secret),
        }
    }

    pub fn shutdown_handle(&self) -> Arc<tokio::sync::Notify> {
        self.shutdown.clone()
    }

    pub async fn run(self) -> anyhow::Result<()> {
        tracing::info!(
            worker_id = %self.worker_id,
            parallelism = self.parallelism.available_permits(),
            memory_budget_mb = self.mem_budget,
            "runner starting"
        );

        loop {
            // Drain whatever is queueable right now.
            self.drain().await;

            // Wait for the next wake. Prefer LISTEN/NOTIFY; fall back to 2s
            // poll if the listener can't be established.
            tokio::select! {
                _ = self.shutdown.notified() => {
                    tracing::info!("runner shutdown signalled");
                    break;
                }
                _ = self.wait_for_wake() => {}
            }
        }
        Ok(())
    }

    async fn wait_for_wake(&self) {
        match listen_for_jobs(&self.pool).await {
            Ok(mut stream) => {
                tokio::select! {
                    item = stream.next() => {
                        if let Some(Err(e)) = item {
                            tracing::warn!(error = %e, "job listener error; falling back to poll");
                            tokio::time::sleep(Duration::from_secs(2)).await;
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {
                        // Periodic poll fallback even with an active listener,
                        // so we don't sit idle if NOTIFY is somehow lost.
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "could not establish job listener; polling");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    async fn drain(&self) {
        loop {
            let permit = match self.parallelism.clone().try_acquire_owned() {
                Ok(p) => p,
                // All workers busy; come back when one completes.
                Err(_) => return,
            };

            let claim = match db::claim_next(&self.pool, &self.worker_id).await {
                Ok(Some(c)) => c,
                Ok(None) => return,
                Err(e) => {
                    tracing::error!(error = %e, "claim failed; will retry");
                    return;
                }
            };

            let token = claim.token;
            let pool = self.pool.clone();
            let sandbox = self.sandbox.clone();
            let langs = self.languages.clone();
            let compile_cache = self.compile_cache.clone();
            let http = self.http_client.clone();
            let secret = self.webhook_secret.clone();
            let memory = self.memory.clone();
            let mem_budget = self.mem_budget;

            tokio::spawn(async move {
                // Reserve this job's memory cap before executing. If the budget
                // is exhausted by other in-flight jobs we wait here (holding the
                // count permit) until memory frees — bounding peak host memory.
                // Clamp so a single oversized job can't exceed (and deadlock on)
                // the whole budget.
                let want = (claim.limits.memory_mb as usize).clamp(1, mem_budget) as u32;
                let _mem = memory.acquire_many_owned(want).await.ok();
                metrics::gauge!("zerocode_sandbox_memory_reserved_mb").increment(want as f64);

                metrics::gauge!("zerocode_active_sandboxes").increment(1.0);
                let start = Instant::now();
                let result = process(
                    pool.clone(),
                    sandbox,
                    langs,
                    &compile_cache,
                    &http,
                    &secret,
                    claim,
                )
                .await;
                let elapsed = start.elapsed().as_secs_f64();
                metrics::gauge!("zerocode_active_sandboxes").decrement(1.0);
                metrics::gauge!("zerocode_sandbox_memory_reserved_mb").decrement(want as f64);
                metrics::histogram!("zerocode_sandbox_duration_seconds").record(elapsed);

                if let Err(e) = result {
                    tracing::error!(error = %e, %token, "submission failed at worker layer");
                    if let Err(write_err) =
                        db::write_sandbox_failure(&pool, token, &e.to_string()).await
                    {
                        tracing::error!(error = %write_err, %token, "could not write failure row");
                    }
                }
                drop(_mem);
                drop(permit);
            });
        }
    }
}

async fn process(
    pool: PgPool,
    sandbox: Arc<dyn Sandbox>,
    languages: Arc<LanguageRegistry>,
    compile_cache: &CompileCache,
    http: &reqwest::Client,
    webhook_secret: &str,
    claim: ClaimedJob,
) -> anyhow::Result<()> {
    let token = claim.token;
    let callback_url = claim.callback_url.clone();
    tracing::info!(%token, language_id = claim.language_id, "claimed");

    let _ = publish_event(&pool, token, &Event::Processing).await;

    let spec = languages
        .require(claim.language_id)
        .map_err(|e| anyhow::anyhow!("unknown language {}: {e}", claim.language_id))?
        .clone();

    // Check the compile-artifact cache for compiled languages.
    let cached_binary = if spec.compile_cmd.is_some() {
        let key = CacheKey::compile(claim.language_id, claim.source_code.as_slice(), b"");
        match compile_cache.get(&key).await {
            Ok(Some(artifact)) => {
                tracing::info!(%token, "compile cache hit");
                metrics::counter!("zerocode_compile_cache_hits_total").increment(1);
                Some(Bytes::from(artifact.artifact_data))
            }
            Ok(None) => {
                tracing::debug!(%token, "compile cache miss");
                metrics::counter!("zerocode_compile_cache_misses_total").increment(1);
                None
            }
            Err(e) => {
                tracing::warn!(%token, error = %e, "compile cache lookup failed");
                metrics::counter!("zerocode_compile_cache_misses_total").increment(1);
                None
            }
        }
    } else {
        None
    };

    let job = SandboxJob {
        token,
        language: spec.clone(),
        source_code: Bytes::from(claim.source_code.clone()),
        stdin: Bytes::from(claim.stdin),
        limits: claim.limits,
        cached_binary,
    };

    let result = match sandbox.execute(job).await {
        Ok(r) => r,
        Err(e) => {
            return Err(anyhow::anyhow!("sandbox: {e}"));
        }
    };

    // Store compiled binary in the cache if this was a cache miss and compile
    // succeeded (any non-CompileError status means compilation passed).
    if spec.compile_cmd.is_some() && !matches!(result.status, Status::CompileError) {
        if let Some(binary) = &result.compiled_binary {
            let key = CacheKey::compile(claim.language_id, claim.source_code.as_slice(), b"");
            if let Err(e) = compile_cache
                .insert(key, claim.language_id, binary.to_vec())
                .await
            {
                tracing::warn!(%token, error = %e, "compile cache insert failed");
            } else {
                tracing::debug!(%token, bytes = binary.len(), "compile artifact cached");
            }
        }
    }

    db::write_result(&pool, token, &result).await?;
    let _ = publish_event(
        &pool,
        token,
        &Event::Finished {
            status: serde_json::to_value(result.status).unwrap_or_default(),
        },
    )
    .await;

    record_outcome(&token, &result);

    // Fire webhook if callback_url was set on the submission.
    if let Some(url) = callback_url {
        let status = webhook::deliver(http, webhook_secret, &url, token, &result).await;
        webhook::update_callback_status(&pool, token, status).await;
        metrics::counter!(
            "zerocode_webhook_deliveries_total",
            "status" => status.as_str(),
        )
        .increment(1);
        tracing::info!(%token, callback = status.as_str(), "webhook delivered");
    }

    Ok(())
}

fn record_outcome(token: &zerocode_core::Token, result: &SandboxResult) {
    let status_label = format!("{:?}", result.status);
    metrics::counter!(
        "zerocode_submissions_processed_total",
        "status" => status_label,
    )
    .increment(1);

    match &result.status {
        Status::Accepted => tracing::info!(
            %token,
            cpu_ms = result.cpu_time.as_millis() as u64,
            wall_ms = result.wall_time.as_millis() as u64,
            memory_kb = result.memory_kb,
            "accepted"
        ),
        other => tracing::info!(
            %token,
            status = ?other,
            "finished"
        ),
    }
}
