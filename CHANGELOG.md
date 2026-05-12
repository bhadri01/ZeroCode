# Changelog

All notable changes to ZeroCode. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [SemVer](https://semver.org/) once `0.1.0` is tagged.

Pre-release work is grouped under `Unreleased` and tagged by plan phase. See
`~/.claude/plans/what-is-in-this-transient-engelbart.md` for the full design.

## [Unreleased]

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
