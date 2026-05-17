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
      **Dispatch wired**: `LanguageSpec.tier: SandboxTier` (`Native` |
      `Wasm`, defaults `Native`); `worker/sandbox_select.rs` returns a
      `TieredSandbox` that routes each job to the matching backend; worker
      `wasm` feature enables WasmSandbox. Registry entry `id=200 raw-wasm`
      with `tier="wasm"` accepts a pre-compiled `.wasm` as source_code.
      Still to do: WASI-targeted compile pipelines for Rust/Go/C/C++ (the
      sandbox runs `.wasm` today; the compile-to-wasm step is upstream of
      it and per-language); `cwasm` AOT pre-compilation.
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

## Web UI — landing, docs, code space

Self-hosted frontend served alongside the Rust API. API-only usage stays a
first-class path; the UI consumes the same public REST + gRPC surface that
external clients use, so nothing in the UI is privileged. Lives in a new
top-level `web/` directory (not a crate).

**Initial scaffold** lifted verbatim from a Claude Design handoff bundle on
2026-05-13: static HTML + React 18 UMD + Babel-standalone (in-browser JSX),
deep slate + rust-orange palette, Instrument Serif display + Figtree body +
IBM Plex Mono code. Serve `web/index.html` with any static server
(`python3 -m http.server` is enough for now). Build pipeline (Vite/Next) is
still TBD — keep the JSX modular so the migration is a syntactic lift.

### Stack decisions (record once chosen)

- [x] **Framework**: Vite + React 18 + TypeScript for `web/app/` (landing +
      playground), Astro 5 + Starlight 0.32 for `web/docs/`. Two sub-projects
      under a pnpm workspace so each gets its native toolchain; both emit into
      a unified `web/dist/` via `web/scripts/assemble-dist.mjs`.
- [x] **Hosting**: Embedded in `zerocode-api` as static assets. The router
      mounts `tower_http::services::ServeDir` as a fallback against
      `ZEROCODE_WEB_DIR` (default `web/dist`); empty value or missing dir is
      skipped gracefully so dev mode without a built web/ still boots.
- [x] **Editor**: CodeMirror 6 integrated in the ported playground. Custom
      **Monokai Pro** theme at `web/app/src/playground/monokai.ts` (palette +
      HighlightStyle bound to `@lezer/highlight` tags). Extensions: line
      numbers + fold gutter, active-line + gutter highlight, bracket matching
      + close-brackets, search/replace panel (⌘F), selection-match highlight,
      rectangular selection, indent-with-tab. Six `@codemirror/lang-*` packs
      cover the Core 7 (C and C++ share `lang-cpp`).
- [x] **Docs engine**: Astro Starlight on top of MDX in `web/docs/`. Sidebar
      defined in `web/docs/astro.config.mjs`, content collections via
      `src/content.config.ts`, base path `/docs/` so it serves at the
      `/docs/*` subpath under the API.
- [x] Shared design tokens between landing / docs / code space —
      `web/shared/tokens.css` (dark/light, accents, status colors, type stack);
      copied to `web/app/src/shared/tokens.css` and themed for Starlight via
      `web/docs/src/styles/tokens.css`.
- [x] **Package manager**: pnpm 10 (`web/pnpm-workspace.yaml`).
- [x] **Language**: TypeScript end-to-end. `web/shared/{theme,api}.js` ported
      to `web/app/src/shared/{theme,api}.ts`.
