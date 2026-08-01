//! `GET /v1/health/languages` — per-language health, pollable from outside.
//!
//! A customer running timed exams asked for a way to tell "the engine is slow
//! right now" from "the student's program is slow", *before* committing an exam
//! to it. This is that signal.
//!
//! It answers the question that actually matters operationally, which is not
//! "is the process up" but **"is this language's compile cache warm?"**. The two
//! degradation episodes they reported were both cold-cache effects:
//!
//!   * The first run of any given solution pays a full cold compile. For Go that
//!     is seconds (it seeds a build cache); for Rust likewise. A benchmark that
//!     measures a cold run and then re-measures an hour later sees what looks
//!     like a 9-15x "degradation" and is really cache miss vs cache hit.
//!   * Many *concurrent* cold compiles of the same new solution multiply that,
//!     because they all miss the cache together.
//!
//! So `warm_ratio` is the headline field: the fraction of recent submissions in
//! that language that skipped compilation. Near 1.0 means steady state. Low
//! means solutions are being seen for the first time and latency will be
//! compile-dominated — which is expected, not a fault, and is exactly what an
//! exam wants to pre-warm away by submitting each solution once beforehand.
//!
//! There is no such thing as a per-language worker: every worker serves every
//! language from one queue. Language-selective slowness is therefore always
//! about that language's compile cost and cache state, never about a subset of
//! workers being sick.

use axum::Json;
use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};

use crate::error::ApiResult;
use crate::state::AppState;

/// How far back to look. Long enough to be stable, short enough to reflect now.
const DEFAULT_WINDOW_MINS: i64 = 15;
const MAX_WINDOW_MINS: i64 = 24 * 60;

#[derive(Debug, Deserialize)]
pub struct HealthParams {
    /// Look-back window in minutes (default 15, max 1440).
    pub window_mins: Option<i64>,
}

#[derive(Serialize)]
pub struct LanguageHealth {
    pub language_id: u32,
    pub name: String,
    /// Terminal submissions seen in the window. 0 means "no data", not "healthy".
    pub samples: i64,
    /// Fraction of submissions that skipped the compile phase — i.e. hit the
    /// compile cache, or are an interpreted language with no compile at all.
    /// `null` when there are no samples. This is the field to gate an exam on.
    pub warm_ratio: Option<f64>,
    /// Median and p95 end-to-end wall seconds over the window.
    pub p50_wall: Option<f64>,
    pub p95_wall: Option<f64>,
    /// Fraction of submissions that came back as a non-verdict engine fault
    /// (`sandbox_failure` / `internal_error`). Anything above zero is an incident.
    pub fault_ratio: Option<f64>,
    /// `ok` | `cold` | `degraded` | `no_data` — see the endpoint description.
    pub state: &'static str,
}

#[derive(Serialize)]
pub struct LanguageHealthReport {
    pub window_mins: i64,
    /// True when no language is `degraded`. Gate an exam on this plus the
    /// per-language `warm_ratio` for the languages you are about to use.
    pub healthy: bool,
    pub languages: Vec<LanguageHealth>,
}

/// Any engine fault at all is degraded; a slow-but-cold language is `cold`, not
/// degraded, because that is a cache state the caller can fix by pre-warming.
fn classify(samples: i64, warm: f64, faults: f64) -> &'static str {
    if samples == 0 {
        "no_data"
    } else if faults > 0.0 {
        "degraded"
    } else if warm < 0.5 {
        "cold"
    } else {
        "ok"
    }
}

pub async fn languages(
    State(state): State<AppState>,
    Query(params): Query<HealthParams>,
) -> ApiResult<Json<LanguageHealthReport>> {
    let window = params
        .window_mins
        .unwrap_or(DEFAULT_WINDOW_MINS)
        .clamp(1, MAX_WINDOW_MINS);

    let rows = crate::db::language_health(state.pool(), window).await?;

    let mut languages: Vec<LanguageHealth> = state
        .languages()
        .list()
        .into_iter()
        .map(|spec| {
            let r = rows.iter().find(|r| r.language_id == spec.id as i32);
            match r {
                Some(r) if r.samples > 0 => {
                    let warm = r.warm as f64 / r.samples as f64;
                    let faults = r.faults as f64 / r.samples as f64;
                    LanguageHealth {
                        language_id: spec.id,
                        name: spec.name.clone(),
                        samples: r.samples,
                        warm_ratio: Some(warm),
                        p50_wall: r.p50_wall.map(|v| v as f64),
                        p95_wall: r.p95_wall.map(|v| v as f64),
                        fault_ratio: Some(faults),
                        state: classify(r.samples, warm, faults),
                    }
                }
                _ => LanguageHealth {
                    language_id: spec.id,
                    name: spec.name.clone(),
                    samples: 0,
                    warm_ratio: None,
                    p50_wall: None,
                    p95_wall: None,
                    fault_ratio: None,
                    state: "no_data",
                },
            }
        })
        .collect();
    languages.sort_by_key(|l| l.language_id);

    let healthy = languages.iter().all(|l| l.state != "degraded");
    Ok(Json(LanguageHealthReport {
        window_mins: window,
        healthy,
        languages,
    }))
}

#[utoipa::path(
    get, path = "/v1/health/languages", tag = "ops",
    params(("window_mins" = Option<i64>, Query, description = "Look-back window, default 15, max 1440")),
    summary = "Per-language health and compile-cache warmth",
    description = "Poll this before committing a timed exam to the engine.\n\n\
                   `state` per language:\n\
                   * `ok` — warm and fault-free; latency is steady state.\n\
                   * `cold` — under half of recent submissions skipped compilation, \
                     so first-run solutions are paying a full compile. Expected, not \
                     a fault: submit each solution once beforehand to warm it.\n\
                   * `degraded` — engine faults observed in the window. Do not start an exam.\n\
                   * `no_data` — nothing ran in the window; absence of evidence, not health.\n\n\
                   There are no per-language workers — every worker serves every \
                   language from one queue — so language-selective slowness is \
                   always compile cost and cache state, never a sick subset of workers.",
    responses((status = 200, description = "Per-language health")),
)]
#[allow(dead_code)]
pub fn languages_doc() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classification_rules() {
        assert_eq!(classify(0, 0.0, 0.0), "no_data");
        // A single engine fault outranks everything else.
        assert_eq!(classify(100, 1.0, 0.01), "degraded");
        // Cold cache is a caller-fixable state, not a fault.
        assert_eq!(classify(100, 0.2, 0.0), "cold");
        assert_eq!(classify(100, 0.9, 0.0), "ok");
        // Exactly at the warm threshold counts as ok.
        assert_eq!(classify(100, 0.5, 0.0), "ok");
    }
}
