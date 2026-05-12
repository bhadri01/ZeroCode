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
- [ ] **End-to-end smoke test**: Postgres + API + worker + `curl POST /v1/submissions`
      with Python hello world, returns `Status::Accepted`
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
- [ ] **(Phase 2.5)** `pivot_root` into the read-only runner rootfs
- [x] Per-submission `/tmp` tmpfs (size 64 MB, nosuid+nodev)
- [ ] **(Phase 2.5)** Per-submission `/box` tmpfs sized to `memory_mb`
- [x] Loopback `lo` brought up inside NET namespace (SIOCSIFFLAGS ioctl)
- [ ] **(Phase 3)** `enable_network` flag in `LanguageSpec` (already wired in
      `ResourceLimits`; just needs the network ns to keep `lo` up but allow
      egress when set)
- [x] User-namespace UID/GID mapping (parent writes `/proc/<pid>/uid_map` after child unshare)
- [x] `PR_SET_CHILD_SUBREAPER` on worker boot
- [x] Periodic `waitpid(-1, WNOHANG)` zombie reaper (2 s cadence)
- [ ] **(Phase 5)** Verify with `capsh --print` from inside the sandbox

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
  - [ ] **(future)** Separate compile pipes so successful compiles can still
        surface warnings into `compile_output`
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
- [ ] `tests/edge_cases/api/` — API-level (table C from plan): deferred to Phase 5
- [ ] `tests/edge_cases/ops/` — DB drop, queue overflow, worker kill mid-job: deferred
- [ ] `tests/edge_cases/webhook/` — retry policy, HMAC, SSRF rejection: deferred
- [ ] Nightly matrix across kernel versions: deferred to CI setup

### Phase 4.6 — Performance hot path ✅ done (core items)

- [x] Result cache (`moka` in-process LRU, 10k entries, 5 min TTL) on `POST` path
      — cache check on POST, populate on `?wait=true` completion
- [ ] Compile-artifact cache (`compile_artifacts` table) consulted before compile sandbox
      — **deferred**: compiled binaries live in sandbox tmpfs, inaccessible from host;
        needs scratch-dir passthrough (Phase 5 or v2)
- [x] LISTEN/NOTIFY dispatch on `INSERT` (done in Phase 1; confirmed sub-5ms wake)
- [ ] Sandbox template pool — pre-build K cgroups + mount layouts + landlock rulesets
      — **deferred to v2**: Linux-only, needs profiling to validate win
- [x] HTTP/2 enabled end-to-end — `axum::serve` auto-negotiates h2c via hyper's auto builder
- [x] **Streaming endpoint**: `GET /v1/submissions/{token}/stream` — SSE from per-token Postgres NOTIFY
- [x] `?wait=true` long-poll optimization — LISTEN/NOTIFY with polling fallback
- [ ] `cargo bench` suite — `cargo bench` gate enforced in CI — **deferred to Phase 5**

### Phase 5 — Threat model + docs + load test ✅ done (core items)

- [x] `docs/THREAT_MODEL.md` — STRIDE pass, trust boundaries (ASCII diagram),
      defense-in-depth layers, known limitations, Judge0 CVE analysis
- [x] `docs/DEPLOY.md` — host preconditions, env vars, Docker Compose quickstart,
      runner rootfs setup, TLS termination, cgroup delegation, troubleshooting
- [x] `docs/ARCHITECTURE.md` — system overview (ASCII diagram), crate map,
      submission lifecycle, sandbox execution model, performance architecture,
      container image strategy, language table
- [ ] Load test with `oha` or `k6`: 100 RPS sustained across all 7 languages
      — **deferred**: requires running Linux stack with real sandbox
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
- [ ] Runner image size optimisation: per-language tags published
- [ ] Per-language edge-case smoke tests for new languages (Batch A–G)

---

## v2 — Performance + advanced

- [ ] **Firecracker microVM tier** with snapshot/restore (~5-10 ms cold-start)
- [ ] **WASM tier** (Wasmtime + cwasm pre-compilation) for Rust/Go/C/C++
- [ ] **CRIU interpreter snapshots** — pre-warmed CPython/JVM/Node images
- [ ] **Test-case batching** — single submission with N parallel test runs
- [ ] **gRPC API** alongside REST (binary protocol, HTTP/2 streaming)
- [ ] **WebSocket interactive REPL** sessions (Python, Node, Ruby)
- [ ] **Auto-scaling worker pool** driven by `pending_jobs / available_workers`
- [ ] **OTLP tracing export** (`opentelemetry-otlp`)
- [ ] **Prometheus metrics** endpoint
- [ ] **Multi-arch images** (arm64)
- [ ] **OpenAPI spec + generated SDKs** (Python, Node, Go)
- [ ] **Per-language minimal runner images** (instead of monolithic 3 GB image)
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

- [ ] Move runtime-checked `sqlx::query()` to compile-time `query!` once CI provisions a test Postgres
- [ ] Replace `tower-http`'s default `TraceLayer` with a span filter that drops sensitive headers
- [ ] Extract a shared `zerocode-db` crate if duplication between `api/db.rs` and `worker/db.rs` grows
- [ ] Remove `Cargo.lock.bak` exclusion once we're sure we never need to vendor lockfiles
- [x] `cargo deny` config (`deny.toml`): license allowlist, advisory DB, ban openssl-sys, wildcard dep ban
- [ ] CI: GitHub Actions for `cargo check`, `cargo test`, `cargo clippy`, `cargo fmt --check`,
      docker build, integration smoke test against a Postgres service

---

_Last updated: 2026-05-12 (operational hardening: retention, OOM, base64, deny.toml)._