- [~] Typed API client: **deferred**. `web/app/src/shared/api.ts` is the
      typed surface today — hand-written TypeScript with full request /
      response types per endpoint. SSE long-poll + idempotency-key handling
      are bespoke (OpenAPI-generated clients don't carry these well).
      Revisit once `/v1/openapi.json` covers every endpoint we hit.

### Landing page

- [x] **Scaffolded** in `web/index.html` — 8 JSX modules under `web/landing/`
- [x] Hero with animated 8-layer concentric-ring diagram, curl terminal,
      kicker line (`v0.1.4 · rust 1.85 · kernel ≥ 5.14`), and "get started /
      view on github / open playground" CTAs (`landing/hero.jsx` + `layer-diagram.jsx`)
- [x] Trust strip with 5 stats (8 layers · 41 langs · <5ms · 71 tests · 0 CVEs)
      (`landing/sections.jsx`)
- [x] "Why ZeroCode" three-up: Security · Speed · Compatibility, with glyphs +
      data points (`landing/sections.jsx`)
- [x] Architecture SVG diagram (Client → API → Postgres ↔ Worker → Sandbox → Runtime)
      with animated forward path + dashed return path (`landing/diagrams.jsx`)
- [x] Language matrix: Core 7 as detailed cards + 34 compact chips
      (`landing/languages.jsx`)
- [x] Embedded playground teaser with simulated SSE streaming Queued →
      Processing → Accepted (`landing/playground-teaser.jsx`)
- [x] Judge0 comparison table — 12 honest rows including wins for Judge0
      (`landing/diagrams.jsx`)
- [x] Deploy section with tabbed snippets (Docker Compose / Helm / from source)
      (`landing/sections.jsx`)
- [x] Footer with product / developers / company columns, license + kernel +
      version bottom-strip (`landing/sections.jsx`)
- [x] Dark/light theme tokens defined; design defaults to dark
- [x] Language search/filter on the 41-chip matrix — name / id / version / kind
      with empty-state, count chip, and clear button (`landing/languages.jsx`)
- [x] `prefers-reduced-motion` honored — RAF loop short-circuits, packet parks
      mid-cycle so passed/active/upcoming rings still read (`landing/layer-diagram.jsx`)
- [x] Replaced Claude Design tweaks-panel with a production theme toggle in
      the nav. Theme manager at `web/shared/theme.js` persists to localStorage
      and reacts to OS `prefers-color-scheme` changes when no explicit pref
      is set. Orphan `tweaks-panel.jsx` deleted.
- [ ] Wire real GitHub star count + version chip from a build-time fetch

### Docs site

- [x] **Scaffolded** in `web/docs.html` — shell + content modules under `web/docs/`
- [x] Docs shell with top nav, left sidebar IA (5 sections, 9 pages), scrollable
      content area, right-rail TOC with scroll-spy, hash-routed page switching
      (`docs/app.jsx`)
- [x] Quickstart page (`docs/content.jsx#quickstart`)
- [x] REST API reference page — written by hand for now (`docs/content.jsx#api`)
- [x] Language catalog page placeholder (`docs/content.jsx#languages`)
- [x] Architecture page — full content ported from `docs/ARCHITECTURE.md`:
      system overview · channels table · 7-crate map · 9-step lifecycle
      diagram · parent↔child handshake · perf table · 3-image table
- [x] Threat model page with detailed 8-layer concentric-ring diagram +
      STRIDE table + Judge0 CVE comparison (`docs/content.jsx#security`,
      reuses `landing/layer-diagram.jsx` with `variant="detailed"`)
- [x] Deployment page — full content ported from `docs/DEPLOY.md`: host
      preflight · env var tables for API + worker · compose quickstart ·
      rootfs extraction · TLS proxy snippet · cgroup delegation (systemd
      + compose) · troubleshooting table
- [x] SDKs page — OpenAPI 3.1 spec endpoint · `scripts/generate-sdks.sh`
      driver · Python/TypeScript/Go usage examples · REST vs. gRPC table
- [x] gRPC reference page (NEW) auto-mirrored from
      `crates/zerocode-api/proto/zerocode.proto` — service surface,
      messages, auth header, `grpcurl` examples (`docs/content.jsx#grpc`,
      wired into `docs/app.jsx` PAGES)
- [x] Observability page — Prometheus series table · OTLP env-gated +
      Jaeger dev compose snippet · structured-logs JSON-lines guidance ·
      starter Grafana dashboard pointer
- [x] Changelog page — Unreleased / v0.1.4 / v0.1.3 / v0.1.2 / v0.1.1 +
      versioning policy
- [x] **⌘K palette** — client-side fuzzy search across every page and
      every TOC section (60+ entries). Token-aware scorer, arrow-key
      navigation, hash-routed pick. (`docs/app.jsx · SearchPalette`)
- [x] **"Edit on GitHub"** link per page — `docs/app.jsx · SOURCE_FOR_PAGE`
      maps each docs page to its source file in the repo (markdown for
      ported pages, the proto for gRPC, the JSX module for auto-generated
      pages).
- [x] **Cross-app nav from docs** (2026-05-17) — without this, every
      `/docs/*` page was a dead-end. Two paths home:
      (1) `web/docs/src/components/HeaderLinks.astro` overrides Starlight's
      `SocialIcons` to prepend `home` + `playground` text links to the
      header (≥ 50 em only; mobile uses the menu).
      (2) Top-of-sidebar `← Home` + `Playground` entries (always visible,
      including mobile menu) — both carry `data-astro-reload` so the
      Astro router does a full browser navigation instead of trying to
      client-route into Vite's territory.
- [ ] Replace hand-written REST reference with auto-generation from
      `/v1/openapi.json` at build time (currently hand-written content
      already covers every endpoint)
- [ ] Versioned URLs (`/v0.1/docs`, `/v0.2/docs`) once we have ≥ 2
      released versions to switch between

### Code Space (in-browser playground)

- [x] **Scaffolded** in `web/playground.html` — `playground/app.jsx` + `playground/data.jsx`
- [x] Top nav with token chip + cross-app links to `/` and `/docs/` —
      the orphan "code space · untitled" breadcrumb was removed (2026-05-17)
      since the playground has no file-naming model to attach it to.
- [x] Searchable language picker rail (41 langs) with Core 7 pinned + history (`playground/app.jsx`)
- [x] Syntax-highlighted editor — **CodeMirror 6 with Monokai Pro** at
      `web/app/src/playground/Editor.tsx`. Replaces the legacy custom
      tokenizer. Fold gutter, bracket auto-close, search panel (⌘F),
      selection-match highlighting, rectangular selection, indent-with-tab.
      Six `@codemirror/lang-*` packs (python / javascript / rust / go /
      cpp / java).
- [x] **First-run-stale-result bug fixed** (2026-05-17). Root cause:
      `run` was `useCallback`-memoized on `[status, apiOnline, probeApi]`;
      it captured the first render's `runOnApi`, whose closure had stale
      `code`/`lang`/`stdin`/`limits`. First click submitted the previous
      source (idempotency cache hit → previous result); second click hit
      a recreated `run` with current state. Fix at
      `web/app/src/playground/App.tsx`: route `runOnApi` through a
      `useRef` updated every render so memoized `run` always invokes the
      latest closure.
- [x] **Stdin as a separate persistent pane** (2026-05-17) — replaced the
      collapse-to-toggle drawer with `StdinPanel` in its own resizable row
      below the editor: header (`stdin · N chars · clear`) + full-height
      textarea, always visible. Sits between editor and output in the
      center column.
- [x] **Workspace bar (slim)**: language version chip, status pill,
      **⌘↵ to run**, reset, memory/time limit sliders, share. The legacy
      `api` text button and the duplicate gear-icon settings button were
      removed (2026-05-17); settings is still reachable via the
      `live`/`offline`/`no auth` status pill on the left.
- [x] Tabbed output pane (stdout · stderr · compile · meta) with simulated
      SSE streaming Queued → Processing → Accepted (`playground/app.jsx`)
- [x] Status pill state machine (Queued / Processing / Accepted / TLE / MLE /
      RE / CE / Sandbox) using shared status-color tokens
- [x] Memory + wall-time sliders wired to a server-fetched ceiling
      (computed from `/v1/languages` on probe success), with a "server
      ceilings" / "client defaults" label flip in the popover. **pids
      slider dropped** — the REST API doesn't accept a client override
      for `max_pids` (resolved per-language on the server).
- [~] **"Open in API" modal removed** (2026-05-17). Originally implemented
      with curl + gRPC snippets generated from the current source/limits;
      removed at user request as redundant — the same snippets live in the
      docs SDK page, and the in-playground modal duplicated state without
      pulling its weight. If we resurrect it, prefer rendering server-side
      from the OpenAPI spec rather than hand-templating in the bundle.
- [x] Empty-state example snippets per language (41 entries in `playground/data.jsx`)
- [x] Submission history rail — now backed by `localStorage` (20-entry cap)
      with verdict, token, and timestamp per row
- [x] Status strip at the bottom (token · wall · cpu · memory · exit) +
      `live api` / `demo` mode chip
- [x] **Real `POST /v1/submissions` + SSE** integration via
      `web/shared/api.js` — request shape now matches the Rust contract:
      `memory_limit_mb` / `cpu_time_limit` / `wall_time_limit` + body-level
      `base64_encoded: true`. SSE events `processing` / `stdout` / `stderr` /
      `finished` are JSON-parsed (`{data: "..."}` and `{status: {kind, detail}}`).
      Verdicts decoded from the tagged Status object into a flat code
      (accepted / tle / mle / ole / ce / re / nze / se / cancelled / expired).
      Outputs round-trip via `?base64_encoded=true` and `decode()` on the
      client. Sends an Idempotency-Key on each submit.
- [x] **SSE → polling fallback** — when the stream errors out, the run
      falls through to `poll(token, intervalMs=400)` against `GET
      /v1/submissions/{token}` until terminal status.
- [x] **Settings dialog** (`web/playground/app.jsx · SettingsDialog`) —
      API base URL + bearer key inputs, "test connection" hits
      `/v1/health` then `/v1/languages` so a bad bearer is caught up-front,
      "clear" wipes localStorage, "save · reload api" reprobes the API and
      flips the workspace bar to `live api` / `no auth` / `demo`.
- [x] **Cancel button** while running — drops the SSE stream client-side
      (server-side cancellation is a v2 API). ⌘. keyboard shortcut.
- [x] **Verdict colors per kind** — chip colour pulled from
      `--st-accepted` / `--st-tle` / `--st-mle` / `--st-ce` / `--st-re` /
      `--st-se` tokens, plus a status-detail line ("wall", signal name,
      etc.). Output pane auto-jumps to compile/stderr/meta on the
      relevant verdict.
- [x] **Server-fetched language versions** — after probe success, the
      version chip + "Open in API" snippet reflect what the server actually
      reports rather than the snapshot in `playground/data.jsx`.
- [x] **Error bar** — surfaces transport-level failures with `retry` and
      (when auth is the issue) an `open settings` shortcut.
- [x] **Share link** via URL hash (`#code=…&stdin=…&lang=73&token=zc_…`) —
      `share` button in the workspace bar copies the current URL; opening
      a share-linked URL restores source / stdin / language / token.
      `localStorage` also caches the in-progress draft so reloads aren't
      destructive.
- [x] Mobile-friendly layout — three-column desktop split collapses to a
      stack at ≤ 880 px (rail on top with bounded height, editor in the
      middle, output below); workspace bar + status strip wrap; top nav
      reflows below ≤ 760 px (`playground/app.jsx` + `playground.html`
      media queries). Splitters auto-hide below 880 px since the layout
      stacks vertically.
- [x] **Resizable splits across the full layout** (2026-05-17) — three
      drag handles in `App.tsx`: vertical between rail & center column,
      horizontal between editor & stdin, horizontal between stdin &
      output. Sizes persisted to `localStorage` under
      `zerocode:pg:layout-v1` with sane clamps (rail 180–460 px,
      editor ≥ 140 px, stdin ≥ 80 px). Hover handle → 4 px hit region
      highlights in accent; drag locks the document cursor to
      `col-resize`/`row-resize` and disables text selection until release.
      Bundled as a generic `<Splitter direction="vertical|horizontal"
      onDrag={delta=>...} />` component.
- [x] **Stale-result on first run** fixed (see above under editor entry).
- [ ] Anonymous play rate limit + signed-in higher quota + persistent history
      backed by `GET /v1/submissions` (server-side; needs auth tier). The
      anon rate-limit half is wired today via `ZEROCODE_ALLOW_ANONYMOUS`
      + `ZEROCODE_ANON_MAX_PER_WINDOW` env vars in `deploy/docker-compose.yml`;
      the auth tier + persistent history are still open.

### Plumbing & integration

- [~] CORS configurable on API via `ZEROCODE_CORS_ORIGINS` env
      (dev compose sets `*`); a production allowlist + per-origin
      `Access-Control-Allow-Credentials` policy is still open.
- [x] **CSP + COOP + security-header stack** (2026-05-17) on the static
      fallback in `crates/zerocode-api/src/routes/mod.rs`. Six headers
      injected only on responses from `ServeDir` (not `/v1/*`):
      `Content-Security-Policy` (`default-src 'self'`; `script-src` /
      `style-src` allow `'unsafe-inline'` for Starlight theme bootstrap +
      React `<style>` blocks; `frame-ancestors 'none'`), `Cross-Origin-Opener-Policy: same-origin`,
      `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
      `Permissions-Policy` denying camera/mic/geolocation/payment, and
      legacy `X-Frame-Options: DENY`. COEP intentionally omitted —
      `require-corp` would break loading without SharedArrayBuffer payoff.
      Tower-http `set-header` feature added to the workspace dep.
- [ ] Auth tier for UI users (browser session → short-lived UI API key vs. server API keys)
- [~] Anonymous quota wired via `tower_governor` with `ZEROCODE_ALLOW_ANONYMOUS`
      + `ZEROCODE_ANON_MAX_PER_WINDOW` / `ZEROCODE_ANON_WINDOW_SECS` env vars;
      cookie/IP bucket tuning is operator-side.
- [ ] Decide SSE vs. WebSocket for live output behind reverse proxies
- [x] **Frontend CI**: `.github/workflows/web.yml` runs
      pnpm install (frozen lockfile) → `pnpm -r typecheck` → `pnpm build`
      (assembles `web/dist/` with both app + docs) → sanity-check key
      output files → upload artifact. Triggers on `web/**` or workflow
      changes. Live smoke-test against a running API is still open.
- [x] **Build pipeline**: `deploy/Dockerfile.service` now has a `node:20` `web`
      stage that runs `pnpm install && pnpm build`; the resulting `web/dist/`
      is copied into `/srv/web` in the distroless final image with
      `ZEROCODE_WEB_DIR=/srv/web` set. Service image is the single artifact —
      no separate `Dockerfile.web` needed under this hosting model.
- [ ] `docker-compose.yml` wires up `web` service alongside `api` / `worker`
      *(not needed under embedded hosting; revisit if model changes)*
- [x] **README + docs note**: "UI is optional; the API is the contract" —
      `README.md` Web UI section already carries the line and the env-var
      table; extended (2026-05-17) with a callout describing the
      security-header stack so operators know what's set automatically.

### Content port (done)

- [x] Migrated `web/landing/*.jsx` → `web/app/src/landing/*.tsx` (8 modules).
- [x] Migrated `web/playground/*.jsx` → `web/app/src/playground/*.tsx` and
      swapped the Monaco-CDN editor for bundled CodeMirror 6 with
      `@codemirror/lang-python`, `-javascript`, `-rust`, `-go`, `-cpp`,
      `-java`. **Premium Monokai Pro theme** at
      `web/app/src/playground/monokai.ts` (palette + `HighlightStyle` bound
      to `@lezer/highlight` tags) replaces `@codemirror/theme-one-dark`;
      editor surface stays Monokai under both light and dark page themes.
      Added fold gutter, bracket auto-close, search panel (`@codemirror/search`),
      autocomplete shell, selection-match highlight, and rectangular
      selection.
- [x] Migrated `web/docs/content.jsx` content → MDX under
      `web/docs/src/content/docs/` (11 pages: index, quickstart, api, grpc,
      sdks, languages, architecture, deployment, observability, security,
      changelog). Starlight handles sidebar, search (Pagefind), and the
      "Edit on GitHub" link.
- [x] Deleted root-level `web/{index.html,docs.html,playground.html}` plus
      `web/{landing,docs/*.jsx,playground,shared}` — only `web/{app,docs,scripts}`
      remain in the workspace.
- [ ] Generate the TS SDK with `scripts/generate-sdks.sh --generators=typescript`
      and wire it into `web/app/src/sdk/`. The hand-typed `shared/api.ts`
      covers REST + SSE today; SDK codegen needs a running API instance.

### CI

- [x] `.github/workflows/web.yml` — pnpm install + typecheck + build +
      `web/dist/` sanity check on every push/PR that touches `web/`. Uploads
      the built bundle as a 7-day artifact.

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

_Last updated: 2026-05-17 — **web/ migration + deploy complete**. Stack locked:
pnpm workspace at `web/`, Vite+React+TS for landing/playground (`web/app/`)
+ Astro+Starlight for docs (`web/docs/`), unified build assembled into
`web/dist/` by `web/scripts/assemble-dist.mjs`, embedded in `zerocode-api`
via `tower-http` `ServeDir` gated on `ZEROCODE_WEB_DIR` (default `/srv/web`),
`deploy/Dockerfile.service` runs `pnpm install && pnpm build` in a node:20
stage and copies `web/dist/` into the distroless final image. Content port
done: landing TSX, playground TSX, 11 docs MDX pages. **Playground polish
pass (2026-05-17)**: CodeMirror 6 with bespoke **Monokai Pro** theme
(`web/app/src/playground/monokai.ts`), fold gutter, bracket auto-close, ⌘F
search panel, selection-match highlight, rectangular selection;
**first-run-stale-result bug fixed** — `useCallback` memoization captured
old `runOnApi` closure with stale code, fix at `App.tsx` routes `runOnApi`
through a `useRef` updated every render; vs-Judge0 comparison section
removed from the landing. Stack now live at `http://localhost:8080/`
(landing), `/playground.html` (CodeMirror+Monokai IDE), `/docs/` (Starlight).
**Playground polish pass** (2026-05-17 cont'd): "code space · untitled"
breadcrumb deleted; `api` text button + duplicate gear-icon settings
button + the entire `ApiModal` component removed (settings still reachable
via the live-status pill); stdin promoted from a collapse-to-toggle drawer
to a `StdinPanel` separate persistent pane between editor and output;
generic `<Splitter>` component plus three resizable handles (rail↔center,
editor↔stdin, stdin↔output) with sizes persisted to
`localStorage:zerocode:pg:layout-v1` and clamps to prevent collapse;
splitters auto-hide on mobile (≤ 880 px). **Cross-app nav from docs**:
Starlight `SocialIcons` overridden with `HeaderLinks.astro` to add
`home` + `playground` text links in the header, plus `← Home` +
`Playground` entries at the top of every sidebar — both via
`data-astro-reload` so the browser does a full navigation back into
the Vite-served pages instead of trying to client-route. Earlier note: 2026-05-13 (smoke test ✓, Prometheus metrics ✓, multi-arch Dockerfile ✓, ::metrics:: disambiguation fix, PostgreSQL 16 `binary` keyword fix, all 19 sqlx queries converted to compile-time `query!` macros with cached `.sqlx/` offline cache, compose project renamed `deploy` → `zerocode`, **v2 observability**: OTLP tracing export ✓ + Jaeger dev compose ✓, OpenAPI 3.1 spec at `/v1/openapi.json` ✓, **v2 continuation**: per-language slim runner images ✓ Core 7, auto-scaling pending-jobs gauge ✓, OpenAPI SDK generation script ✓, **v2 batching**: test-case batching ✓ POST `/v1/submissions/batch` + GET `/v1/batches/{id}` + pre-existing `tower_governor` "Unable To Extract Key!" bug fixed, **v2 gRPC**: `zerocode.v2.ZeroCode` service ✓ on `:9091` with CreateSubmission/GetSubmission/ListLanguages/GetHealth, **web UI scoped**: landing + docs + in-browser code space planned as `web/` workspace consuming the public REST/gRPC API, **landing scaffolded**: `web/index.html` + 8 JSX modules ported from Claude Design handoff — hero with animated 8-layer concentric-ring diagram, trust strip, three-up, architecture SVG, 41-language matrix, playground teaser, Judge0 comparison, deploy tabs, footer; serves via plain `python3 -m http.server` for now, **playground + docs scaffolded**: `web/playground.html` (rail/editor/output IDE with simulated SSE streaming, 41-lang picker, limit sliders, "Open in API" modal with curl/gRPC/Python/TS snippets, ⌘↵ run) + `web/docs.html` (sidebar IA + scroll-spy + hash routing, Quickstart/API/Security pages written, Architecture/Deployment/SDKs/Observability/Changelog as placeholders, detailed 8-layer diagram reused on security page), **landing/docs/playground completion pass**: language search/filter on 41-chip matrix ✓, prefers-reduced-motion on 8-layer diagram ✓, Claude Design tweaks-panel replaced with production theme toggle (`web/shared/theme.js`) ✓ and orphan file deleted, all 5 placeholder docs pages fleshed out from `docs/*.md` ✓, new gRPC reference page auto-mirrored from `crates/zerocode-api/proto/zerocode.proto` ✓, ⌘K fuzzy-search palette across pages + TOC sections ✓, "Edit on GitHub" link per docs page ✓, playground wired to real `POST /v1/submissions` + SSE via `web/shared/api.js` with simulation fallback ✓, share link via URL hash with `localStorage` draft persistence ✓, submission history persisted to `localStorage` (20-entry cap) ✓, sliders wired to `/v1/languages` ceilings ✓, mobile-friendly responsive layout for playground + docs ≤880 px ✓)._
