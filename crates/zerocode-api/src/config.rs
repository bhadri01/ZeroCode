use std::path::PathBuf;
use std::time::Duration;

use zerocode_core::ResourceLimits;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ApiConfig {
    pub bind: String,
    pub database_url: String,
    pub api_key: String,
    pub limit_ceiling: ResourceLimits,
    /// Origins that may invoke the API from a browser. Empty = CORS disabled
    /// (same-origin only). Use `*` to allow any origin (only safe when there is
    /// no auth, e.g. an entirely public read-only deployment).
    pub cors_origins: Vec<String>,
    /// If true, requests with no `Authorization` header are admitted and
    /// tagged `AuthTier::Anonymous`. Used by the hosted Code Space so visitors
    /// can run snippets without provisioning a key. Heavily rate-limited.
    pub allow_anonymous: bool,
    /// Anonymous-tier quota: how many submission attempts a single IP may make
    /// inside `anon_window`. Only enforced when `allow_anonymous` is true.
    pub anon_max_per_window: u32,
    pub anon_window: Duration,
    /// Per-IP request budget enforced by the `tower_governor` layer wrapping
    /// every authenticated route. `governor_rps` is the steady-state refill
    /// rate (requests/second), `governor_burst` is the bucket size. Both
    /// default to 100 in prod-shape compose; setting them to a large value
    /// (or pairing with `dev compose`) gives local dev unbounded headroom.
    pub governor_rps: u32,
    pub governor_burst: u32,
    /// Directory served as the static fallback (landing page, playground, docs).
    /// `None` disables static serving — `/` and unknown paths return 404 instead.
    pub web_dir: Option<PathBuf>,
}

impl ApiConfig {
    /// Parse the comma/space-separated env value into a clean origin list.
    pub fn parse_origins(raw: &str) -> Vec<String> {
        raw.split([',', ' ', '\n'])
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_end_matches('/').to_string())
            .collect()
    }
}
