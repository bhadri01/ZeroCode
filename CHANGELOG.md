# Changelog

All notable changes to ZeroCode. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [SemVer](https://semver.org/) once `0.1.0` is tagged.

Pre-release work is grouped under `Unreleased` and tagged by plan phase. See
`~/.claude/plans/what-is-in-this-transient-engelbart.md` for the full design.

## [Unreleased]

### CI hardening — close the gaps that hid two v1 bugs

Both bugs found during the v2 work — the PG16 `BINARY` keyword regression
(fixed in `ae57bfd`) and the `tower_governor` missing `ConnectInfo` (fixed
in `9a8c6a3`) — got past CI for the same reason: the existing CI runs
`cargo test`, but no job applies migrations to a live DB, and no job hits
an authenticated REST/gRPC route over HTTP. This change closes both gaps.

#### Changed
- **`integration` CI job** now actually applies migrations before running
  the test suite:
  - New `Apply migrations` step runs `cargo run -p zerocode-migrate`
    against the `postgres:16` service container. A migration that fails
    on PG16 (the `BINARY`-keyword class of bug) now fails CI hard
    instead of getting swallowed at runtime by warn-and-continue cache
    error handling.
  - New `Verify expected schema` step `psql \d`'s key tables and greps
    for the columns the worker queries by name (`batch_id` on
    `submissions`, `artifact_data` on `compile_artifacts`). Catches the
    case where `cargo run -p zerocode-migrate` exits 0 but the migration
    silently skipped a CREATE TABLE.
  - Job-level env now sets `SQLX_OFFLINE=false` so the `query!` macros
    validate against the live schema, not the cached `.sqlx/` snapshot.
    A column rename that wasn't propagated through `cargo sqlx prepare`
    now blows up CI instead of waiting for a live-DB user to notice.

#### Added
- **`smoke-test` CI job** runs `scripts/smoke-test.sh` end-to-end:
  builds the runner + service images, brings up the full docker-compose
  stack (postgres → migrate → api → worker → runner rootfs init), and
  hits authenticated REST routes plus gRPC reflection + GetHealth.
  This is the only job that exercises HTTP over a real TCP socket, so
  it's the regression guard for the bug class that the `tower_governor`
  `ConnectInfo` issue belonged to — runtime-wiring bugs that unit tests
  can't reproduce because `tower::ServiceExt::oneshot` bypasses the
  `into_make_service*` adapter.
- `grpcurl` install step in the smoke-test job so the gRPC sub-check
  actually exercises the path (otherwise the script skips it).

#### Why not a Rust unit test for the governor bug?
The bug is specifically about how the router gets *served*, not about
the router itself. `tower::ServiceExt::oneshot` against the router
short-circuits the `into_make_service*` adapter, so the bug doesn't
reproduce at the unit-test layer without standing up a real TCP server.
The CI smoke-test does that — keeping a separate unit-level guard
would duplicate effort and fail to repro the actual failure mode.

---

### v2 — WasmSandbox dispatch wiring (TieredSandbox + raw-wasm language)

#### Added
- **`SandboxTier` enum** in `zerocode-core` (`Native` | `Wasm`, defaults
  `Native`, `#[serde(rename_all = "snake_case")]`). New field
  `LanguageSpec.tier` with `#[serde(default)]` so every existing TOML
  entry continues to deserialize unchanged.
- **`TieredSandbox`** wrapper in `worker/sandbox_select.rs`. Holds an
  `Option<Arc<dyn Sandbox>>` per tier (built at startup based on cargo
  features) and dispatches each job to the matching backend by inspecting
  `job.language.tier`. Returns `SandboxError::NotImplemented` (logged
  with token + language_id) when the requested tier wasn't built in.
- **`zerocode-worker` `wasm` cargo feature**: forwards to
  `zerocode-sandbox/wasm` so production builds opt into WasmSandbox
  alongside native explicitly. Default features unchanged.
- **`raw-wasm` language** (`id=200`, `tier="wasm"`) in
  `runners/languages.toml`. `source_code` is interpreted as the
  pre-compiled `.wasm` blob; no compile_cmd / run_cmd. Default limits
  tuned for WASM (`cpu_time=2s`, `wall_time=5s`, `memory_mb=64`).
- **Three new dispatch unit tests** in `worker/sandbox_select.rs`
  (mock-based, no real sandboxes needed):
  - `routes_native_tier_to_native_backend`
  - `routes_wasm_tier_to_wasm_backend`
  - `returns_not_implemented_when_tier_missing`
- **New registry test** `raw_wasm_is_registered_with_wasm_tier` confirms
  the TOML entry round-trips through serde with the correct tier.
- Updated `total_language_count` assertion to 42 (was 41 — raw-wasm
  added).

#### Changed
- Worker dispatch now returns `Arc<TieredSandbox>` instead of a single
  backend. `pick()` is now feature-axis-agnostic; the per-language axis
  is decided at runtime via `LanguageSpec.tier`.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 85 | +2 (registry: +1 raw-wasm test, +1 count update; worker dispatch tests gated on wasm feature) |
| macOS (`--features zerocode-worker/wasm zerocode-sandbox/wasm`) | 85 | 87 | +2 (WasmSandbox + dispatch on top of native) |

---

### v2 — WASM tier (WasmSandbox)

#### Added
- **`WasmSandbox`** ([crates/zerocode-sandbox/src/wasm.rs]) — new
  cross-platform `Sandbox` implementation backed by `wasmtime 27` + WASI
  preview1. Accepts a pre-compiled `.wasm` blob in
  `SandboxJob.source_code`, runs `_start` under three orthogonal limits:
  - **Wall time**: tokio `timeout` around the future.
  - **CPU**: wasmtime fuel metering (`consume_fuel(true)`) with a fuel
    budget ≈ `cpu_time × 200_000_000`.
  - **Memory**: `StoreLimits::memory_size` capped to `memory_mb × 1MB`.
  Stdin from `SandboxJob.stdin` is piped in via `MemoryInputPipe`;
  stdout/stderr captured to `MemoryOutputPipe` with `max_stdout` /
  `max_stderr` caps. No filesystem access, no env vars, no preopened
  dirs — defense-in-depth at the WASI boundary.
- **`wasm` feature flag** on `zerocode-sandbox` — gates the wasmtime +
  wasmtime-wasi deps so default builds stay slim. Re-exported as
  `zerocode_sandbox::WasmSandbox` when enabled.
- **Two unit tests** (`wasm::tests`):
  - `hello_world_wasm_runs_and_captures_stdout` — inline `.wat` builds a
    minimal WASI module that writes `hello-from-wasm\n` via `fd_write`;
    asserts `Status::Accepted`, exit_code=0, exact stdout bytes.
  - `invalid_wasm_returns_error` — non-wasm bytes return
    `SandboxError::Internal`.
- **Workspace deps** (unconditional, deduplicated by feature gating in
  `zerocode-sandbox`):
  - `wasmtime = "27"` (default-features off, `cranelift+runtime+async`).
  - `wasmtime-wasi = "27"` (preview1 sync API).
- **Dev-deps**: `wat = "1"` so tests can embed inline `.wat` text instead
  of checking compiled `.wasm` bytes into the repo.

#### Trade-offs vs `NativeSandbox`
- **Pros**: cross-platform (works on macOS dev hosts), single-process
  isolation via wasmtime, no kernel feature requirements, far cheaper
  cold-start than `pivot_root` + cgroup creation.
- **Cons**: weaker resource accounting (fuel ≠ CPU time; conversion
  factor calibrated empirically); no peak-memory surfacing (`memory_kb=0`
  in results); no path-based filesystem access (programs that need to
  write must use stdout/stderr).

#### Status
v2 TODO marked `[~]` (partial). The WasmSandbox runs `.wasm` today but the
per-language compile-to-wasm pipelines (Rust/Go/C/C++ via wasi-sdk),
`cwasm` AOT pre-compilation, and worker `sandbox_select.rs` routing are
follow-up work upstream of the sandbox.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 83 | — (wasm feature not default) |
| macOS (`--features zerocode-sandbox/wasm`) | 83 | 85 | +2 (WasmSandbox) |

---

### v2 gRPC polish — reflection + Dockerfile + smoke-test coverage

#### Added
- **gRPC reflection** via `tonic-reflection 0.12`:
  - `build.rs` now emits a `FileDescriptorSet` to `OUT_DIR/zerocode_descriptor.bin`.
  - `grpc.rs` exposes the bytes as `FILE_DESCRIPTOR_SET` (`include_bytes!`).
  - `main.rs` registers `grpc.reflection.v1.ServerReflection` alongside the
    ZeroCode service so clients can discover schemas without the `.proto`:
    `grpcurl -plaintext localhost:9091 list / describe`.
- **`Dockerfile.service` builder stage** now installs `protobuf-compiler`
  (Debian package) alongside `musl-tools` + `pkg-config`. Required for the
  `tonic-build` step on production image rebuilds.
- **`Dockerfile.service`** now `EXPOSE`s port 9091 in addition to 8080.
- **`docker-compose.yml`** api service: `ZEROCODE_GRPC_BIND=0.0.0.0:9091` env
  and `9091:9091` port mapping so dev compose serves both REST and gRPC.
- **`scripts/smoke-test.sh`** test 4g: `gRPC: reflection + GetHealth`.
  Calls `grpcurl localhost:9091 list` (verifies reflection advertises the
  service) and `GetHealth` (verifies the unary call returns `status="ok"`).
  Skipped (counted as pass) when `grpcurl` is not on the dev host's PATH so
  the core smoke test doesn't fail in CI environments without it. `DIM`
  ANSI escape added for the SKIP message.

#### Verified
- `grpcurl -plaintext localhost:9091 list` →
  `grpc.reflection.v1.ServerReflection` + `zerocode.v2.ZeroCode`.
- `grpcurl -plaintext localhost:9091 describe zerocode.v2.ZeroCode` →
  full service definition with comments.
- `grpcurl -plaintext -d '{}' localhost:9091 zerocode.v2.ZeroCode/GetHealth`
  → `{status:"ok", ready:true}` without the `-proto` flag.

---

### v2 — gRPC API alongside REST

#### Added
- **`zerocode.v2.ZeroCode` gRPC service**:
  - `CreateSubmission` — validates inputs (64 KB source/stdin caps),
    resolves limits against per-language defaults + global ceiling,
    honours idempotency keys with the same blake3 hash discriminant as
    REST, inserts and `pg_notify`s the worker. Returns
    `{token, status: "queued"}`.
  - `GetSubmission` — fetches by ULID token; returns the full
    `SubmissionView` mirror with status text, status_detail_json,
    stdout/stderr/compile_output bytes, exit code (-1 sentinel for absent),
    signal name, CPU/wall time, memory, RFC3339 timestamps.
  - `ListLanguages` — emits the in-memory registry as repeated
    `Language` messages.
  - `GetHealth` — unauthenticated; returns `status="ok"`, `ready`
    (DB ping + queue under backpressure threshold), and current
    `queue_depth`.
- **Proto file** at `crates/zerocode-api/proto/zerocode.proto` (proto3,
  package `zerocode.v2`). Compiled at build time via `tonic-build`
  (added to `build-dependencies`); generated code lives in `OUT_DIR` and
  is included from `src/grpc.rs` with `tonic::include_proto!("zerocode.v2")`.
- **Server task** spawned from `main.rs`; bind address controlled by
  `ZEROCODE_GRPC_BIND` (default `0.0.0.0:9091`). Set to `off` or empty
  to run REST-only. Server shuts down gracefully on the same SIGTERM/
  SIGINT signal as the REST server.
- **Auth**: bearer-token check via `authorization` metadata header on
  every RPC except `GetHealth`. Constant-time compare against
  `ZEROCODE_API_KEY`, same as the REST middleware.
- **Metrics**: `zerocode_grpc_create_submission_total` counter on every
  successful gRPC create. Per-protocol metric breakdown for scaling
  insight.

#### Verified end-to-end
- `grpcurl GetHealth` (no auth) → `{status:"ok", ready:true}`.
- `grpcurl ListLanguages` (no auth) → `Unauthenticated`.
- `grpcurl ListLanguages` (bearer dev) → 41 language entries.
- `grpcurl CreateSubmission` → ULID token returned.
- `grpcurl GetSubmission` on that token → full view with limits, status,
  RFC3339 timestamps.
- `cargo test --workspace` — 83 tests pass.

#### Dependencies
- Added workspace deps: `tonic = "0.12"`, `tonic-build = "0.12"`,
  `prost = "0.13"`, `prost-types = "0.13"`.
- Requires `protoc` on the build host. Dev: `brew install protobuf`.
  Production builders pull it via the rust:1-bookworm image's
  `apt-get install protobuf-compiler` step (added separately when
  Docker images are rebuilt).

---

### v2 — test-case batching + tower_governor key-extraction bug fix

#### Added
- **`POST /v1/submissions/batch`** ([crates/zerocode-api/src/routes/batches.rs]):
  accepts one source program plus 1–100 stdin test cases, creates N
  independent submission rows tied by a shared `batch_id` ULID. Workers
  process each as a normal submission — per-case result caching, sweeping,
  webhooks, retention all keep working unchanged. Returns
  `{batch_id, count, tokens, status}` with `201 Created`.
- **`GET /v1/batches/{batch_id}`**: returns aggregated items + status summary
  (`{total, queued, processing, accepted, failed}`).
- **Migration `20260513000001_batch_id.sql`**: adds `batch_id TEXT` column to
  `submissions` + partial index on non-NULL `batch_id` so single-shot
  submissions pay no index cost.
- **OpenAPI annotations** for both endpoints + 5 new schemas
  (`BatchRequestBody`, `BatchTestCaseBody`, `BatchAckBody`, `BatchSummaryBody`,
  `BatchViewBody`). Spec at `/v1/openapi.json` now has 9 paths + 15 schemas.
- **`zerocode_batches_created_total` counter**: counted per batch (`count`
  bumps the existing `zerocode_submissions_created_total` by N).

#### Fixed
- **`tower_governor` "Unable To Extract Key!" bug** (`crates/zerocode-api/src/main.rs`):
  axum's `into_make_service()` does NOT attach `ConnectInfo<SocketAddr>`,
  which `tower_governor`'s default `PeerIpKeyExtractor` requires.
  Switched to `into_make_service_with_connect_info::<SocketAddr>()` so the
  rate limiter can derive the per-IP bucket. Without this fix every
  authenticated request returned `500 Unable To Extract Key!`. This was a
  pre-existing v1 bug surfaced by live smoke-testing the new batch endpoint.

#### Verified end-to-end
- Created a batch of 3 Python submissions via curl → received 3 ULIDs.
- Polled `/v1/batches/{id}` → got 3 items in `queued` state with correct summary.
- Validation errors fire correctly (`empty test_cases`, unknown batch returns 404).
- `cargo test --workspace` — 83 tests pass (parity).
- `.sqlx/` regenerated (19 entries, +1 for `list_batch`).

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 83 | — |

---

### v2 continuation — auto-scaling metrics + SDK generation script

#### Added
- **`zerocode_pending_jobs` gauge** (worker): new background task
  `queue_depth::run` polls `SELECT count(*) WHERE status='queued'` every 5 s
  and publishes the result as a Prometheus gauge. Primary auto-scaling input —
  combined with the existing `zerocode_active_sandboxes` and
  `zerocode_worker_parallelism` gauges, an HPA / KEDA scaler can compute
  utilisation and queue ratio for scale-up / scale-down decisions. Wired
  into `main.rs` with a clean shutdown notifier.
- **`scripts/generate-sdks.sh`**: Dockerised `openapi-generator-cli` driver
  that pulls the spec from a running API (`/v1/openapi.json`) and emits
  Python + TypeScript-axios SDKs by default. Pass `--generators=go,java,...`
  for other targets, `--api-url=...` for a remote spec source, `--out=...`
  for the output directory.

#### Updated TODO status (no code change)
- Per-language minimal runner images: marked **done** for Core 7 (existing
  `runners/Dockerfile.slim` already provides 7 targets + size table).
- Auto-scaling worker pool: marked **in-progress** — signals exposed,
  consumer (HPA/KEDA configuration) is operator-side work.
- OpenAPI SDKs: marked **done** — driver script added.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 83 | — |

---

### v2 observability — OTLP tracing export + OpenAPI 3.1 spec

#### Added
- **OTLP tracing export** in both `zerocode-api` and `zerocode-worker`:
  - New `telemetry.rs` module in each binary installs an
    `opentelemetry-otlp` batch span exporter (tonic/gRPC) when
    `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Unset/empty preserves the existing
    JSON-stdout-only behavior.
  - W3C `TraceContextPropagator` registered as the global text-map
    propagator so incoming `traceparent` headers attach to spans.
  - HTTP request spans from the existing `tower-http` `TraceLayer` (with
    `SanitizedMakeSpan`) flow through to the OTLP exporter without any
    additional wiring — `tracing-opentelemetry` instruments every tracing
    span emitted in the process.
  - Service metadata attached: `service.name` (`zerocode-api` / `zerocode-worker`)
    and `service.version` (crate version at build time).
  - Provider shutdown wired into main's exit path so in-flight spans are
    flushed.
- **OpenAPI 3.1 spec** at `GET /v1/openapi.json`:
  - utoipa-based `ApiDoc` aggregates 7 endpoints (`/v1/health`, `/v1/ready`,
    `/v1/about`, `/v1/languages`, `/v1/submissions` POST/GET, single-submission
    GET + stream) and 10 component schemas.
  - Bearer-token security scheme declared on protected routes.
  - Wire-shape schemas defined in `openapi.rs` so existing handler types
    stay free of utoipa derives (decoupling preserved; drift cost paid in
    code review). Spec is ready to feed into `openapi-generator` /
    `oapi-codegen` for SDK generation.
- **Jaeger 1.60 all-in-one** in `deploy/docker-compose.dev.yml`:
  - UI at `http://localhost:16686`, OTLP gRPC ingest on `:4317`,
    OTLP HTTP on `:4318`. `COLLECTOR_OTLP_ENABLED=true`.
- **`.env.example`** documents `OTEL_EXPORTER_OTLP_ENDPOINT`.

#### Verified
- Submitting a request to a running `zerocode-api` with
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` set produces traces
  that appear in Jaeger under the `zerocode-api` service.
- `GET /v1/openapi.json` returns a valid OpenAPI 3.1 document with 7 paths,
  10 component schemas, bearer security definitions, and complete
  response codes per endpoint.
- `cargo test --workspace` — 83 tests pass (parity maintained).

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 83 | — |

---

### Compile-time SQL validation — `sqlx::query` → `sqlx::query!` macros

#### Changed
- **All 19 runtime `sqlx::query()` call sites** across `zerocode-api`,
  `zerocode-worker`, `zerocode-cache`, and `zerocode-stream` converted to the
  compile-time `query!` / `query_scalar!` macros. SQL is now validated against
  the live schema at `cargo check` time and type-mismatches surface as compile
  errors instead of runtime panics.
- **`.sqlx/` offline cache** populated (18 entries — the two `pg_notify`
  queries collapse to a single entry since they share SQL text) and committed
  to the repository so CI can build with `SQLX_OFFLINE=true` without a live
  Postgres. `.gitignore` updated to no longer ignore `.sqlx/`.
- **Compose project name** set to `zerocode` (via `name: zerocode` in
  `deploy/docker-compose.yml`) so containers/volumes/networks no longer carry
  the directory-derived `deploy_` prefix.

#### Removed
- `sqlx::Row` import + per-column `row.get::<T, _>("col")` access pattern in
  `crates/zerocode-api/src/db.rs`, `crates/zerocode-worker/src/db.rs`,
  `crates/zerocode-cache/src/compile.rs` — replaced by typed struct fields
  generated by the `query!` macro.
- Unused `chrono::{DateTime, Utc}` import + dead `_unused()` smoke fn in
  `crates/zerocode-worker/src/db.rs`.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (`SQLX_OFFLINE=true`) | 83 | 83 | — (parity maintained) |

---

### PostgreSQL 16 compatibility fix — compile_artifacts.binary → artifact_data

#### Fixed
- **Migration `20260512000001_init.sql`**: rename `compile_artifacts.binary`
  column to `artifact_data`. PostgreSQL 16 added `BINARY` as a type-function-
  name keyword, so the unquoted column name caused a silent
  `syntax error at or near "binary"` when the migration was applied against
  `postgres:16` — the table was never created. The worker's compile cache
  treated the resulting DB errors as cache-misses (warn-and-continue), so
  deployments kept working but every compiled-language submission paid the
  full compile cost. Cache hits are now possible.
- `crates/zerocode-cache/src/compile.rs`: SELECT/INSERT queries and
  `CompileArtifact` struct field updated to `artifact_data`.
- `crates/zerocode-worker/src/runner.rs`: cache-hit binary access updated.

#### Added
- **`deploy/docker-compose.dev.yml`**: now exposes Postgres on host port 5433
  so dev tooling (`sqlx-cli`, `cargo run -p zerocode-api`, `psql`, etc.) can
  reach the dev DB without colliding with a host-local Postgres on 5432.

---

### Metrics & telemetry integration, multi-arch Dockerfile, smoke-test polish

#### Added
- **Prometheus metrics in API**: `metrics_exporter_prometheus` recorder installed at
  startup; `metrics-process` collector emits per-process CPU, RSS, and FD-count gauges;
  named counter descriptions registered for `zerocode_submissions_created_total`,
  `zerocode_result_cache_hits_total`, and `zerocode_result_cache_misses_total`.
  Exposed via existing `GET /metrics` route.
- **Prometheus metrics in worker**: identical recorder + `metrics-process` collector
  on the worker's port-9090 HTTP server. Named counters for
  `zerocode_submissions_processed_total`, `zerocode_compile_cache_hits_total`,
  `zerocode_compile_cache_misses_total`, and `zerocode_webhook_deliveries_total`.
- **Multi-arch service image** (`deploy/Dockerfile.service`): `ARG TARGETARCH`
  selects `x86_64-unknown-linux-musl` or `aarch64-unknown-linux-musl` at build time;
  compiled binaries staged into `/out/` for arch-neutral `COPY` in the final stage.
  Enables `docker buildx build --platform linux/amd64,linux/arm64`.
- **Smoke-test runner pre-check** (`scripts/smoke-test.sh`): the script now checks
  whether `zerocode-runner:dev` exists with `docker image inspect` before calling
  `docker compose up`. If missing, builds `runners/Dockerfile.slim --target full`
  automatically, preventing a silent startup failure when the image cache is cold.

#### Fixed
- Worker `main.rs`: `::metrics::gauge!` calls now use the fully-qualified crate path
  to prevent ambiguity with the local `metrics` module (`src/metrics.rs`).
- `rustfmt` formatting applied to `crates/zerocode-api/src/main.rs`,
  `crates/zerocode-worker/src/main.rs`, and `crates/zerocode-worker/src/metrics.rs`.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (default features) | 83 | 83 | — (no new tests; coverage unchanged) |
| Linux (`--features edge-cases`) | +63 | +63 | — |

---

### Compile cache, sandbox hardening & CI expansion

#### Added
- **Separate compile stderr pipe**: 4th pipe pair (`compile_rd`, `compile_wr`)
  in `exec.rs` captures compiler diagnostics independently from run-phase
  stderr. Compile sub-child redirects stderr → compile pipe via `dup2`;
  parent reads via dedicated thread. `triage::finish()` auto-populates
  `compile_output` from `raw.compile_stderr` when non-empty — successful
  compiles now surface warnings into `compile_output`.
- **Capabilities verification tests**: `all_capabilities_dropped` reads
  `/proc/self/status` CapInh/CapPrm/CapEff/CapBnd/CapAmb and asserts all
  zero; `no_new_privs_is_set` calls `prctl(PR_GET_NO_NEW_PRIVS)` and asserts 1.
- **Compile-artifact cache worker integration**:
  - `CompileCache` wired into `Runner` struct in `zerocode-worker`.
  - Cache key computed from `(language_id, source_code)` before
    `sandbox.execute()`.
  - On hit: binary injected via `SandboxJob.cached_binary` → scratch dir →
    `/box/prog`; compile phase skipped entirely.
  - On miss + successful compile: binary extracted via bind-mounted exchange
    file at `/box/.artifact` → `SandboxResult.compiled_binary` →
    `CompileCache::insert()`.
- **Ops edge-case tests** (`tests/edge_cases/ops.rs`): 7 sandbox-level
  integration tests (concurrent load, large source, empty stdin EOF, env
  substitution, unique cgroup paths, wall-time precision, zombie reaping)
  + 5 API ops tests (backpressure, view serialization, cached flag, params).
- **Load test script** (`scripts/load-test.sh`): `oha`-based 3-phase load
  test (warm-up 10s, sustained 60s at 100 RPS, cache-hit burst).
- **Nightly CI** (`.github/workflows/nightly.yml`): kernel version matrix
  (ubuntu:22.04 / 24.04 / debian:bookworm), benchmark job, Docker build.
- **Integration CI job** in `.github/workflows/ci.yml`: Postgres service
  container + workspace test run.
- **Per-language Docker tags**: `runners/Dockerfile.slim` multi-stage with
  8 targets (base, python, node, go, rust, c-cpp, java, full);
  `scripts/build-runner-tags.sh` builds all tags and prints size table.
- **sqlx offline mode prep**: `.sqlx/` directory, `SQLX_OFFLINE=true` in
  `.env.example`. Ready for `cargo sqlx prepare` when CI provisions a DB.

#### Changed
- `SandboxJob` gains `cached_binary: Option<Bytes>` field.
- `SandboxResult` gains `compiled_binary: Option<Bytes>` (`#[serde(skip)]`).
- `exec::run()` and `run_child()` accept `has_cached_binary` flag.
- `pivot_into_runner()` copies cached binary from scratch to `/box/prog`
  (chmod +x) and sets up bind-mounted `.artifact` exchange file.
- `triage::classify()` compile-failed path now reads `raw.compile_stderr`
  instead of `raw.stderr` for compiler diagnostics.

#### Test count
| Env | Before | After | Delta |
|---|---|---|---|
| macOS (default features) | 78 | 83 | +5 (API ops tests) |
| Linux (`--features edge-cases`) | +54 | +63 | +9 (ops + capsh + no_new_privs) |

### DB wiring, benchmarks & cleanup

#### Added
- **`enable_network` column** wired end-to-end:
  - Migration `20260512000002_enable_network.sql` adds `BOOLEAN NOT NULL DEFAULT FALSE`.
  - API `insert_submission` writes the field; `fetch_submission` and
    `list_submissions` read it back.
  - Worker `claim_next` reads it into `ResourceLimits`.
  - `ResourceLimits::validate` rejects `enable_network: true` when the ceiling
    says `false`.
  - Two new unit tests: `enable_network_rejected_when_ceiling_false`,
    `enable_network_allowed_when_ceiling_true`.
- **`cargo bench` suite** with Criterion 0.5:
  - `zerocode-core/benches/core_ops.rs` (5 benches): ULID token generation,
    token parse roundtrip, Payload from 64 KB bytes, base64 decode 4 KB,
    ResourceLimits validate.
  - `zerocode-cache/benches/cache_key.rs` (4 benches): result key at 14 B /
    4 KB / 128 KB source sizes, compile key at 4 KB.
  - Run with `cargo bench -p zerocode-core` / `cargo bench -p zerocode-cache`.

#### Changed
- **`.gitignore`**: removed stale `Cargo.lock.bak` entry.
- **`TODO.md`**: fixed stale Phase 2 cross-references (pivot_root, /box tmpfs
  were done in Phase 2.5 but still showed `[ ]`).

#### Test count
| Env | After CI/tests | After DB wiring | Delta |
|---|---|---|---|
| macOS (default features) | 76 | 78 | +2 (enable_network validation) |

### CI, tests & polish (post-hardening)

#### Added
- **GitHub Actions CI** (`.github/workflows/ci.yml`): 7-job workflow — check,
  test, clippy (warnings-as-errors), rustfmt, cargo-deny, Docker runner image
  build, Docker service image build. All pinned to Rust 1.85 via
  `dtolnay/rust-toolchain` with `Swatinem/rust-cache`.
- **End-to-end smoke test** (`scripts/smoke-test.sh`): brings up the full
  docker-compose stack, runs 6 test cases (health, readiness, Python hello,
  wait=true, streaming, bad auth), tears down. Colored output with pass/fail.
- **54 edge-case tests for v1.5 languages** (Batch A–G), gated behind
  `#[cfg(all(target_os = "linux", feature = "edge-cases"))]`:
  - `batch_a.rs` (21 tests): Bash, Lua, Perl, Ruby, R, PHP, TypeScript —
    hello world + infinite loop TLE + fork bomb per language.
  - `batch_b.rs` (12 tests): Fortran, Pascal, D, Objective-C, Assembly, Ada —
    hello world + compile error per language.
  - `batch_c.rs` (4 tests): Kotlin, Scala, Groovy, Clojure — hello world.
  - `batch_d.rs` (5 tests): Haskell, OCaml, Erlang, Elixir, Common Lisp —
    hello world.
  - `batch_efg.rs` (12 tests): C#, F#, COBOL, Prolog, Swift, Octave, SQL,
    Zig, Nim, Crystal, Dart, Julia — hello world.
- **12 API-level edge case tests** in `routes/submissions.rs`: IPv6 SSRF
  validation (loopback, link-local, ULA), base64 field parsing, idempotency
  hash (determinism, language sensitivity, stdin sensitivity, None-vs-empty
  stdin discriminant).
- **7 webhook unit tests** in `worker/webhook.rs`: HMAC-SHA256 determinism,
  body and secret sensitivity, consumer-side verification, retry count
  assertions, jitter bounds.
- **Harness expanded** with 30 new language ID constants for Batch A–G.

#### Changed
- **`SanitizedMakeSpan`** in `routes/mod.rs` replaces the default `TraceLayer`
  span maker — logs method, URI, version but omits the `Authorization` header
  so API keys never appear in trace spans.
- **Idempotency hash** now uses a discriminant byte (`0x01` for `Some`, `0x00`
  for `None`) so `stdin: None` and `stdin: Some("")` produce different hashes.

#### Test count
| Env | After hardening | After CI/tests | Delta |
|---|---|---|---|
| macOS (default features) | 57 | 76 | +19 (API + webhook + hash tests) |
| Linux (`--features edge-cases`) | — | +54 | (Batch A–G edge cases) |

### Operational hardening (post-v1.5)

#### Added
- **Retention enforcer** (`crates/zerocode-worker/src/retention.rs`): periodic
  background task (5 min cadence) with two TTLs:
  - **Payload TTL** (default 1 h, `ZEROCODE_PAYLOAD_TTL_SECS`): NULLs out
    `source_code`, `stdin`, `stdout`, `stderr`, `compile_output` on finished
    rows. The audit stub (token, language, status, timings) stays for the full
    row TTL.
  - **Row TTL** (default 24 h, `ZEROCODE_RETENTION_HOURS`): deletes finished
    rows past the retention window.
- **OOM score adjustment** (`reaper::set_oom_score_adj`): writes `-500` to
  `/proc/self/oom_score_adj` on Linux so the kernel preferentially kills
  sandbox children under host memory pressure rather than the worker process.
- **`base64_encoded` on POST**: when `base64_encoded: true` in the request body,
  `source_code` and `stdin` are decoded from base64 strings before validation
  and storage. Judge0-compatible convenience for binary payloads.
- **`?base64_encoded=true` on GET**: when set as a query param on
  `GET /v1/submissions/{token}`, all output fields (`stdout`, `stderr`,
  `compile_output`) are returned as base64-encoded strings instead of the
  default auto-detect format.
- **`deny.toml`** for `cargo-deny`: license allowlist (MIT, Apache-2.0, BSD,
  ISC, etc.), RustSec advisory DB vulnerability checks, ban on `openssl-sys`
  (prefer rustls), wildcard dependency ban, unknown registry/git deny.

#### Test count
| Env | After v1.5 | After hardening | Delta |
|---|---|---|---|
| macOS (default features) | 56 | 57 | +1 (retention config_defaults) |

### v1.5 — Judge0 catalog parity (41 languages)

#### Added
- **34 new languages** across 7 batches, bringing the total from 7 to 41:
  - **Batch A — Interpreted** (ids 100–106): Bash, Lua, Perl, Ruby, R, PHP,
    TypeScript (via globally pre-installed `tsx`).
  - **Batch B — Compiled (GCC family)** (ids 110–115): Fortran (gfortran-14),
    Pascal (FPC), D (LDC), Objective-C (clang), Assembly (NASM+ld), Ada (GNAT).
  - **Batch C — JVM** (ids 120–123): Kotlin 2.1, Scala 3.5, Groovy, Clojure.
    All carry `JAVA_TOOL_OPTIONS` with `${jvm_heap_mb}` and elevated
    `default_limits` / `compile_limits` matching Java's JVM profile.
  - **Batch D — Functional** (ids 130–134): Haskell (GHC), OCaml, Erlang (OTP),
    Elixir, Common Lisp (SBCL).
  - **Batch E — .NET** (ids 140–141): C# and F# via .NET 9 SDK.
    `DOTNET_CLI_TELEMETRY_OPTOUT=1` set in env.
  - **Batch F — Niche** (ids 150–154): COBOL (GnuCOBOL), Prolog (SWI-Prolog),
    Swift 6, Octave 9, SQL (SQLite3).
  - **Batch G — Modern** (ids 160–164): Zig 0.13, Nim, Crystal, Dart 3.6,
    Julia 1.11.
- **`runners/Dockerfile`** expanded with all toolchains: apt packages for
  Batch A–D/F/G plus tarball installs for Kotlin, Scala 3, .NET 9, Swift 6,
  Zig, Dart, and Julia. TypeScript via `npm install -g tsx`.
- **16 registry integration tests** covering all batches: `batch_a_languages_present_and_interpreted`,
  `batch_b_compiled_languages_present`, `batch_c_jvm_languages_present`,
  `batch_d_functional_languages_present`, `batch_efg_languages_present`,
  `total_language_count` (asserts 41), `typescript_spec_uses_tsx_runner`.
  Updated `compiled_languages_have_both_compile_and_run_cmd` and
  `interpreted_languages_have_no_compile_cmd` to cover all new language IDs.

#### Test count
| Env | After Phase 5 | After v1.5 | Delta |
|---|---|---|---|
| macOS (default features) | 49 | 56 | +7 (registry tests for Batches A–G) |

### Phase 5 — Threat model + docs + hardening

#### Added
- **`docs/THREAT_MODEL.md`** (339 lines) -- STRIDE analysis of the full system.
  Trust boundary diagram (client -> API -> Postgres -> worker -> sandbox),
  per-category threat enumeration with mitigations traced to source files,
  defense-in-depth layer inventory (11 layers), known v1 limitations (9 items),
  and analysis of Judge0's three 2024 CVEs (CVE-2024-28185, CVE-2024-28189,
  CVE-2024-29021) with structural mitigation explanations.
