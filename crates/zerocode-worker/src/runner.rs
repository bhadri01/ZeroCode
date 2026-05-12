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
use std::time::Duration;

use bytes::Bytes;
use sqlx::PgPool;
use tokio::sync::Semaphore;
use tokio_stream::StreamExt;
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
    parallelism: Arc<Semaphore>,
    shutdown: Arc<tokio::sync::Notify>,
    http_client: reqwest::Client,
    webhook_secret: Arc<String>,
}

impl Runner {
    pub fn new(
        pool: PgPool,
        worker_id: String,
        languages: LanguageRegistry,
        sandbox: Arc<dyn Sandbox>,
        max_parallel: usize,
        webhook_secret: String,
    ) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("zerocode-worker/0.1")
            .build()
            .expect("build reqwest client");

        Self {
            pool,
            worker_id,
            languages: Arc::new(languages),
            sandbox,
            parallelism: Arc::new(Semaphore::new(max_parallel.max(1))),
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
            let http = self.http_client.clone();
            let secret = self.webhook_secret.clone();

            tokio::spawn(async move {
                if let Err(e) = process(pool.clone(), sandbox, langs, &http, &secret, claim).await {
                    tracing::error!(error = %e, %token, "submission failed at worker layer");
                    if let Err(write_err) =
                        db::write_sandbox_failure(&pool, token, &e.to_string()).await
                    {
                        tracing::error!(error = %write_err, %token, "could not write failure row");
                    }
                }
                drop(permit);
            });
        }
    }
}

async fn process(
    pool: PgPool,
    sandbox: Arc<dyn Sandbox>,
    languages: Arc<LanguageRegistry>,
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

    let job = SandboxJob {
        token,
        language: spec,
        source_code: Bytes::from(claim.source_code),
        stdin: Bytes::from(claim.stdin),
        limits: claim.limits,
    };

    let result = match sandbox.execute(job).await {
        Ok(r) => r,
        Err(e) => {
            return Err(anyhow::anyhow!("sandbox: {e}"));
        }
    };

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
        tracing::info!(%token, callback = status.as_str(), "webhook delivered");
    }

    Ok(())
}

fn record_outcome(token: &zerocode_core::Token, result: &SandboxResult) {
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
