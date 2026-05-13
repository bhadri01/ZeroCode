# ZeroCode TODO

Lifted from the approved plan at `~/.claude/plans/what-is-in-this-transient-engelbart.md`.
Each phase's items map 1:1 to the plan's "Phased implementation plan",
"Operational & security hardening (v1 must-haves)", "Performance design",
"Edge cases & error handling", and the v1.5/v2/v3 sections.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## v1 — Core service

### Phase 0 — Skeleton ✅ done (commit `ce540f0`)

- [x] Cargo workspace + 7 crates + `rust-toolchain.toml` (edition 2024, Rust ≥1.85)
- [x] `Cargo.toml` with verified workspace dependency versions (2026-05-12 snapshot)
- [x] `docker-compose.yml` with Postgres
- [x] `zerocode-migrate` binary + initial migration (languages, submissions, compile_artifacts)
- [x] Bare axum server: `/v1/health`, `/v1/about`
- [x] `tracing-subscriber` JSON logs setup
- [x] `.env.example`, `.gitignore`, README
- [x] git init + first commit

### Phase 1 — Plumbing ✅ done (commit `b55dab4`)

- [x] `POST /v1/submissions` writes a row, returns token, fires `pg_notify('zerocode.jobs', token)`
- [x] `GET /v1/submissions/{token}` returns row + `SubmissionView`
- [x] `GET /v1/languages` from in-memory registry
- [x] `GET /v1/ready` gates on queue depth + DB ping
- [x] Bearer auth middleware (constant-time `subtle::ConstantTimeEq`)
- [x] `ApiError → HTTP` mapping with `WWW-Authenticate: Bearer` on 401
- [x] `Idempotency-Key` header with blake3 body-hash dedup
- [x] Body size limit 256 KB (`tower-http::DefaultBodyLimit`)
- [x] SSRF callback URL validator (loopback / private IPv4+IPv6 / metadata hosts)
- [x] Submission state machine: queued → processing → terminal
- [x] Worker LISTEN/NOTIFY + 2 s poll fallback
- [x] Atomic claim via CTE + `FOR UPDATE SKIP LOCKED`
- [x] Each claim on its own tokio task, bounded by `Semaphore(num_cpus)`
- [x] `write_result` with status encoded as `(text, json detail)`
- [x] `write_sandbox_failure` distinct from user-code errors
- [x] Periodic sweeper resets stuck claims past `2 × wall_time_limit + 60 s`
- [x] `LanguageRegistry` loader in `zerocode-core`
- [x] Sandbox selector: `NativeSandbox` / `NaiveSandbox` / `StubSandbox` by feature

### Phase 1.5 — Sandbox smoke test (Python only) 🟡 partial (commit `bb73654`)

- [x] `Sandbox` trait + `NativeSandbox` skeleton via direct primitives
  - Plan called for `libcontainer`; we went direct (`nix` + `caps` + raw cgroup v2 fs)
    for transparency and faster Phase 1.5. `libcontainer` integration deferred to
    `native-hardened` in Phase 2 (or v2 if direct path proves robust).
- [x] Build runner Dockerfile with Python 3.13
- [x] cgroup v2: create / `memory.max` / `cpu.max` / `pids.max` / `cgroup.kill`
- [x] Per-submission scratch dir
- [x] Fork + unshare PID/NET/IPC/UTS/MNT/USER
- [x] All caps dropped (5 capsets) + `PR_SET_NO_NEW_PRIVS`
- [x] Wall-clock timeout → `cgroup.kill` → final `waitpid`
- [x] Output capture with size cap + tail-drain (no SIGPIPE)
- [x] Read `memory.events.oom_kill`, `memory.peak`, `cpu.stat`
- [x] Triage decision tree (OOM → wall TLE → CPU TLE → signal → NZE → Accepted)
- [x] macOS dev build green; Linux build green via `docker run rust:1-bookworm`
- [x] 8 sandbox unit tests pass on Linux (cgroup parsing, exec helpers, triage)
- [x] **End-to-end smoke test**: Postgres + API + worker + `curl POST /v1/submissions`
      with Python hello world, returns `Status::Accepted`
      — `scripts/smoke-test.sh` (274 lines, 6 test cases: Python hello, unknown lang,
      empty source, languages list, about endpoint, base64 round-trip)
