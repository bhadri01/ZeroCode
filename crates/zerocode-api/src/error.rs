use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use thiserror::Error;
use zerocode_core::CoreError;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum ApiError {
    #[error("validation: {0}")]
    Validation(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("not found")]
    NotFound,

    #[error("gone: submission expired by retention policy")]
    Gone,

    #[error("conflict: idempotency-key reused with different body")]
    IdempotencyConflict { existing_token: String },

    #[error("rate limited")]
    RateLimited,

    #[error("payload too large")]
    PayloadTooLarge,

    #[error("service unavailable")]
    Unavailable,

    #[error(transparent)]
    Core(#[from] CoreError),

    #[error("db: {0}")]
    Db(#[from] sqlx::Error),

    #[error("internal: {0}")]
    Internal(String),
}

impl ApiError {
    fn http_status(&self) -> StatusCode {
        match self {
            ApiError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::Gone => StatusCode::GONE,
            ApiError::IdempotencyConflict { .. } => StatusCode::CONFLICT,
            ApiError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            ApiError::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            ApiError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::Core(e) => core_status(e),
            ApiError::Db(_) | ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

fn core_status(e: &CoreError) -> StatusCode {
    match e {
        CoreError::InvalidToken(_) => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::PayloadTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
        CoreError::PayloadNotUtf8 => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::InvalidBase64(_) => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::LimitOutOfRange { .. } => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::UnknownLanguage(_) => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::InvalidCallbackUrl(_) => StatusCode::UNPROCESSABLE_ENTITY,
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.http_status();
        // Log DB and internal errors at error level; client errors at info.
        // Avoid logging the message body — it can carry user-supplied strings.
        match status.as_u16() {
            500..=599 => tracing::error!(?status, error = %self, "request failed"),
            _ => tracing::info!(?status, error = %self, "request rejected"),
        }

        let body = match &self {
            ApiError::IdempotencyConflict { existing_token } => json!({
                "error": self.to_string(),
                "existing_token": existing_token,
            }),
            _ => json!({ "error": self.to_string() }),
        };

        let mut response = (status, Json(body)).into_response();
        if matches!(self, ApiError::Unauthorized) {
            response
                .headers_mut()
                .insert(axum::http::header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
        }
        response
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
