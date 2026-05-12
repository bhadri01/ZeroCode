# ZeroCode Architecture

> Sandboxed code execution service. Rust workspace, Linux namespaces + cgroups v2
> isolation, Postgres-backed queue with LISTEN/NOTIFY dispatch.


## 1. System overview

```
                              SSE stream (GET /v1/submissions/{token}/stream)
                              +-------------------------------------------------+
                              |                                                 |
  client                      v                                                 |
    |                                                                           |
    |  POST /v1/submissions?wait=true                                           |
    |                                                                           |
    v                                                                           |
+--------+   axum (tower-http)    +----------+   INSERT + pg_notify             |
|  API   | ---------------------> | Postgres | ---- zerocode.jobs -----------+  |
| server |                        |          |                               |  |
+--------+                        +----------+                               |  |
    ^                                  ^  |                                  v  |
    |                                  |  |  LISTEN zerocode.jobs       +--------+
    |  result cache (moka)             |  +----------------------------> Worker |
    |  content-hash -> Submission      |     claim_next (FOR UPDATE     +--------+
    |                                  |     SKIP LOCKED)                    |
    |                                  |                                    |
    |                 write_result -----+                                    v
    |                 pg_notify(zerocode.events.<token>)              +-----------+
    |                                                                | Sandbox   |
    +--- LISTEN zerocode.events.<token> ------- Event::Finished --+  | (native)  |
    |                                                             |  +-----------+
    +--- ?wait=true long-poll (fallback: 200 ms DB poll) <--------+       |
                                                                          v
                                                                   +-----------+
                                                                   | Language   |
                                                                   | runtime   |
                                                                   | (runner    |
                                                                   |  rootfs)   |
                                                                   +-----------+
```

**Channels:**
- `zerocode.jobs` -- API fires `pg_notify` after every submission INSERT.
  Workers LISTEN on this channel and wake immediately (sub-5 ms dispatch).
- `zerocode.events.<token>` -- per-submission lifecycle channel. The worker
  publishes `Processing`, `StdoutChunk`, `StderrChunk`, and `Finished` events.
  The API subscribes when serving SSE streams or `?wait=true` long-polls.

Both sides keep a 2-second polling fallback if the LISTEN connection drops.


## 2. Crate map

The workspace (`Cargo.toml` at the repo root, resolver v2) contains seven crates:

| Crate | Purpose | Key types | Depends on |
|---|---|---|---|
| **zerocode-core** | Shared domain types and validation. No I/O, no async. Pure data definitions used by every other crate. | `Submission`, `SubmissionRequest`, `LanguageSpec`, `LanguageRegistry`, `ResourceLimits`, `Status`, `Signal`, `Token`, `Payload` | (none -- leaf crate) |
| **zerocode-sandbox** | Isolation backends behind the `Sandbox` trait. `NaiveSandbox` (feature `unsafe-naive`) for dev; `NativeSandbox` (feature `native`) for production. The native backend uses `fork` + Linux namespaces + cgroups v2 + landlock + seccomp. | `Sandbox` (trait), `SandboxJob`, `SandboxResult`, `SandboxError`, `NativeSandbox`, `NativeSandboxConfig` | zerocode-core |
| **zerocode-cache** | Two-tier caching. `ResultCache`: in-process moka LRU (10k entries, 5 min TTL) keyed on blake3 content hash of `(language_id, source, stdin, limits)`. `CompileCache`: Postgres-backed binary artifact cache keyed on `(language_id, source)`. | `ResultCache`, `CachedOutcome`, `CompileCache`, `CompileArtifact`, `CacheKey` | zerocode-core |
| **zerocode-stream** | Postgres LISTEN/NOTIFY abstraction. Exposes `JobNotifier` (API -> workers) on `zerocode.jobs` and per-token `EventStream` (worker -> API) on `zerocode.events.<token>`. | `JobNotifier`, `Event`, `EventStream`, `listen_for_jobs`, `publish_event`, `subscribe` | zerocode-core |
| **zerocode-migrate** | Standalone binary that runs sqlx migrations against Postgres. Ships in the service container image. No workspace crate dependencies. | (binary only) | (none) |
| **zerocode-api** | HTTP server (axum + tower-http). Bearer auth, rate limiting (tower_governor), routes for submissions CRUD, language listing, SSE streaming, health/readiness probes. Holds `AppState` with the PgPool, language registry, job notifier, and result cache. | `AppState`, router, `SubmissionAck`, `CreateParams` | zerocode-core, zerocode-cache, zerocode-stream |
| **zerocode-worker** | Long-running binary. `Runner` loop: LISTEN for jobs -> `claim_next` (SELECT FOR UPDATE SKIP LOCKED) -> `Sandbox::execute` -> `write_result` -> `publish_event` -> webhook delivery. Concurrency bounded by a tokio `Semaphore`. | `Runner`, `ClaimedJob`, `process` | zerocode-core, zerocode-sandbox, zerocode-cache, zerocode-stream |

