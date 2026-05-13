use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct About {
    name: &'static str,
    version: &'static str,
    build_sha: &'static str,
    description: &'static str,
}

pub async fn about() -> Json<About> {
    Json(About {
        name: "zerocode",
        version: env!("CARGO_PKG_VERSION"),
        // BUILD_SHA injected at compile time once CI lands; default for local dev.
        build_sha: option_env!("ZEROCODE_BUILD_SHA").unwrap_or("dev"),
        description: "Sandboxed code execution API",
    })
}

#[utoipa::path(
    get, path = "/v1/about", tag = "ops",
    summary = "Service metadata",
    description = "Returns name, version, build SHA, and a one-line description. \
                   Unauthenticated; safe to expose for service discovery.",
    responses(
        (status = 200, description = "Metadata", body = crate::openapi::AboutBody),
    ),
)]
#[allow(dead_code)]
pub fn about_doc() {}
