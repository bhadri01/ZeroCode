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
