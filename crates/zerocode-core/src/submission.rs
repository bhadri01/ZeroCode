use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::error::CoreError;
use crate::language::LanguageId;
use crate::limits::ResourceLimits;
use crate::payload::Payload;
use crate::status::{Signal, Status, TimeLimitKind};
use crate::token::Token;

/// What a client POSTs to `/v1/submissions`. Per the plan: 64 KB source, 64 KB stdin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmissionRequest {
    pub language_id: LanguageId,
    pub source_code: Payload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdin: Option<Payload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpu_time_limit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wall_time_limit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_limit_mb: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callback_url: Option<Url>,
}

impl SubmissionRequest {
    /// Apply the global limit ceiling and produce the concrete `ResourceLimits`
    /// the worker will enforce. Per-language defaults (held by the worker) override
    /// the API defaults but cannot exceed `ceiling`.
    pub fn resolve_limits(
        &self,
        default: ResourceLimits,
        ceiling: &ResourceLimits,
    ) -> Result<ResourceLimits, CoreError> {
        let mut lim = default;
        if let Some(v) = self.cpu_time_limit {
            lim.cpu_time = v;
        }
        if let Some(v) = self.wall_time_limit {
            lim.wall_time = v;
        }
        if let Some(v) = self.memory_limit_mb {
            lim.memory_mb = v;
        }
        lim.validate(ceiling)?;
        Ok(lim)
    }
}

/// The full row a worker writes back when the submission completes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Submission {
    pub token: Token,
    pub language_id: LanguageId,
    pub status: Status,
    pub limits: ResourceLimits,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdout: Option<Payload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stderr: Option<Payload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compile_output: Option<Payload>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpu_time: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wall_time: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_kb: Option<u32>,

    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<DateTime<Utc>>,
}

impl Submission {
    /// True for any status that won't transition further (Accepted, *Error*, TLE, etc.).
    pub fn is_done(&self) -> bool {
        self.status.is_terminal()
    }

    pub fn time_limit_was_wall(&self) -> bool {
        matches!(self.status, Status::TimeLimitExceeded(TimeLimitKind::Wall))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_resolve_applies_overrides() {
        let req = SubmissionRequest {
            language_id: 71,
            source_code: Payload::from("print('hi')"),
            stdin: None,
            cpu_time_limit: Some(1.5),
            wall_time_limit: None,
            memory_limit_mb: Some(64),
            callback_url: None,
        };
        let default = ResourceLimits::default();
        let ceiling = ResourceLimits {
            cpu_time: 30.0,
            wall_time: 60.0,
            memory_mb: 1024,
            max_pids: 256,
            ..Default::default()
        };
        let lim = req.resolve_limits(default, &ceiling).unwrap();
        assert_eq!(lim.cpu_time, 1.5);
        assert_eq!(lim.memory_mb, 64);
        assert_eq!(lim.wall_time, default.wall_time);
    }

    #[test]
    fn limits_resolve_rejects_over_ceiling() {
        let req = SubmissionRequest {
            language_id: 71,
            source_code: Payload::from("print('hi')"),
            stdin: None,
            cpu_time_limit: Some(999.0),
            wall_time_limit: None,
            memory_limit_mb: None,
            callback_url: None,
        };
        let default = ResourceLimits::default();
        let ceiling = ResourceLimits::default();
        assert!(req.resolve_limits(default, &ceiling).is_err());
    }
}
