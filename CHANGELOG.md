# Changelog

All notable changes to ZeroCode. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [SemVer](https://semver.org/) once `0.1.0` is tagged.

Pre-release work is grouped under `Unreleased` and tagged by plan phase. See
`~/.claude/plans/what-is-in-this-transient-engelbart.md` for the full design.

## [Unreleased]

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
