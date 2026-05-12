use thiserror::Error;

pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("invalid token: {0}")]
    InvalidToken(String),

    #[error("payload too large: {actual} bytes (limit {limit})")]
    PayloadTooLarge { actual: usize, limit: usize },

    #[error("payload is not valid UTF-8 (set base64_encoded=true to submit binary)")]
    PayloadNotUtf8,

    #[error("invalid base64: {0}")]
    InvalidBase64(String),

    #[error("limit out of range: {field} = {value} (allowed {min}..={max})")]
    LimitOutOfRange {
        field: &'static str,
        value: f64,
        min: f64,
        max: f64,
    },

    #[error("unknown language id: {0}")]
    UnknownLanguage(u32),

    #[error("invalid callback url: {0}")]
    InvalidCallbackUrl(String),
}
