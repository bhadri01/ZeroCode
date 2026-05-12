# ZeroCode

Sandboxed code execution service in Rust. Submit source code, get
stdout/stderr/exit status back. Built for modern Linux (cgroups v2,
kernel >=5.14) with defense-in-depth isolation: user namespaces, pivot_root,
landlock, seccomp BPF, capability drop, and per-submission cgroup limits.

Designed as a drop-in replacement for [Judge0](https://judge0.com) with a
focus on security, performance, and modern toolchains.

## Supported languages (41)

**Core 7 (v1)**

| ID | Language | Version | Type |
|----|----------|---------|------|
| 71 | Python | 3.13 | Interpreted |
| 63 | Node.js | 22 LTS | Interpreted |
| 73 | Rust | stable | Compiled |
| 60 | Go | 1.23+ | Compiled |
| 48 | C | gcc-14, C17 | Compiled |
| 52 | C++ | g++-14, C++23 | Compiled |
| 62 | Java | 21 LTS | Compiled |

**v1.5 expansion (34 languages)**

| ID | Language | ID | Language | ID | Language |
|----|----------|----|----------|----|----------|
| 100 | Bash | 120 | Kotlin | 150 | COBOL |
| 101 | Lua | 121 | Scala 3 | 151 | Prolog |
| 102 | Perl | 122 | Groovy | 152 | Swift 6 |
| 103 | Ruby | 123 | Clojure | 153 | Octave |
| 104 | R | 130 | Haskell | 154 | SQL |
| 105 | PHP | 131 | OCaml | 160 | Zig |
| 106 | TypeScript | 132 | Erlang | 161 | Nim |
| 110 | Fortran | 133 | Elixir | 162 | Crystal |
| 111 | Pascal | 134 | Common Lisp | 163 | Dart |
| 112 | D | 140 | C# | 164 | Julia |
| 113 | Objective-C | 141 | F# | | |
| 114 | Assembly | | | | |
| 115 | Ada | | | | |

## API

```
POST   /v1/submissions          Submit code for execution
GET    /v1/submissions/{token}  Get result by token
GET    /v1/submissions          List submissions (paginated)
GET    /v1/submissions/{token}/stream   SSE real-time output
GET    /v1/languages            List supported languages
GET    /v1/health               Liveness probe
GET    /v1/ready                Readiness (DB + queue depth)
GET    /v1/about                Version info
```

Auth: `Authorization: Bearer <key>` on all routes except health/ready/about.

### Submit and wait

```bash
curl -X POST http://localhost:8080/v1/submissions?wait=true \
  -H 'Authorization: Bearer dev-only-replace-me' \
  -H 'Content-Type: application/json' \
  -d '{"language_id": 71, "source_code": "print(\"hello world\")"}'
```

### Stream output

```bash
curl -N http://localhost:8080/v1/submissions/$TOKEN/stream \
  -H 'Authorization: Bearer dev-only-replace-me'
```

## Quick start (dev)

Requires Docker, Rust 1.85+, and a Linux host (kernel >=5.14) for the
sandbox. macOS can build and run the API/worker but cannot exercise the
native sandbox.

```sh
# 1. Start Postgres and run migrations
docker compose -f deploy/docker-compose.yml up -d postgres
cargo run -p zerocode-migrate

# 2. Copy env and start the API
cp .env.example .env
cargo run -p zerocode-api

# 3. Start the worker (separate terminal)
cargo run -p zerocode-worker

# 4. Verify
curl http://localhost:8080/v1/health
curl -H 'Authorization: Bearer dev-only-replace-me' \
     http://localhost:8080/v1/languages
```

For production deployment with Docker Compose, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Architecture

```
Client --> API (axum) --> Postgres <-- Worker --> Sandbox --> Language runtime
              |              |           |
              |              |           +-- LISTEN/NOTIFY wake
              |              +-- submissions table (queue)
              +-- SSE stream via LISTEN/NOTIFY per-token
```

- **Two container images**: `zerocode-service` (distroless, API + worker
  binaries) and `zerocode-runner` (Debian + toolchains, mounted read-only as
  sandbox rootfs). A sandbox escape lands in an environment with no DB
  credentials and no service code.
- **Result cache**: moka in-process LRU (10k entries, 5 min TTL). Identical
  submissions return instantly without hitting the queue.
- **LISTEN/NOTIFY dispatch**: sub-5ms job pickup latency, no polling.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Project layout

```
crates/
  zerocode-core/      Shared types: Submission, Status, LanguageSpec, Token
  zerocode-sandbox/   Sandbox trait + NativeSandbox (Linux namespaces + cgroup v2)
  zerocode-cache/     moka result cache + Postgres compile-artifact cache
  zerocode-stream/    Postgres LISTEN/NOTIFY + SSE event publishing
  zerocode-migrate/   One-shot DB migration binary
  zerocode-api/       axum HTTP server
  zerocode-worker/    Job consumer + sandbox executor
runners/
  Dockerfile          Language toolchains (sandbox rootfs image)
  languages.toml      Per-language specs
deploy/
  docker-compose.yml  Full stack
docs/
  ARCHITECTURE.md     System design
  DEPLOY.md           Production deployment guide
  THREAT_MODEL.md     STRIDE analysis + defense-in-depth layers
```

## Security

ZeroCode applies 8 layers of isolation to every submission:

1. **User namespaces** -- in-container UID 0 maps to unprivileged host UID
2. **PID/NET/IPC/UTS/MNT namespaces** -- full process isolation
3. **pivot_root** into read-only runner rootfs
4. **cgroup v2** -- memory.max, cpu.max, pids.max, cgroup.kill
5. **Landlock** -- filesystem access confined to /box (RW) and system paths (RO)
6. **seccomp BPF** -- blocks io_uring, bpf, ptrace, mount, pivot_root, unshare
7. **Capability drop** -- all 5 capsets cleared
8. **PR_SET_NO_NEW_PRIVS** -- prevents privilege re-acquisition

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full STRIDE analysis
and CVE comparison with Judge0.

## Testing

```sh
# Unit + integration tests (macOS or Linux)
cargo test --workspace

# Edge-case adversarial tests (Linux with sandbox environment only)
cargo test -p zerocode-sandbox --features edge-cases --test edge_cases

# Clippy
cargo clippy --workspace -- -D warnings
```

71 edge-case tests cover adversarial patterns: infinite loops, memory bombs,
fork bombs, output floods, sandbox escape attempts (symlink, ptrace, mount),
signal handling, and per-language runtime quirks.

## License

Dual-licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
