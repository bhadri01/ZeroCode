# Changelog

All notable changes to ZeroCode. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [SemVer](https://semver.org/) once `0.1.0` is tagged.

Pre-release work is grouped under `Unreleased` and tagged by plan phase. See
`~/.claude/plans/what-is-in-this-transient-engelbart.md` for the full design.

## [Unreleased]

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
  - All Core 6 ids present (48, 52, 60, 63, 71, 73)
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
