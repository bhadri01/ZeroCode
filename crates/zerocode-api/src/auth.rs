use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use subtle::ConstantTimeEq;

use crate::error::ApiError;
use crate::state::AppState;

/// `Authorization: Bearer <key>` middleware. Single static key in v1 (the user
/// confirmed multi-tenant auth is deferred). Constant-time compare to keep
/// timing attacks off the table.
pub async fn require_bearer(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;

    let key = header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or(ApiError::Unauthorized)?;

    let expected = state.config().api_key.as_bytes();
    let provided = key.as_bytes();
    if expected.ct_eq(provided).unwrap_u8() == 1 {
        Ok(next.run(req).await)
    } else {
        Err(ApiError::Unauthorized)
    }
}