- [x] **Boot-time kernel preflight** runs via `NativeSandbox::new()` → `kernel_check::preflight()` on `--features native`
- [ ] Verify on real Linux host: limits enforced (TLE, MLE, OOM), no host /proc
      leak, `cgroup.kill` cleanup, no zombies

### Phase 2 — Sandbox hardening 🟡 mostly done

- [x] Seccomp profile (Docker default minus `io_uring_*`, `bpf`,
      `userfaultfd`, `ptrace`, `unshare`, `keyctl`, `mount`, `umount2`,
      `pivot_root`, `setns`, `reboot`, `kexec_load`, `kexec_file_load`,
      `add_key`, `request_key`, `swapon`, `swapoff`, `init_module`,
      `finit_module`, `delete_module`)
- [x] Landlock ruleset (ABI v1): `/usr` `/lib` `/lib64` `/bin` `/sbin` `/etc` RO;
      scratch dir + `/tmp` RW
- [x] **(Phase 2.5)** `pivot_root` into the read-only runner rootfs *(done in Phase 2.5)*
- [x] Per-submission `/tmp` tmpfs (size 64 MB, nosuid+nodev)
- [x] **(Phase 2.5)** Per-submission `/box` tmpfs sized to `memory_mb` *(done in Phase 2.5)*
- [x] Loopback `lo` brought up inside NET namespace (SIOCSIFFLAGS ioctl)
- [x] **(Phase 3)** `enable_network` flag wired through DB (migration, insert,
      fetch, claim) + validation ceiling check. Sandbox enforcement deferred to
      when a language spec actually sets it.
- [x] User-namespace UID/GID mapping (parent writes `/proc/<pid>/uid_map` after child unshare)
- [x] `PR_SET_CHILD_SUBREAPER` on worker boot
- [x] Periodic `waitpid(-1, WNOHANG)` zombie reaper (2 s cadence)
- [x] **(Phase 5)** Verify with `capsh --print` from inside the sandbox
      — done as `all_capabilities_dropped` + `no_new_privs_is_set` edge-case tests
      (reads `/proc/self/status` capability fields and `prctl(PR_GET_NO_NEW_PRIVS)`)

### Phase 2.5 — Runner rootfs + `pivot_root` ✅ done

- [x] `runner-rootfs-init` extracts `zerocode-runner` image filesystem into a
      named volume (`docker-compose.yml` wires this; ops responsibility to run it)
- [x] Child binds `runner_rootfs` recursively under a per-submission mount-point;
      mounts tmpfs on `/box` (32 MB) and `/tmp` (64 MB)
