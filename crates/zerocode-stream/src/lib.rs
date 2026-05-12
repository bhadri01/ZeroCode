//! Real-time submission events delivered via Postgres `LISTEN/NOTIFY`.
//!
//! Two channels:
//! - `zerocode.jobs` — published by the API on `INSERT INTO submissions`,
//!   consumed by workers so they wake immediately (sub-5 ms dispatch vs ~250 ms
//!   for naive polling).
//! - `zerocode.events.<token>` — per-submission lifecycle events (`processing`,
//!   `stdout_chunk`, `stderr_chunk`, `finished`) published by the worker,
//!   consumed by the API to drive SSE/`?wait=true` long-polling.
//!
//! Polling fallback is kept on both sides: if the LISTEN connection drops, we
//! reconnect and keep working in 2-second poll mode meanwhile.

pub mod events;
pub mod jobs;

pub use events::{Event, EventStream, publish_event};
pub use jobs::{JobNotifier, listen_for_jobs};