- **`docs/DEPLOY.md`** (494 lines) -- production deployment guide. Host
  requirement checks with copy-pasteable commands (kernel version, cgroup v2,
  user namespaces), environment variable reference tables for API and worker,
  Docker Compose quickstart, runner rootfs setup, TLS termination configs
  (Caddy, nginx, Traefik), cgroup delegation (systemd and manual), and
  troubleshooting section for 5 common failure modes.
- **`docs/ARCHITECTURE.md`** (318 lines) -- implementation-aligned architecture
  document. System overview ASCII diagram with SSE streaming and LISTEN/NOTIFY
  channels, crate dependency map, 11-step submission lifecycle, fork/exec
  sandbox sequence with two-pipe handshake, performance architecture (result
  cache, compile cache, dispatch), container image strategy, and v1 language
  table sourced from `runners/languages.toml`.

#### Changed
- **README.md** rewritten -- API reference table, supported languages table,
  submit-and-wait + SSE streaming examples, architecture overview, project
  layout, 8-layer security summary, testing instructions.
- **`cargo clippy --workspace -- -D warnings`** now passes clean. Fixed:
  `dead_code` on `ApiConfig::bind` and unused `ApiError` variants (allow
  attributes), doc lazy continuation in `worker/db.rs`, needless borrows in
  streaming.rs / submissions.rs / runner.rs, needless `Ok()?` wrapper in
  `wait_for_completion`, useless `.into_iter()` in webhook.rs.

