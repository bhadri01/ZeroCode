use zerocode_core::ResourceLimits;

#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub bind: String,
    pub database_url: String,
    pub api_key: String,
    pub limit_ceiling: ResourceLimits,
}
