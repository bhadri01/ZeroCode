use axum::extract::{Request, State};
use axum::http::header::AUTHORIZATION;
use axum::middleware::Next;
use axum::response::Response;
use subtle::ConstantTimeEq;

use crate::error::ApiError;
use crate::state::AppState;

/// Which credential class the request is operating under.
///
/// Stored on the request as an extension by `require_auth`. Downstream
/// handlers (`submissions::create`, `batches::create`) check this to apply
/// the stricter anonymous quota and refuse callback URLs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthTier {
    /// Valid `Authorization: Bearer <api_key>` matching the configured master key.
    Authed,
    /// No credential. Only admitted when `config.allow_anonymous` is true; the
    /// request is gated by `AnonymousQuota` at the handler boundary.
    Anonymous,
}

/// `Authorization: Bearer <key>` middleware with optional anonymous fallback.
///
/// - With a bearer header that matches the master key: tier = `Authed`.
/// - With no bearer header and `config.allow_anonymous = true`: tier = `Anonymous`.
/// - With a bearer header that does not match, OR no header and anonymous is
///   disabled: `401 Unauthorized`.
///
/// Tier is stamped onto the request as an extension so the same middleware
/// covers every authed route.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let header_val = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    match header_val {
        Some(h) => {
            let key = h
                .strip_prefix("Bearer ")
                .or_else(|| h.strip_prefix("bearer "))
                .ok_or(ApiError::Unauthorized)?;

            let expected = state.config().api_key.as_bytes();
            let provided = key.as_bytes();
            if expected.ct_eq(provided).unwrap_u8() != 1 {
                return Err(ApiError::Unauthorized);
            }
            req.extensions_mut().insert(AuthTier::Authed);
            Ok(next.run(req).await)
        }
        None => {
            if !state.config().allow_anonymous {
                return Err(ApiError::Unauthorized);
            }
            req.extensions_mut().insert(AuthTier::Anonymous);
            Ok(next.run(req).await)
        }
    }
}