### Phase 4.6 — Performance hot path

#### Added
- **Result cache** (`moka` in-process LRU, 10k entries, 5 min TTL) wired into
  the API's `POST /v1/submissions` path. Cache key is
  `blake3(language_id || source || stdin || limits)`. On cache hit, the API
  returns a `CachedSubmissionView` immediately without touching the queue.
  Cache is populated when `?wait=true` sees a terminal result. Stored in
  `AppState` as `ResultCache` with accessor `state.result_cache()`.
- **SSE streaming endpoint** `GET /v1/submissions/{token}/stream` — returns
  Server-Sent Events using Postgres `LISTEN/NOTIFY` per-token channels
  (`zerocode.events.<token>`). Events: `processing`, `stdout` (data chunk),
  `stderr` (data chunk), `finished` (status JSON), `error`. If the submission
  is already done when the client connects, emits a single `finished` event
  and closes. Uses `Pin<Box<dyn Stream>>` to unify the two code paths.
- **`CachedSubmissionView`** response struct for cache hits — lighter than
  `SubmissionView` (no token/timestamps since the result didn't come from a
  specific submission row). Includes `cached: true` field.

#### Changed
- **`?wait=true` upgraded from polling to LISTEN/NOTIFY**. Instead of polling
  the DB every 200 ms, the API subscribes to
  `zerocode.events.<token>` via `zerocode_stream::events::subscribe` and
  wakes as soon as the worker publishes the `Finished` event (~sub-5ms
  latency). Falls back to 200 ms polling if the LISTEN connection fails.
