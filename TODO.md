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
- [ ] **Boot-time kernel preflight** wired into worker startup (today it's a public
      function in `kernel_check`; not yet invoked outside `NativeSandbox::new`)
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

### Phase 3 — Remaining Core 6 languages

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
- [ ] **Phase 3c — Java 21 LTS**
  - [ ] `javac` + `java Main` two-phase
  - [ ] `JAVA_TOOL_OPTIONS=-Xmx<mem-256>m -Xss512k -XX:MaxMetaspaceSize=128m
        -XX:ReservedCodeCacheSize=64m -XX:+ExitOnOutOfMemoryError`
  - [ ] `pids.max` bumped to 96 (JVM thread floor)
  - [ ] Seccomp augmented for `clone3`, `membarrier`, `futex_waitv`

### Phase 4 — API polish

- [ ] Webhook callbacks: HTTP POST + HMAC-SHA256 signature (`X-ZeroCode-Signature`)
- [ ] Webhook retry policy: 3 attempts at 1 s / 5 s / 30 s with ±20% jitter
- [ ] `callback_status` column (delivered / failed_after_retries)
- [ ] `?wait=true` synchronous mode (timeout 30 s; backed by Postgres `LISTEN` on `submission.finished:<token>`)
- [ ] `?base64_encoded=true` / `?output_mode=text|base64` modes
- [ ] Pagination on `GET /v1/submissions` (`?page`, `?per_page`, `?status`)
- [ ] Rate limiting via `tower_governor` (global 100 RPS, per-key 20 RPS)
- [ ] Graceful drain on SIGTERM (30 s deadline)
- [ ] `?wait=true` long-poll over `LISTEN` (not client polling)

### Phase 4.5 — Failure-injection + edge-case test suite

- [ ] `tests/edge_cases/common/` (language-agnostic sandbox)
  - [ ] fork bomb → `RuntimeError(pids exceeded)`
  - [ ] `while True: pass` → `TimeLimitExceeded(Wall)`
  - [ ] `[0] * 10**9` → `MemoryLimitExceeded` with `oom_kill`
  - [ ] Open 10k FDs → bounded
  - [ ] `print("x" * 10**8)` → stdout ring-buffer wrap
  - [ ] Spawn 100 threads → `pids.max` triggers
  - [ ] `mmap` huge anon region → cgroup OOM
  - [ ] `os.system("ls /")` → blocked / not escaping `/box`
  - [ ] Symlink `/box/foo → /etc/passwd` → blocked by landlock
  - [ ] Exit 0 instantly → `Accepted`
  - [ ] SIGSEGV → `RuntimeError(Sigsegv)`
- [ ] Per-language shards (`python/`, `node/`, `go/`, `rust/`, `c_cpp/`, `java/`)
- [ ] `tests/edge_cases/api/` — every row in Table C
- [ ] `tests/edge_cases/ops/` — DB drop, queue overflow, worker kill mid-job
- [ ] `tests/edge_cases/webhook/` — retry policy, HMAC, SSRF rejection
- [ ] Nightly matrix run across kernel versions 5.13 / 5.14 / 5.19 / 6.1 / 6.6 / latest

### Phase 4.6 — Performance hot path

- [ ] Result cache (`moka` in-process LRU, 10k entries, 5 min TTL) on `POST` path
- [ ] Compile-artifact cache (`compile_artifacts` table) consulted before compile sandbox
- [ ] LISTEN/NOTIFY dispatch on `INSERT` (already done in Phase 1; reaffirm sub-5ms wake)
- [ ] Sandbox template pool — pre-build K cgroups + mount layouts + landlock rulesets at worker boot, acquire/release per submission
- [ ] HTTP/2 enabled end-to-end (axum + hyper)
- [ ] **Streaming endpoint**: `GET /v1/submissions/{token}/stream` — Server-Sent Events from worker via per-token Postgres NOTIFY
- [ ] `?wait=true` long-poll optimization (no client polling)
- [ ] `cargo bench` suite — `cargo bench` gate enforced in CI

### Phase 5 — Threat model + docs + load test

- [ ] `docs/THREAT_MODEL.md` — STRIDE pass, known limitations, trust boundaries
- [ ] `docs/DEPLOY.md` — host preconditions (kernel ≥5.14, cgroup v2 unified,
      `unprivileged_userns_clone=1`, delegated `/sys/fs/cgroup`)
- [ ] `docs/ARCHITECTURE.md` — implementation-aligned version of the plan
- [ ] Load test with `oha` or `k6`: 100 RPS sustained across all 6 languages
- [ ] README quickstart polish
- [ ] `cargo clippy --workspace -- -D warnings` clean
- [ ] `cargo deny check` clean

### Operational & security hardening (v1 must-haves) — cross-cutting

- [x] Body size cap (256 KB), field caps (64 KB source/stdin)
- [x] Output ring-buffer cap with overflow marker
- [x] Per-worker `Semaphore` for sandbox concurrency
- [x] DB pool sizing: API max=16, worker max=4
- [x] `claimed_at` + `worker_id` for sweeper recovery
- [x] Constant-time API key compare
- [ ] `tower_governor` rate limiting
- [ ] Graceful SIGTERM drain (currently only the listener stops; in-flight jobs need explicit handling)
- [ ] HMAC-signed webhooks
- [ ] Retention job: 24 h row TTL, 1 h payload TTL
- [ ] `PR_SET_CHILD_SUBREAPER` + zombie reaper
- [ ] Read-only service rootfs in compose (already set; verify under real load)
- [ ] Worker `OOMScoreAdj=-500`
- [ ] Loopback `lo` up inside NET namespace
- [ ] `LANG=C.UTF-8` env in sandbox (done in `exec.rs`)
- [ ] `/v1/health` vs `/v1/ready` split (done)
- [ ] Don't log source/stdin/stdout at INFO (current logging hygiene satisfies this; lint with a tracing filter post-Phase 5)

---

## v1.5 — Judge0 catalog parity (~35 languages)

- [ ] **Batch A — Single-binary interpreted** (Bash, Lua, Perl, Ruby, R, PHP, TypeScript via tsx)
- [ ] **Batch B — Native GCC family** (Fortran, Pascal/FPC, D/LDC, Objective-C, NASM, Ada/GNAT)
- [ ] **Batch C — JVM family** (Kotlin, Scala 3, Groovy, Clojure)
- [ ] **Batch D — Functional / ML** (Haskell/GHC, OCaml 5, Erlang/OTP 27, Elixir, SBCL)
- [ ] **Batch E — .NET** (C# .NET 9, F# .NET 9)
- [ ] **Batch F — Niche** (COBOL/GnuCOBOL, SWI-Prolog, Swift 6, Octave 9, SQLite)
- [ ] **Batch G — Beyond Judge0** (Zig, Nim, Crystal, Dart, Julia)
- [ ] Runner image size optimisation: per-language tags published
- [ ] `runners/languages.toml` audited; archived versions migrated

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
- [ ] `cargo deny` config to whitelist licenses + ban known-bad crates
- [ ] CI: GitHub Actions for `cargo check`, `cargo test`, `cargo clippy`, `cargo fmt --check`,
      docker build, integration smoke test against a Postgres service

---

_Last updated: 2026-05-12 (Phase 2 commit pending)._