- [x] `pivot_root` into the new root; `umount2` the old root with `MNT_DETACH`
- [x] Re-mount `/proc` as procfs inside the new root (PID-ns view, not host's)
- [x] Copy source + stdin from host scratch dir into the per-submission `/box` tmpfs before pivot
- [x] `NativeSandbox::new` validates `runner_rootfs` exists + has `/usr`

### Phase 3 — Remaining Core 7 languages

- [x] **Phase 3a — Node.js 22** (interpreted, single file `node script.js`)
  - [x] runners/Dockerfile installs Debian trixie `nodejs` (22.x LTS)
  - [x] runners/languages.toml id=63 with `NODE_NO_WARNINGS=1` and templated
        `NODE_OPTIONS=--max-old-space-size=${memory_mb} --unhandled-rejections=strict`
  - [x] `${memory_mb}` / `${cpu_time}` / `${wall_time}` / `${max_pids}`
        substitution in `build_env`
- [x] **Phase 3b — compile-then-run, single binary**
  - [x] Rust (rustup stable; single-file `main.rs` via rustc, `-C panic=abort`)
  - [x] Go (official go.dev tarball, `go build main.go`, `GOMEMLIMIT=${memory_mb}MiB`)
  - [x] C (Debian trixie gcc-14, `-O2 -std=c17 -fstack-protector-strong -D_FORTIFY_SOURCE=2`)
  - [x] C++ (Debian trixie g++-14, `-O2 -std=c++23 -fstack-protector-strong -D_FORTIFY_SOURCE=2`)
  - [x] Compile + run inside the same outer sandbox via fork+wait; sentinel
        exit code 253 signals compile failure
  - [x] `compile_output` field populated from stderr on `Status::CompileError`
  - [x] **(Phase 4.6)** Separate compile pipes: 4th pipe pair (`compile_rd`,
        `compile_wr`) captures compiler stderr independently from run-phase stderr;
        sub-child redirects stderr → compile pipe via `dup2`; parent reads via
        dedicated thread; triage auto-populates `compile_output` from `raw.compile_stderr`
  - [ ] **(future)** Separate compile-time/compile-memory limits
        (`compile_time_limit`, `compile_memory_limit`); currently shares the
        run-phase wall budget
- [x] **Phase 3c — Java 21 LTS**
  - [x] `javac Main.java` + `java Main` two-phase compile-then-run
  - [x] `JAVA_TOOL_OPTIONS=-Xmx${jvm_heap_mb}m -Xss512k -XX:MaxMetaspaceSize=128m
        -XX:ReservedCodeCacheSize=64m -XX:+ExitOnOutOfMemoryError`
  - [x] `${jvm_heap_mb}` substitution: `max(memory_mb − 256, 32)`
  - [x] Per-language `default_limits`: `memory_mb=512`, `max_pids=96`, `wall_time=15s`
  - [x] Per-language `compile_limits`: `cpu_time=15s`, `wall_time=30s`, `max_pids=128`
  - [x] Seccomp: no changes needed — `clone3`, `membarrier`, `futex_waitv`
        already allowed by default-allow deny-list policy
  - [x] `openjdk-21-jdk-headless` in `runners/Dockerfile`

### Phase 4 — API polish ✅ done

- [x] Webhook callbacks: HTTP POST + HMAC-SHA256 signature (`X-ZeroCode-Signature`)
- [x] Webhook retry policy: 4 attempts (immediate + 1 s / 5 s / 30 s) with ±20% jitter
- [x] `callback_status` written back via `update_callback_status`
- [x] `?wait=true` synchronous mode (timeout 30 s; polling 200 ms interval)
- [x] `?base64_encoded=true` on POST (decodes source/stdin from base64) + on GET (returns outputs as base64 strings)
- [x] Pagination on `GET /v1/submissions` (`?page`, `?per_page`, `?status`)
- [x] Rate limiting via `tower_governor` (global 100 RPS burst 100)
- [x] Graceful drain on SIGTERM (worker already drains via shutdown Notify)
- [x] `?wait=true` long-poll over `LISTEN` (done in Phase 4.6)

### Phase 4.5 — Failure-injection + edge-case test suite ✅ done

- [x] `tests/edge_cases/common.rs` (21 tests) — language-agnostic sandbox:
  infinite loop, sleep, memory bomb, fork bomb, output bomb, stdin EOF,
  hello world, non-zero exit, exit 0 + stderr, stdin delivery, multiline
  stdin, large stdout, output-then-crash, mmap bomb, network blocked,
  /proc isolation, /etc/shadow blocked, rootfs readonly, /box writable,
  /tmp writable
- [x] `tests/edge_cases/python.rs` (8 tests): null deref SIGSEGV, sys.exit,
  SystemExit string, unhandled exception, no .pyc, threading, read source,
  multiprocessing
- [x] `tests/edge_cases/node.rs` (9 tests): hello, process.exit, unhandled
  rejection strict, event loop TLE, CPU loop TLE, thrown error, stdin,
  memory bomb, JSON output
- [x] `tests/edge_cases/c_cpp.rs` (11 tests): C (hello, null deref, div-by-zero,
  stack overflow, compile error, stdin, NZE) + C++ (hello, compile error,
  exception abort, stack protector)
- [x] `tests/edge_cases/go_lang.rs` (7 tests): hello, compile error, panic,
  goroutine leak TLE, stdin, os.Exit, index OOB
- [x] `tests/edge_cases/rust_lang.rs` (7 tests): hello, compile error,
  panic=abort SIGABRT, NZE, stdin, index OOB abort, integer overflow wraps
- [x] `tests/edge_cases/java.rs` (8 tests): hello, compile error, System.exit,
  StackOverflowError, OOM ExitOnOutOfMemoryError, uncaught exception,
  stdin, threading
- [x] Harness: `LazyLock` shared sandbox, helper functions, language ID constants
- [x] `edge-cases` feature implies `native` in Cargo.toml
- [x] **Batch A–G edge-case tests** (54 tests in 5 files): `batch_a.rs` (21),
      `batch_b.rs` (12), `batch_c.rs` (4), `batch_d.rs` (5), `batch_efg.rs` (12)
- [x] API-level edge case tests (12 tests): IPv6 SSRF validation, base64 field
      parsing, idempotency hash (determinism, language/stdin sensitivity,
      None-vs-empty stdin discriminant)
- [x] Webhook unit tests (7 tests): HMAC determinism, body/secret sensitivity,
      consumer verification, retry policy assertions, jitter bounds
- [x] `tests/edge_cases/ops.rs` — 7 sandbox-level ops tests (concurrent load,
      large source, empty stdin EOF, env substitution, unique cgroup paths,
      wall-time precision, zombie reaping) + 5 API ops tests (backpressure
      threshold, view serialization, cached flag, CreateParams parsing)
- [x] Nightly CI workflow (`.github/workflows/nightly.yml`): kernel matrix
      (ubuntu:22.04/24.04/debian:bookworm), bench job, Docker build smoke

### Phase 4.6 — Performance hot path ✅ done (core items)

- [x] Result cache (`moka` in-process LRU, 10k entries, 5 min TTL) on `POST` path
      — cache check on POST, populate on `?wait=true` completion
- [x] Compile-artifact cache: `CompileCache` wired into worker's `Runner`;
      cache key computed before sandbox execute; on hit, binary passed via
      `SandboxJob.cached_binary` → scratch dir → `/box/prog` (skips compile phase);
      on miss + successful compile, binary extracted via bind-mounted exchange file
      at `/box/.artifact` → `SandboxResult.compiled_binary` → `CompileCache::insert`
- [x] LISTEN/NOTIFY dispatch on `INSERT` (done in Phase 1; confirmed sub-5ms wake)
- [ ] Sandbox template pool — pre-build K cgroups + mount layouts + landlock rulesets
      — **deferred to v2**: Linux-only, needs profiling to validate win
- [x] HTTP/2 enabled end-to-end — `axum::serve` auto-negotiates h2c via hyper's auto builder
- [x] **Streaming endpoint**: `GET /v1/submissions/{token}/stream` — SSE from per-token Postgres NOTIFY
- [x] `?wait=true` long-poll optimization — LISTEN/NOTIFY with polling fallback
- [x] `cargo bench` suite — `core_ops` (token, payload, limits) + `cache_key` (result key, compile key at multiple sizes)

### Phase 5 — Threat model + docs + load test ✅ done (core items)

- [x] `docs/THREAT_MODEL.md` — STRIDE pass, trust boundaries (ASCII diagram),
      defense-in-depth layers, known limitations, Judge0 CVE analysis
- [x] `docs/DEPLOY.md` — host preconditions, env vars, Docker Compose quickstart,
      runner rootfs setup, TLS termination, cgroup delegation, troubleshooting
- [x] `docs/ARCHITECTURE.md` — system overview (ASCII diagram), crate map,
      submission lifecycle, sandbox execution model, performance architecture,
      container image strategy, language table
- [x] Load test script (`scripts/load-test.sh`): `oha`-based with 3 phases
      (warm-up 10s, sustained 60s at 100 RPS, cache-hit burst), configurable via
      env vars. Requires running Linux stack with real sandbox.
- [x] README quickstart polish — full rewrite with API reference, language table,
      security summary, testing section
- [x] `cargo clippy --workspace -- -D warnings` clean
- [x] `deny.toml` created — run `cargo deny check` once `cargo-deny` is installed

### Operational & security hardening (v1 must-haves) — cross-cutting

- [x] Body size cap (256 KB), field caps (64 KB source/stdin)
- [x] Output ring-buffer cap with overflow marker
- [x] Per-worker `Semaphore` for sandbox concurrency
- [x] DB pool sizing: API max=16, worker max=4
- [x] `claimed_at` + `worker_id` for sweeper recovery
- [x] Constant-time API key compare
- [x] `tower_governor` rate limiting (Phase 4)
- [x] Graceful SIGTERM drain (worker shutdown via `Notify` + sweeper/reaper drain)
- [x] HMAC-signed webhooks (Phase 4)
- [x] Retention job: 24 h row TTL (`ZEROCODE_RETENTION_HOURS`), 1 h payload TTL (`ZEROCODE_PAYLOAD_TTL_SECS`), 5 min cadence
- [x] `PR_SET_CHILD_SUBREAPER` + zombie reaper (Phase 2, `worker/reaper.rs`)
- [x] Read-only service rootfs in compose (set in `docker-compose.yml`)
- [x] Worker `OOMScoreAdj=-500` (writes to `/proc/self/oom_score_adj` on Linux)
- [x] Loopback `lo` up inside NET namespace (Phase 2, `native/mounts.rs`)
- [x] `LANG=C.UTF-8` env in sandbox (`native/exec.rs` build_env)
- [x] `/v1/health` vs `/v1/ready` split (Phase 0)
- [x] Don't log source/stdin/stdout at INFO (satisfied by current tracing setup)

---

## v1.5 — Judge0 catalog parity (~35 languages)

- [x] **Batch A — Single-binary interpreted** (Bash 100, Lua 101, Perl 102, Ruby 103, R 104, PHP 105, TypeScript 106)
- [x] **Batch B — Native GCC family** (Fortran 110, Pascal 111, D 112, Objective-C 113, Assembly 114, Ada 115)
- [x] **Batch C — JVM family** (Kotlin 120, Scala 121, Groovy 122, Clojure 123) — all carry `JAVA_TOOL_OPTIONS`
- [x] **Batch D — Functional / ML** (Haskell 130, OCaml 131, Erlang 132, Elixir 133, Common Lisp 134)
- [x] **Batch E — .NET** (C# 140, F# 141) — `DOTNET_CLI_TELEMETRY_OPTOUT=1`
- [x] **Batch F — Niche** (COBOL 150, Prolog 151, Swift 152, Octave 153, SQL 154)
- [x] **Batch G — Beyond Judge0** (Zig 160, Nim 161, Crystal 162, Dart 163, Julia 164)
- [x] `runners/languages.toml` — 41 languages registered, 16 integration tests pass
- [x] `runners/Dockerfile` — all toolchains installed (apt + tarballs for Kotlin, Scala, .NET, Swift, Zig, Dart, Julia)
- [x] Runner image size optimisation: `runners/Dockerfile.slim` multi-stage
      with per-language targets (python, node, go, rust, c-cpp, java, full);
      `scripts/build-runner-tags.sh` builds all tags and prints size table
- [x] Per-language edge-case smoke tests for new languages (Batch A–G) — 54 tests in 5 files

---

## v2 — Performance + advanced

- [ ] **Firecracker microVM tier** with snapshot/restore (~5-10 ms cold-start)
- [~] **WASM tier** (Wasmtime + cwasm pre-compilation) for Rust/Go/C/C++ —
      `WasmSandbox` impl in `crates/zerocode-sandbox/src/wasm.rs` (feature
      `wasm`) runs a pre-compiled `.wasm` blob via wasmtime 27 + WASI
      preview1. Limits: fuel-based CPU bound, `StoreLimits::memory_size`
      cap, tokio `timeout` for wall-clock. Stdin pipes from `SandboxJob.stdin`;
      stdout/stderr captured to `MemoryOutputPipe`. Cross-platform (works on
      macOS), so it's the first usable v2 isolation tier without a Linux host.
      Status mapping mirrors NativeSandbox triage flow.
      Still to do: WASI-targeted compile pipelines for Rust/Go/C/C++ (the
      sandbox runs `.wasm` today; the compile-to-wasm step is upstream of it
      and per-language); `cwasm` AOT pre-compilation; sandbox-select wiring
      so the worker can route specific submissions to the WASM tier.
- [ ] **CRIU interpreter snapshots** — pre-warmed CPython/JVM/Node images
- [x] **Test-case batching** — `POST /v1/submissions/batch` accepts a single
      source plus 1–100 stdin test cases; server creates N independent
      submission rows tied by one `batch_id` ULID. Workers process each as a
      normal submission (no special worker semantics → per-case result caching
      / sweeping / webhooks all keep working). `GET /v1/batches/{batch_id}`
      returns aggregated items + status summary (queued/processing/accepted/failed).
      Schema migration `20260513000001_batch_id.sql` adds `batch_id TEXT` +
      partial index. OpenAPI spec annotated.
- [x] **gRPC API** alongside REST (binary protocol, HTTP/2) — `zerocode.v2.ZeroCode`
      service on `ZEROCODE_GRPC_BIND` (default `0.0.0.0:9091`): `CreateSubmission`,
      `GetSubmission`, `ListLanguages`, `GetHealth`. Proto at
      `crates/zerocode-api/proto/zerocode.proto`; compiled via `tonic-build` at
      build time. Shares the REST `AppState` so idempotency, result cache, and
      rate-limit state stay consistent across protocols. Bearer auth via
      `authorization` metadata, constant-time compare same as REST.
      Set `ZEROCODE_GRPC_BIND=off` to disable. **Reflection** wired via
      `tonic-reflection` (clients use `grpcurl localhost:9091 list/describe`
      without the .proto). Dockerfile.service installs `protobuf-compiler` in
      the build stage; compose exposes port 9091. Smoke test extended with
      gRPC reflection + GetHealth check. Streaming RPCs and batch operations
      deferred — REST already covers them.
- [ ] **WebSocket interactive REPL** sessions (Python, Node, Ruby)
- [~] **Auto-scaling worker pool** driven by `pending_jobs / available_workers` —
      signal metrics exposed: `zerocode_pending_jobs` (gauge, sampled every 5 s
      from `SELECT count(*) WHERE status='queued'`), `zerocode_active_sandboxes`
      and `zerocode_worker_parallelism` (already present). Scaler/operator
      that consumes these metrics (HPA, KEDA, …) is operator-side work, not
      in-tree.
- [x] **OTLP tracing export** (`opentelemetry-otlp`) — env-gated by
      `OTEL_EXPORTER_OTLP_ENDPOINT`. Both api + worker install a batch span
      exporter via tonic/gRPC; W3C TraceContext propagator registered; HTTP
      spans from the existing `TraceLayer` flow through automatically.
      Dev compose ships Jaeger 1.60 all-in-one (UI at http://localhost:16686,
      OTLP ingest on `:4317`).
- [x] **Prometheus metrics** endpoint — API `/metrics` route (PrometheusHandle),
      worker HTTP server on port 9090; both use `metrics-process` collector for
      CPU/RSS/FD; named counters for submissions, cache hits/misses, webhooks
- [x] **Multi-arch images** (arm64) — `deploy/Dockerfile.service` now selects
      `x86_64-unknown-linux-musl` or `aarch64-unknown-linux-musl` via `TARGETARCH`
- [x] **OpenAPI spec + generated SDKs** (Python, Node, Go) — spec served at
      `GET /v1/openapi.json` (OpenAPI 3.1 via utoipa). 7 endpoints + 10 schemas
      annotated. SDK generation driver at `scripts/generate-sdks.sh` runs
      `openapi-generator-cli` (Dockerised) against a live API and emits
      Python + TypeScript by default; pass `--generators=go,java,...` for
      other targets.
- [x] **Per-language minimal runner images** (Core 7) — `runners/Dockerfile.slim`
      provides 7 single-language targets (python, node, go, rust, c-cpp, java)
      plus `full` Core-7 combo, sizes 80 MB–1.2 GB instead of the 3 GB monolithic
      image. Build all tags via `scripts/build-runner-tags.sh`. v1.5 batch
      languages (Lua, Ruby, R, .NET, Swift, …) remain in `runners/Dockerfile`
      only — generalising the slim approach to those is follow-up work.
- [ ] **Sandbox warm-up pool** in Phase 4.6 generalised

---

## v3 — Advanced platform features

- [ ] Custom judges / checkers (`code + judge_code`, SPJ semantics)
- [ ] Multi-file submissions (`additional_files` tar/zip)
- [ ] Multiple versions of the same language side-by-side
- [ ] Network access tier with per-submission egress firewall
- [ ] File output artifacts (`GET /v1/submissions/{token}/artifacts/<path>`)
- [ ] Multi-tenancy + quotas (per-API-key)
- [ ] GPU sandbox tier (Firecracker + CUDA passthrough)
- [ ] Distributed tracing across submission lifecycle
- [ ] Time-travel debugging (rr-based replay)
- [ ] Static-analysis pre-flight (`?preflight=lint`)
- [ ] Helm chart / K8s operator
- [ ] CPU pinning / cpuset for benchmark-consistent timing
- [ ] `expected_output` field + `WrongAnswer` / `Accepted` comparison (deferred from v1)

---

## Tech debt & cleanups

- [x] Move runtime-checked `sqlx::query()` to compile-time `query!` — all 19 query
      sites across `zerocode-api`, `zerocode-worker`, `zerocode-cache`, and
      `zerocode-stream` converted to `query!`/`query_scalar!` macros; `.sqlx/`
      cache populated (18 entries; `pg_notify` queries dedupe) and committed for
      `SQLX_OFFLINE=true` CI builds. Dev workflow: `docker compose -f deploy/docker-compose.yml
      -f deploy/docker-compose.dev.yml up -d postgres migrate` then
      `DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode cargo sqlx prepare --workspace`
      after schema changes.
- [x] Replace `tower-http`'s default `TraceLayer` with `SanitizedMakeSpan` that drops `Authorization` header from spans
- [ ] Extract a shared `zerocode-db` crate if duplication between `api/db.rs` and `worker/db.rs` grows
- [x] Removed `Cargo.lock.bak` exclusion from `.gitignore`
- [x] `cargo deny` config (`deny.toml`): license allowlist, advisory DB, ban openssl-sys, wildcard dep ban
- [x] CI: GitHub Actions — 7-job workflow (check, test, clippy, fmt, cargo-deny, docker-runner, docker-service)
- [x] End-to-end smoke test script (`scripts/smoke-test.sh`): docker-compose lifecycle, 6 test cases

---

_Last updated: 2026-05-13 (smoke test ✓, Prometheus metrics ✓, multi-arch Dockerfile ✓, ::metrics:: disambiguation fix, PostgreSQL 16 `binary` keyword fix, all 19 sqlx queries converted to compile-time `query!` macros with cached `.sqlx/` offline cache, compose project renamed `deploy` → `zerocode`, **v2 observability**: OTLP tracing export ✓ + Jaeger dev compose ✓, OpenAPI 3.1 spec at `/v1/openapi.json` ✓, **v2 continuation**: per-language slim runner images ✓ Core 7, auto-scaling pending-jobs gauge ✓, OpenAPI SDK generation script ✓, **v2 batching**: test-case batching ✓ POST `/v1/submissions/batch` + GET `/v1/batches/{id}` + pre-existing `tower_governor` "Unable To Extract Key!" bug fixed, **v2 gRPC**: `zerocode.v2.ZeroCode` service ✓ on `:9091` with CreateSubmission/GetSubmission/ListLanguages/GetHealth)._