- **HTTP/2 cleartext (h2c)** supported out of the box — `axum::serve` uses
  hyper's auto connection builder which negotiates HTTP/1.1 or HTTP/2 based on
  the client's connection preface. No code change needed; documented here for
  visibility.

#### Deferred
- **Compile-artifact cache** integration: the `compile_artifacts` table and
  `CompileCache` crate exist but the worker can't yet use them — compiled
  binaries live in a tmpfs inside the sandbox's mount namespace and aren't
  accessible from the host after exit. Needs a scratch-dir passthrough
  mechanism (Phase 5 or v2).
- **Sandbox template pool** (pre-built cgroups + mount layouts): Linux-only,
  requires profiling to validate the win. Deferred to v2.
- **`cargo bench` suite**: deferred to Phase 5.

### Phase 4.5 — Failure-injection + edge-case test suite

#### Added
- **71 edge-case integration tests** in
  `crates/zerocode-sandbox/tests/edge_cases/`, exercising adversarial
  submission patterns against the real `NativeSandbox`. Gated behind
  `#[cfg(all(target_os = "linux", feature = "edge-cases"))]` — requires a
  full sandbox environment (cgroup v2, runner rootfs, scratch dir).
  Run with: `cargo test -p zerocode-sandbox --features edge-cases --test edge_cases`

  Test breakdown by file:
  - **`common.rs` (21 tests)**: language-agnostic sandbox enforcement —
    infinite loop → wall TLE, sleep → wall TLE, memory bomb → OOM, fork
    bomb → pids.max, output bomb → stdout capped, stdin EOF handling, hello
    world, non-zero exit, exit 0 with stderr, stdin delivery, multiline
    stdin, large stdout, output-then-crash partial capture, mmap anon bomb,
    network blocked (NET namespace), /proc isolation (PID namespace), /etc/shadow
    unreadable, rootfs read-only, /box writable, /tmp writable.
  - **`python.rs` (8 tests)**: null deref → SIGSEGV via ctypes, sys.exit(0),
    SystemExit string → NZE(1), unhandled exception → NZE(1), no .pyc
    outside /box, threading under pids.max, read own source, multiprocessing
    under pids.max.
  - **`node.rs` (9 tests)**: hello world, process.exit → NZE, unhandled
    rejection → NZE (strict mode), event loop hang → wall TLE, CPU loop →
    TLE, thrown error → NZE, stdin read, memory bomb, JSON output.
  - **`c_cpp.rs` (11 tests)**: C hello, null deref → SIGSEGV, division by
    zero → SIGFPE, stack overflow → SIGSEGV, compile error, stdin read,
    non-zero exit; C++ hello, compile error, uncaught exception → SIGABRT,
    stack protector → SIGABRT.
  - **`go_lang.rs` (7 tests)**: hello world, compile error, panic → NZE(2),
    goroutine leak → wall TLE, stdin read, os.Exit → NZE, index OOB panic.
  - **`rust_lang.rs` (7 tests)**: hello world, compile error, panic=abort →
    SIGABRT, non-zero exit, stdin read, index OOB → SIGABRT, integer
    overflow wraps in release.
  - **`java.rs` (8 tests)**: hello world, compile error, System.exit → NZE,
    StackOverflowError → NZE(1), OOM with ExitOnOutOfMemoryError, uncaught
    exception, stdin read, threading under pids.max=96.

