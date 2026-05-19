use std::path::PathBuf;

use zerocode_core::ResourceLimits;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ApiConfig {
    pub bind: String,
    pub database_url: String,
    pub limit_ceiling: ResourceLimits,
    /// Per-IP request budget enforced by the `tower_governor` layer wrapping
    /// every submission route. `governor_rps` is the steady-state refill rate
    /// (requests/second), `governor_burst` is the bucket size.
    pub governor_rps: u32,
    pub governor_burst: u32,
    /// Directory served as the static fallback (landing page, playground, docs).
    /// `None` disables static serving — `/` and unknown paths return 404 instead.
    pub web_dir: Option<PathBuf>,
}
