use std::time::Duration;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::PgPool;
use zerocode_core::Token;
use zerocode_sandbox::SandboxResult;

type HmacSha256 = Hmac<Sha256>;

const TIMEOUT_PER_ATTEMPT: Duration = Duration::from_secs(5);
const RETRY_DELAYS: [Duration; 3] = [
    Duration::from_secs(1),
    Duration::from_secs(5),
    Duration::from_secs(30),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallbackStatus {
    Delivered,
    FailedAfterRetries,
}

impl CallbackStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Delivered => "delivered",
            Self::FailedAfterRetries => "failed_after_retries",
        }
    }
}

pub async fn deliver(
    client: &reqwest::Client,
    secret: &str,
    url: &str,
    token: Token,
    result: &SandboxResult,
) -> CallbackStatus {
    let body = serde_json::json!({
        "token": token.to_string(),
        "status": &result.status,
        "exit_code": result.exit_code,
        "cpu_time_ms": result.cpu_time.as_millis() as u64,
        "wall_time_ms": result.wall_time.as_millis() as u64,
        "memory_kb": result.memory_kb,
    });
    let body_str = serde_json::to_string(&body).unwrap_or_default();

    let timestamp = chrono::Utc::now().timestamp();
    let sig_input = format!("{timestamp}.{body_str}");

    let signature = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(mut mac) => {
            mac.update(sig_input.as_bytes());
            hex::encode(mac.finalize().into_bytes())
        }
        Err(_) => return CallbackStatus::FailedAfterRetries,
    };
    let sig_header = format!("t={timestamp},v1={signature}");

    // First attempt, then up to 3 retries.
    for (attempt, delay) in std::iter::once(Duration::ZERO)
        .chain(RETRY_DELAYS)
        .enumerate()
    {
        if attempt > 0 {
            let jitter = jitter_20pct(delay);
            tokio::time::sleep(delay + jitter).await;
        }

        let resp = client
            .post(url)
            .header("Content-Type", "application/json")
            .header("X-ZeroCode-Signature", &sig_header)
            .header("X-ZeroCode-Token", token.to_string())
            .body(body_str.clone())
            .timeout(TIMEOUT_PER_ATTEMPT)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => return CallbackStatus::Delivered,
            // 4xx is a client error — don't retry.
            Ok(r) if r.status().is_client_error() => {
                tracing::warn!(
                    %token, status = %r.status(), attempt,
                    "webhook got client error; not retrying"
                );
                return CallbackStatus::FailedAfterRetries;
            }
            Ok(r) => {
                tracing::warn!(
                    %token, status = %r.status(), attempt,
                    "webhook got server error; will retry"
                );
            }
            Err(e) => {
                tracing::warn!(
                    %token, error = %e, attempt,
                    "webhook request failed; will retry"
                );
            }
        }
    }

    CallbackStatus::FailedAfterRetries
}

pub async fn update_callback_status(
    pool: &PgPool,
    token: Token,
    status: CallbackStatus,
) {
    if let Err(e) = sqlx::query(
        "UPDATE submissions SET callback_status = $2 WHERE token = $1",
    )
    .bind(token.to_string())
    .bind(status.as_str())
    .execute(pool)
    .await
    {
        tracing::error!(%token, error = %e, "failed to update callback_status");
    }
}

fn jitter_20pct(base: Duration) -> Duration {
    use std::hash::{Hash, Hasher};
    let mut h = std::hash::DefaultHasher::new();
    std::time::Instant::now().hash(&mut h);
    let hash = h.finish();
    let pct = (hash % 40) as f64 / 100.0 - 0.20; // -20% to +20%
    Duration::from_secs_f64(base.as_secs_f64() * pct.abs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_status_strings() {
        assert_eq!(CallbackStatus::Delivered.as_str(), "delivered");
        assert_eq!(
            CallbackStatus::FailedAfterRetries.as_str(),
            "failed_after_retries"
        );
    }

    #[test]
    fn jitter_is_bounded() {
        let base = Duration::from_secs(10);
        for _ in 0..100 {
            let j = jitter_20pct(base);
            assert!(j <= Duration::from_secs(2), "jitter {j:?} > 2s");
        }
    }
}