- **Test harness** (`harness.rs`): shared `NativeSandbox` instance via
  `LazyLock`, helper functions `job()`, `job_tight()`, `job_with_stdin()`,
  `job_with_limits()`, `run()`, `run_fallible()`. Language ID constants.
- **`edge-cases` feature** now implies `native` feature in
  `zerocode-sandbox/Cargo.toml`.

#### Test count
| Env | After Phase 4 | After Phase 4.5 | Delta |
|---|---|---|---|
| macOS (default features) | 49 | 49 | +0 (edge-cases cfg'd out) |
| Linux (default features) | 62 | 62 | +0 (edge-cases not enabled) |
| Linux (`--features edge-cases`) | — | 133 | +71 edge-case integration tests |

### Phase 4 — API polish

#### Added
- **Rate limiting** via `tower_governor` 0.8 on all authenticated routes.
  `GovernorConfigBuilder::default().per_second(100).burst_size(100)` gives a
  100 RPS sliding window with 100-request burst capacity. Applied as a layer
  on the authed `Router`, so health/ready/about stay unmetered.
- **Pagination** on `GET /v1/submissions`: `?page=1&per_page=20&status=queued`.
  Max 100 per page, `ORDER BY created_at DESC`. Response shape:
  `{ items, page, per_page, total }`.
- **`?wait=true` synchronous mode** on `POST /v1/submissions`: holds the
  connection and polls the DB every 200 ms for up to 30 s until the
  submission reaches a terminal status. Returns the full `SubmissionView`
  inline if it finishes in time; otherwise returns `201 { token, status:
  "queued" }` as usual so the client can fall back to polling.
- **Webhook delivery** with HMAC-SHA256 signing (`crates/zerocode-worker/src/webhook.rs`):
  - Signature header: `X-ZeroCode-Signature: t=<unix_secs>,v1=<hex(HMAC-SHA256(secret, timestamp.body))>`
  - Retry policy: up to 4 attempts (immediate + 1 s / 5 s / 30 s backoff),
    each with ±20% jitter. 5 s timeout per attempt. No retry on HTTP 4xx
    (client error, not transient).
  - `CallbackStatus` enum: `Delivered` (2xx), `FailedAfterRetries`,
    `NoCallback`. Written back to the submission row via
    `update_callback_status`.
  - Worker constructs a shared `reqwest::Client` with 10 s timeout and
    `zerocode-worker/0.1` user-agent.
- **`--webhook-secret` / `ZEROCODE_WEBHOOK_SECRET`** CLI arg + env on the
  worker binary. If unset, webhooks are delivered without a signature (dev
  only).

#### Changed
- **`POST /v1/submissions`** handler now accepts `Query(CreateParams)` and
  returns `ApiResult<Response>` (was `ApiResult<Json<…>>`) to support both
  the `201 Created` ack and the inline `200` result when `?wait=true`
  resolves.
- **`/v1/submissions` route** now has both `post(create).get(list)` on the
  same path.
- **Worker `Runner`** struct carries `http_client` and `webhook_secret`;
  `process()` fires the webhook after writing results and publishing the
  stream event.

#### Test count
| Env | After Phase 3c | After Phase 4 | Delta |
|---|---|---|---|
| macOS | 47 | 49 | +2 (webhook: callback_status_strings + jitter_is_bounded) |
| Linux | 60 | 62 | +2 (same) |

### Phase 3c — Java 21 LTS

#### Added
- **Java 21 LTS** (id 62) — the seventh core v1 language. Two-phase:
  `javac Main.java` → `java Main`. The JVM is a special beast:
  - **`JAVA_TOOL_OPTIONS`** env sets `-Xmx${jvm_heap_mb}m -Xss512k
    -XX:MaxMetaspaceSize=128m -XX:ReservedCodeCacheSize=64m
    -XX:+ExitOnOutOfMemoryError`. `ExitOnOutOfMemoryError` makes the JVM
    `exit(1)` on OOM instead of hanging trying to dump heap.
  - **`${jvm_heap_mb}` template variable** — computed as
    `max(memory_mb − 256, 32)` in `exec::substitute_limits`. The 256 MB
    overhead accounts for metaspace (128 MB cap), code cache (64 MB cap),
    thread stacks, and GC bookkeeping.
  - **Per-language `default_limits`** override the API defaults:
    `memory_mb = 512` (256 heap + 256 overhead), `max_pids = 96` (JVM
    thread floor), `wall_time = 15s` (JIT warmup absorbs budget).
  - **Per-language `compile_limits`** for javac: `cpu_time = 15s`,
    `wall_time = 30s`, `max_pids = 128` (javac forks annotation processors).
- **Runner image** now installs `openjdk-21-jdk-headless` from Debian trixie.
- **Seccomp**: no changes needed — Java's required syscalls (`clone3`,
  `membarrier`, `futex_waitv`) are already allowed by the default-allow
  deny-list policy. Doc comment updated to note this.