Dependency graph (simplified):

```
zerocode-core  <------+------+------+------+
                       |      |      |      |
              zerocode-sandbox |  zerocode-cache  zerocode-stream
                       |      |      |      |
                       |      +------+------+
                       |      |      |
                  zerocode-worker  zerocode-api
```


## 3. Submission lifecycle

1. **POST /v1/submissions** -- the API validates `source_code` (non-empty,
   <= 64 KB) and optional `stdin` (<= 64 KB). Resolves `language_id` against
   the `LanguageRegistry` loaded from `runners/languages.toml` at boot.
   See `crates/zerocode-api/src/routes/submissions.rs`.

2. **Limit resolution** -- per-submission limits are merged:
   `request overrides -> language defaults -> global ceiling`. The language
   spec may declare `default_limits` (e.g. Java's 512 MB / 96 pids) and
   `compile_limits`; the API config provides a hard ceiling.

3. **Result cache check** -- a blake3 content hash of
   `(language_id, source_code, stdin, limits)` is computed via `CacheKey::result`.
   If the moka LRU holds a hit, the cached `Submission` is returned immediately
   without touching the queue.

4. **INSERT + pg_notify** -- the submission row is written to Postgres in
   `queued` status. The API then calls `JobNotifier::notify(token)`, which
   executes `SELECT pg_notify('zerocode.jobs', $token)`.

5. **Worker wake** -- the worker's `Runner::run` loop LISTENs on
   `zerocode.jobs`. On notification (or 2-second poll fallback), it enters
   the drain loop.

6. **Claim** -- `db::claim_next` executes
   `SELECT ... FROM submissions WHERE status = 'queued' ORDER BY created_at
   FOR UPDATE SKIP LOCKED LIMIT 1`, atomically setting `status = 'processing'`
   and `worker_id`. SKIP LOCKED means multiple workers never contend on the
   same row.

7. **Sandbox execute** -- the worker builds a `SandboxJob` and calls
   `Sandbox::execute`. The native backend runs in `spawn_blocking`:
   create cgroup -> create scratch dir -> fork child -> wait -> triage.
   See section 4 for the full execution model.

8. **Write result** -- `db::write_result` updates the submission row with
   `stdout`, `stderr`, `compile_output`, `exit_code`, `signal`, `cpu_time`,
   `wall_time`, `memory_kb`, and final `status`.

9. **Publish event** -- `publish_event(&pool, token, &Event::Finished { .. })`
   fires `pg_notify('zerocode.events.<token>', ...)`. Any SSE subscriber or
   `?wait=true` long-poller receives the event within milliseconds.

10. **Webhook delivery** -- if the submission was created with a `callback_url`,
    the worker POSTs the result to that URL with an HMAC-SHA256 signature
    header. The delivery status is recorded back to the submission row.

11. **?wait=true path** -- when the client passes `?wait=true` on the create
    request, the API opens a `LISTEN zerocode.events.<token>` stream and blocks
    up to `WAIT_TIMEOUT` (30 s). Fallback: 200 ms DB poll if the LISTEN
    connection fails. The response is the completed submission, not just the
    token.


## 4. Sandbox execution model

The native sandbox (`crates/zerocode-sandbox/src/native/`) uses raw Linux
syscalls via `nix` -- not an OCI runtime. The full sequence inside
`exec::run`, called from `linux::execute`:

```
Worker (tokio::spawn_blocking)
  |
  +-- Cgroup::create       cgroup v2 sub-cgroup under /sys/fs/cgroup/zerocode/<token>/
  |                         Sets memory.max, cpu.max, pids.max
  +-- Scratch::create       /run/zerocode-sandbox/<ulid>/box/  with source + stdin
  |
  +-- fork()                --- parent / child split ---
  |
  |   PARENT:                              CHILD:
  |     close write ends of pipes            close read ends of pipes
  |     read(ready_pipe) <--- block ---      unshare(PID|NS|IPC|UTS|NET|USER)
  |                                          write(ready_pipe, "1")
  |     userns::write_maps(child_pid)        read(start_pipe) <--- block ---
  |     cgroup.attach(child_pid)
  |     write(start_pipe, "1") --------->    proceed:
  |                                            3. mounts::make_namespace_private()
  |                                            4. mounts::pivot_into_runner()
  |                                               rbind runner rootfs
  |                                               mount /box tmpfs (32 MB)
  |                                               mount /tmp tmpfs (64 MB)
  |                                               copy source + stdin into /box
  |                                               pivot_root
  |                                               remount /proc
  |                                               chdir /box
  |                                            5. bring loopback up
  |                                            6. dup2 stdin  <- /box/stdin
  |                                            7. dup2 stdout -> parent pipe
  |                                               dup2 stderr -> parent pipe
  |                                            8. drop ALL capabilities (5 capsets)
  |                                            9. prctl(PR_SET_NO_NEW_PRIVS)
  |                                           10. landlock::apply(/box RW, /usr RO, ...)
  |                                           11. seccomp::apply_default()
  |                                           12. [if compiled language] fork sub-child:
  |                                                 sub-child: execvpe(compile_cmd)
  |                                                 parent:    waitpid(sub-child)
  |                                                            exit(253) on failure
  |                                           13. execvpe(run_cmd)
  |
  |     read stdout (capped, threaded)
  |     read stderr (capped, threaded)
  |     wait_with_timeout(wall_time)
  |       on overrun: cgroup.kill()
  |
  +-- triage::classify       Maps (exit_status, signal, cgroup stats, wall timeout)
  |                          to a Status enum (Accepted, WrongAnswer, TimeLimitExceeded,
  |                          MemoryLimitExceeded, RuntimeError, CompileError, etc.)
  +-- Cgroup::destroy
  +-- Scratch::destroy
```

**Two-pipe handshake:** the `ready_pipe` and `start_pipe` synchronize the
parent and child. The child cannot proceed past `unshare` until the parent
has written its UID/GID map (required because unprivileged processes cannot
write their own `uid_map` after `unshare(CLONE_NEWUSER)`) and attached it to
the cgroup. This avoids a race where the child execs before resource limits
are in place.

**Compile sentinel:** compiled languages (C, C++, Go, Java, Rust) run a
sub-fork inside the sandbox. If the compile sub-child exits non-zero, the
outer child exits with code 253 (`COMPILE_FAILED_EXIT_CODE`). The worker's
triage tree recognizes this sentinel and sets `Status::CompileError`, routing
the compile stderr into `compile_output` on the submission.


## 5. Performance architecture

### Result cache

`ResultCache` is a moka async LRU cache (10,000 entries, 5 min TTL) held in
`AppState`. The key is a blake3 hash of `(language_id, source_code, stdin,
limits)`, computed via `CacheKey::result`. Identical submissions return
instantly from the API without entering the queue. The cache is in-process
(no network hop) and lock-free on reads.

See `crates/zerocode-cache/src/lib.rs`, `crates/zerocode-api/src/state.rs`.

### Compile cache

`CompileCache` is Postgres-backed. For compiled languages, a cache hit skips
the compile sub-fork entirely and proceeds directly to the run phase. Keyed
on `(language_id, source_code)` -- limits do not affect compilation output.

### LISTEN/NOTIFY dispatch (not polling)

Workers do not poll the submissions table. The API fires
`pg_notify('zerocode.jobs', token)` on every INSERT. Workers LISTEN on
`zerocode.jobs` and wake within the same Postgres transaction commit
(sub-5 ms). A 2-second poll fallback engages only if the LISTEN connection
drops, ensuring correctness under network partitions.

See `crates/zerocode-stream/src/jobs.rs` (worker side) and
`crates/zerocode-api/src/state.rs` (API side, `JobNotifier`).

### SSE streaming

`GET /v1/submissions/{token}/stream` opens a per-token PgListener on
`zerocode.events.<token>`. The worker publishes `Processing`, `StdoutChunk`,
`StderrChunk`, and `Finished` events via `publish_event`. The API maps these
to SSE frames. The stream is held for the lifetime of the HTTP connection.

See `crates/zerocode-stream/src/events.rs`,
`crates/zerocode-api/src/routes/streaming.rs`.

### ?wait=true long-poll

When the client passes `?wait=true`, the create handler opens a LISTEN on the
token's event channel and blocks up to `WAIT_TIMEOUT` (30 s). If the LISTEN
connection cannot be established, it falls back to polling the DB every
`WAIT_POLL_INTERVAL` (200 ms). The response body is the completed submission
rather than just the acknowledgement token.


## 6. Two container images

ZeroCode ships as two separate container images plus a runner rootfs image.
The separation is a deliberate security boundary.

### zerocode-service (distroless)

- **Dockerfile:** `deploy/Dockerfile.service`
- **Base:** `gcr.io/distroless/static-debian12:nonroot`
- **Contents:** statically linked (musl) `zerocode-api` and `zerocode-migrate`
  binaries, plus the `migrations/` directory.
- **Runs as:** `nonroot:nonroot`
- **No:** shell, package manager, libc (musl is statically linked), language
  toolchains, sandbox code, worker binary.

### zerocode-worker (Debian slim)

- **Dockerfile:** `deploy/Dockerfile.worker`
- **Base:** `debian:trixie-slim` (needed for glibc + libseccomp2)
- **Contents:** dynamically linked `zerocode-worker` binary, `iproute2` (for
  loopback bring-up inside the sandbox network namespace).
- **Runs as:** `zerocode` (UID 10001, system user)
- **No:** language toolchains, API binary, database migrations.

### zerocode-runner (Debian + toolchains)

- **Dockerfile:** `runners/Dockerfile`
- **Base:** `debian:trixie-slim`
- **Contents:** all 7 language toolchains (Python 3.13, Node.js 22, gcc-14,
  g++-14, Go latest, Rust stable, OpenJDK 21). Pre-creates `/box` and `/tmp`.
- **Not run as a container.** The worker bind-mounts an extracted copy of this
  image's filesystem as the read-only rootfs that every sandboxed submission
  is `pivot_root`'d into.

**Why the split matters:** if a sandbox escape occurs, the attacker lands
inside the runner rootfs -- an environment that contains no database
credentials, no service code, no API keys, and no network access (the NET
namespace is isolated). The service image has no shell to exec into. The
worker image has no language toolchains.


## 7. Supported languages (v1)

Loaded from `runners/languages.toml` at boot. ID space: 1-99 reserved for v1
core languages; 100+ for future expansion.

| ID | Language | Version | Source file | Compile command | Run command | Notable env vars |
|----|----------|---------|-------------|-----------------|-------------|------------------|
| 48 | C | gcc-14 | `main.c` | `gcc-14 -O2 -std=c17 -fstack-protector-strong -D_FORTIFY_SOURCE=2 main.c -o prog -lm` | `./prog` | -- |
| 52 | C++ | g++-14 | `main.cpp` | `g++-14 -O2 -std=c++23 -fstack-protector-strong -D_FORTIFY_SOURCE=2 main.cpp -o prog -lm` | `./prog` | -- |
| 60 | Go | 1.x-latest | `main.go` | `/usr/local/go/bin/go build -o prog main.go` | `./prog` | `GOCACHE=/tmp/.go-cache`, `GOTMPDIR=/tmp`, `GOMAXPROCS=1`, `GOMEMLIMIT=${memory_mb}MiB` |
| 62 | Java | 21 | `Main.java` | `javac Main.java` | `java Main` | `JAVA_TOOL_OPTIONS=-Xmx${jvm_heap_mb}m -Xss512k -XX:MaxMetaspaceSize=128m -XX:ReservedCodeCacheSize=64m -XX:+ExitOnOutOfMemoryError` |
| 63 | Node.js | 22 | `main.js` | (none) | `node main.js` | `NODE_NO_WARNINGS=1`, `NODE_OPTIONS=--max-old-space-size=${memory_mb} --unhandled-rejections=strict` |
| 71 | Python | 3.13 | `main.py` | (none) | `python3.13 main.py` | `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1` |
| 73 | Rust | 1.x-latest | `main.rs` | `rustc -O -C panic=abort main.rs -o prog` | `./prog` | -- |

**Limit substitution:** env values may contain `${memory_mb}`, `${cpu_time}`,
`${wall_time}`, `${max_pids}`, and `${jvm_heap_mb}` placeholders. These are
expanded per-submission by `exec::substitute_limits` in the sandbox child
before `execvpe`. `${jvm_heap_mb}` is computed as `max(memory_mb - 256, 32)`
to account for JVM non-heap overhead.

**Language-specific defaults:** Java declares `default_limits` with 512 MB
memory and 96 pids (JVM thread floor), plus `compile_limits` with a 15 s CPU /
30 s wall budget to accommodate javac. Other languages use the global defaults.
