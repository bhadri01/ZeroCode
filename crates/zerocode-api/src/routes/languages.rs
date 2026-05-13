use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::error::ApiResult;
use crate::state::AppState;

#[derive(Serialize)]
pub struct LanguageView {
    pub id: u32,
    pub name: String,
    pub version: String,
    pub source_file: String,
    pub is_compiled: bool,
    pub is_archived: bool,
}

pub async fn list(State(state): State<AppState>) -> ApiResult<Json<Vec<LanguageView>>> {
    let items = state
        .languages()
        .list()
        .into_iter()
        .map(|spec| LanguageView {
            id: spec.id,
            name: spec.name.clone(),
            version: spec.version.clone(),
            source_file: spec.source_file.clone(),
            is_compiled: spec.is_compiled(),
            is_archived: spec.is_archived,
        })
        .collect();
    Ok(Json(items))
}

#[utoipa::path(
    get, path = "/v1/languages", tag = "languages",
    summary = "List active languages",
    description = "Returns the in-memory language registry the API was started \
                   with. Stable Judge0-compatible numeric IDs. Bearer auth required.",
    security(("bearer" = [])),
    responses(
        (status = 200, description = "Active registry", body = crate::openapi::LanguagesBody),
        (status = 401, description = "Missing or invalid API key", body = crate::openapi::ErrorBody),
    ),
)]
#[allow(dead_code)]
pub fn list_doc() {}