- **Integration tests** expanded:
  - Core 7 ID check (was Core 6): now includes Java id 62
  - Java added to compiled-languages assertion
  - `java_spec_carries_java_tool_options_with_jvm_heap_placeholder`
  - `java_spec_has_elevated_default_limits` (max_pids ≥ 96, memory ≥ 384)
  - `java_spec_has_compile_limits` (cpu_time ≥ 10s, max_pids ≥ 96)

#### Test count
| Env | After Phase 3b | After Phase 3c | Delta |
|---|---|---|---|
| macOS | 44 | 47 | +3 (Java TOOL_OPTIONS + default_limits + compile_limits) |
| Linux | 56 | 60 | +4 (above + jvm_heap_mb substitution test) |

### Phase 3b — Compile-then-run + Rust, Go, C, C++

#### Added
- **Two-phase sandbox execution**. When a `LanguageSpec` carries a non-empty
  `compile_cmd`, the outer sandboxed child forks a sub-child that execs the
  compile command, waits, and:
  - on success → execvpes the run command in the same sandbox (everything's
    already pivoted, capped, dropped, landlocked, seccomp'd),
  - on failure → exits with sentinel code `253` and lets the triage tree
    populate `compile_output` from stderr.
- **`pub const COMPILE_FAILED_EXIT_CODE: i32 = 253`** in
  `native::exec`. Picked at the top of the 8-bit range to minimise the risk
  of colliding with a real program exit; documented as a caveat.
- **Triage path for compile failure**: `WaitStatus::Exited(253)` short-circuits
  the rest of the decision tree → `Status::CompileError`, `compile_output =
  raw.stderr`, `stdout/stderr/exit_code` all cleared. New
  `sentinel_253_routes_stderr_to_compile_output` test asserts the routing.
- **Four new languages** in [runners/languages.toml](runners/languages.toml):
  - **C** (id 48, `gcc-14 -O2 -std=c17 -fstack-protector-strong -D_FORTIFY_SOURCE=2 main.c -o prog -lm`)
  - **C++** (id 52, `g++-14 -O2 -std=c++23 -fstack-protector-strong -D_FORTIFY_SOURCE=2 main.cpp -o prog -lm`)
  - **Go** (id 60, `go build -o prog main.go`; env: `GOCACHE=/tmp/.go-cache`,
    `GOTMPDIR=/tmp`, `GOMAXPROCS=1`, `GOMEMLIMIT=${memory_mb}MiB`)
  - **Rust** (id 73, `rustc -O -C panic=abort main.rs -o prog` — panic=abort
    so allocator OOMs surface as SIGABRT instead of a long unwind that
    races the wall budget)
- **Runner image** ([runners/Dockerfile](runners/Dockerfile)) now installs:
  - Debian trixie: `gcc-14`, `g++-14`, `libc6-dev`, `libstdc++-14-dev`
  - **Go**: official `go.dev` tarball, pinned via `GO_VERSION` build arg
    (default 1.23.4, arch-aware: `amd64`/`arm64`)
  - **Rust**: rustup stable toolchain into `/usr/local/cargo` + `/usr/local/rustup`
    so the rustc binary is reachable from every sandboxed submission via
    `/usr/local/cargo/bin/rustc`.
- **Registry integration tests** expanded — now asserts:
  - All Core 7 ids present (48, 52, 60, 62, 63, 71, 73)
  - Compiled langs (Rust/Go/C/C++) have both `compile_cmd` and `run_cmd`
  - Interpreted langs (Python/Node.js) have no `compile_cmd`
  - Go spec carries `GOMEMLIMIT=${memory_mb}…`
  - Rust spec carries `panic=abort`

#### Changed
- **`exec::run_child` signature** now takes `compile_argv: Option<&[CString]>`
  alongside `run_argv: &[CString]`. The control flow inside the child is:
  setup (unshare → sync → mounts → pivot → dup2 → caps → NNP → landlock →
  seccomp) → optional compile sub-fork → execvpe run.
- **Seccomp filter** stays unchanged but now also covers the compile
  sub-child by kernel inheritance — verified gcc-14, g++-14, rustc, and
  `go build` don't trip any of our deny rules.

#### Test count
| Env | After Phase 3a | After Phase 3b | Delta |
|---|---|---|---|
| macOS | 40 | 44 | +4 (registry integration: compiled-langs + interpreted + Go memlimit + Rust panic=abort) |
| Linux | 51 | 56 | +5 (above + sentinel_253_routes_stderr_to_compile_output) |

### Phase 3a — Node.js 22 + env templating

#### Added
- **Node.js 22** runs end-to-end as the second supported language:
  - `runners/Dockerfile` installs `nodejs` from Debian trixie (which ships 22.x LTS)
    and adds a `/usr/bin/node` symlink fallback if Debian only ships `nodejs`.
  - `runners/languages.toml` registers id `63` Node.js 22 with
    `NODE_NO_WARNINGS=1` and a templated
    `NODE_OPTIONS=--max-old-space-size=${memory_mb} --unhandled-rejections=strict`
    so V8's old-generation heap matches the cgroup memory cap and unhandled
    promise rejections surface as non-zero exits.
- **`${var}` substitution in env values** — `${memory_mb}`, `${cpu_time}`,
  `${wall_time}`, `${max_pids}` are replaced from the per-submission
  `ResourceLimits` before the env vector is handed to `execvpe`. Cheap string
  replace; enough for JVM/Node/Go runtime hooks without a full template
  engine. Implemented in `native::exec::substitute_limits` with 3 unit tests
  covering positive substitution, all-placeholder coverage, and pass-through.
- **`tests/registry_file.rs`** integration test that loads the actual
  shipped `runners/languages.toml` and asserts:
  1. it parses with the current `LanguageRegistry` types,
  2. it contains Python (id 71) and Node.js (id 63),
  3. the Node.js spec carries `NODE_OPTIONS` with `${memory_mb}` and
     `unhandled-rejections=strict`.

#### Changed
- **`exec::run` signature** now takes `&ResourceLimits` instead of three
  duplicate `wall_time`/`max_stdout`/`max_stderr` parameters; the wall-clock
  budget is derived from `limits.wall_time` inside the function. Cleaner
  caller, one fewer place where the three args could drift out of sync.
- **`build_env` signature** now takes `(spec, limits)` and runs every spec
  env value through `substitute_limits` before pushing it onto the C-string
  vector.

### Phase 2.5 — `pivot_root` into runner rootfs

#### Added
- **`mounts::pivot_into_runner`** — full filesystem swap into the runner image:
  1. recursive bind of `runner_rootfs` onto `<scratch>/root`,
  2. tmpfs at `<root>/box` (32 MB) and `<root>/tmp` (64 MB) — both `nosuid`+`nodev`,
  3. copy source + stdin from the host scratch dir into the box tmpfs,
  4. mkdir `put_old` *inside* the box tmpfs (so the cleanup rmdir can't leak
     back into the read-only runner image; each submission has its own tmpfs,
     so there's no race with parallel sandboxes),
  5. `pivot_root(new_root, put_old)`,
  6. `umount2("/box/.zc-old", MNT_DETACH)` + `rmdir`,
  7. `mount("proc", "/proc", "proc", MS_NOSUID|MS_NODEV|MS_NOEXEC)` —
     fresh procfs scoped to the new PID namespace,
  8. `chdir("/box")`.
- **`NativeSandbox::new` boot validation** now requires `runner_rootfs` to
  exist and contain `/usr` — fails fast with a clear "did
  `runner-rootfs-init` run?" hint if the operator forgot to populate the
  volume.

#### Changed
- **Child syscall order** updated to: unshare → ready signal → wait for parent
  → make ns private → **pivot_into_runner** (replaces the Phase 2
  `mount_tmp_tmpfs` + `chdir scratch` pair) → loopback up → dup2 fds → drop
  caps → `PR_SET_NO_NEW_PRIVS` → landlock → seccomp → execvpe.
- **Landlock policy target** is now `/box` (post-pivot path) instead of the
  host scratch dir.
- Removed `Scratch::source_path` / `Scratch::stdin_path` helpers — replaced by
  direct copies inside `pivot_into_runner`.

### Phase 2 — Sandbox hardening (seccomp + landlock + userns mapping)

#### Added
- **User-namespace UID/GID mapping** (`native/userns.rs`): parent writes
  `/proc/<child>/uid_map`, `gid_map`, and `setgroups=deny` after the child
  enters `CLONE_NEWUSER`. In-container UID 0 maps to the unprivileged worker
  UID. **Structurally blocks** the Judge0 CVE-2024-28189 chown-bypass class —
  there's no mapping for arbitrary host UIDs.
- **Mount-namespace hardening** (`native/mounts.rs`): `mount("/", MS_PRIVATE | MS_REC)`
  so subsequent tmpfs mounts don't propagate to the host; tmpfs on `/tmp`
  (size 64 MB, `nosuid`, `nodev`); loopback `lo` brought up inside the
  NET namespace via `SIOCSIFFLAGS` ioctl.
- **Landlock filesystem policy** (`native/landlock_policy.rs`, ABI v1):
  read-only on `/usr`, `/lib`, `/lib64`, `/bin`, `/sbin`, `/etc`; read-write
  on the per-submission scratch dir + `/tmp` tmpfs. Symlink targets are
  enforced at the I/O layer (closes Judge0 CVE-2024-28185 class).
- **Seccomp BPF filter** (`native/seccomp.rs`): allow-by-default with deny
  rules for `io_uring_*`, `bpf`, `userfaultfd`, `ptrace`, `unshare`, `keyctl`,
  `mount`, `umount2`, `pivot_root`, `setns`, `reboot`, `kexec_load`,
  `kexec_file_load`, `add_key`, `request_key`, `swapon`, `swapoff`,
  `init_module`, `finit_module`, `delete_module`. Each denied call returns
  `EPERM` to the user program rather than killing it, so language runtimes
  don't crash on benign probes.
- **Two-pipe parent/child handshake** in `native/exec.rs`:
  `ready_pipe` (child → parent: "I've unshared") and `start_pipe`
  (parent → child: "uid_map written, cgroup attached, proceed"). Replaces the
  single-pipe sync from Phase 1.5 because the parent now needs to do work
  *after* the child unshares but *before* the child can do anything else.
- **Worker-level `PR_SET_CHILD_SUBREAPER`** (`worker/reaper.rs`): orphaned
  grandchildren reparent to the worker. Periodic `waitpid(-1, WNOHANG)`
  drains zombies every 2 s. Both Linux-gated; non-Linux dev hosts no-op.

#### Changed
- **Sandbox child hardening order** finalised:
  unshare → ready signal → wait for parent → make ns private → tmpfs /tmp →
  lo up → chdir → dup2 fds → drop caps → `PR_SET_NO_NEW_PRIVS` → **landlock** →
  **seccomp** → execvpe. seccomp must come *after* `NO_NEW_PRIVS` or the kernel
  refuses to load the filter for unprivileged tasks.
- **`nix` workspace features** added: `socket`, `net`, `ioctl` (for the
  loopback ioctl).
- **`libseccomp` and `landlock`** promoted from optional `native-hardened`
  deps to required `[target.'cfg(target_os = "linux")'.dependencies]` —
  Phase 2 makes them essential, not optional.

#### Fixed
- Removed an unnecessary `unsafe` block in `mounts::bring_loopback_up` (field
  access on a `libc::ifreq` is safe; only the `ioctl()` call needs `unsafe`).

### Phase 1.5 — Linux NativeSandbox (commit `bb73654`)

#### Added
- **`zerocode-sandbox::native::NativeSandbox`** — production-shaped sandbox
  built from direct Linux primitives. Wrapped behind the `Sandbox` trait so
  later tiers (WASM in v2, Firecracker in v2) slot in without API churn.
- **cgroup v2 management** (`native/cgroup.rs`):
  per-submission directory under `/sys/fs/cgroup/zerocode/<ulid>/`; writes
  `memory.max`, `memory.swap.max=0`, `cpu.max`, `pids.max`; reads
  `memory.events.oom_kill`, `memory.peak`, `cpu.stat`; atomic `cgroup.kill`
  on wall-clock timeout (kernel ≥5.14).
- **Per-submission scratch** (`native/scratch.rs`):
  `/run/zerocode-sandbox/<ulid>/` with 0700 perms, holding the source file
  and a stdin file the child reads from.
- **Namespaced fork+exec** (`native/exec.rs`):
  unshare(`NEWPID | NEWNS | NEWIPC | NEWUTS | NEWNET | NEWUSER`), chdir to
  scratch, dup2 stdin/stdout/stderr, `caps::clear` on every capset
  (effective/permitted/inheritable/bounding/ambient), `PR_SET_NO_NEW_PRIVS`,
  `execvpe` with locale-clean env (`LANG=C.UTF-8`).
- **Triage decision tree** (`native/triage.rs`):
  OOM → wall-TLE → CPU-TLE → signal exit → non-zero exit → Accepted, with
  signal mapping per `docs/EDGE_CASES.md`.
- **Output capture with cap + tail-drain** so a runaway child can't trigger
  SIGPIPE on the reader.
- `--features native` on `zerocode-sandbox` and `zerocode-worker`. Workspace
  builds clean on macOS (Linux primitives `cfg`-gated out); Linux build
  cross-verified via `docker run rust:1-bookworm`.

#### Fixed
- `nix::unistd::dup2` API mismatch in nix 0.31 — switched to dedicated
  `dup2_stdin / dup2_stdout / dup2_stderr` helpers (caught by the Linux
  cross-build that the macOS check would have missed).

### Phase 1 — API submission lifecycle + worker claim loop (commit `b55dab4`)

#### Added
- **`POST /v1/submissions`** with full validation:
  - body ≤256 KB (`tower-http::limit`), source ≤64 KB, stdin ≤64 KB
  - `Authorization: Bearer` with constant-time API key compare
  - `Idempotency-Key` dedup keyed on `blake3(language || source || stdin)`
  - SSRF-safe `callback_url` validator — rejects loopback / private IPv4
    (10.x, 192.168.x, 172.16.x, 169.254.x), private IPv6, `localhost`,
    metadata hostnames (`169.254.169.254`, `*.internal`)
  - clamps per-request limits against the configured ceiling
- **`GET /v1/submissions/{token}`** returning a `SubmissionView` with
  binary-safe payload encoding (UTF-8 string or `{"_b64": "..."}` object).
- **`GET /v1/languages`** — reads from the in-memory registry.
- **`/v1/ready`** — gates on queue depth >10k → 503, on top of DB ping.
- **`zerocode-worker` runner loop**: LISTEN on `zerocode.jobs`, 2 s poll
  fallback, drains atomic CTE-based claims (`FOR UPDATE SKIP LOCKED`) until
  the semaphore or the queue blocks. Each claim runs on its own tokio task.
- **Status encoding** for the DB: terminal status flattened to
  `(text, json detail)` so adding variants doesn't need a migration.
- **`write_sandbox_failure`** distinct from user-code errors.
- **Sandbox selector** that picks `NativeSandbox` / `NaiveSandbox` / stub by
  feature.
- **Sweeper** resets stuck `processing` rows past
  `2 × wall_time_limit + 60s` back to `queued` every 30 s.
- **`LanguageRegistry`** loader in `zerocode-core` — both binaries boot from
  `runners/languages.toml`.
- **`ApiError → HTTP`** mapping with `WWW-Authenticate: Bearer` on 401
  responses and structured JSON bodies.

### Phase 0 — Workspace scaffold (commit `ce540f0`)

#### Added
- Seven-crate Cargo workspace (edition 2024, Rust 1.85+):
  `zerocode-core`, `zerocode-sandbox`, `zerocode-cache`, `zerocode-stream`,
  `zerocode-migrate`, `zerocode-api`, `zerocode-worker`.
- **`zerocode-core`**: `Submission`, `Status`, `LanguageSpec`, `LanguageRegistry`,
  `ResourceLimits`, `Payload` (binary-safe serde), `Token` (ULID).
- **`zerocode-sandbox`**: `Sandbox` trait + `SandboxJob`/`SandboxResult` + kernel
  preflight + feature-gated `NaiveSandbox` (plumbing only) + stubbed `NativeSandbox`.
- **`zerocode-cache`**: blake3 `CacheKey`, in-process `ResultCache` (moka LRU
  with TTL), Postgres-backed `CompileCache`.
- **`zerocode-stream`**: Postgres `LISTEN/NOTIFY` job dispatch + per-token SSE
  event channel.
- **`zerocode-migrate`**: one-shot DB migration binary (separate init container).
- **`zerocode-api`**: axum 0.8 + graceful shutdown + `/v1/health`, `/v1/ready`,
  `/v1/about`.
- **`zerocode-worker`**: heartbeat scaffold + SIGTERM drain.
- Initial schema migration (`languages`, `submissions` with `claimed_at` +
  `worker_id` + idempotency columns, `compile_artifacts`).
- **`deploy/Dockerfile.service`** (distroless+musl), **`deploy/Dockerfile.worker`**
  (debian-slim), **`deploy/docker-compose.yml`** (unprivileged stack:
  `cap_drop=ALL`, `no-new-privileges`, read-only API rootfs, `cgroupns=private`).
- **`runners/Dockerfile`** with Python 3.13 baseline + **`runners/languages.toml`**
  registry.

[Unreleased]: https://github.com/zerocode/zerocode/compare/...HEAD
