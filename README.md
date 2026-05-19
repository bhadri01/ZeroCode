# ZeroCode

> Sandboxed code-execution service in Rust. Submit source code, get
> stdout / stderr / exit status back — with defence-in-depth Linux isolation.

ZeroCode runs untrusted source code inside cgroup-bounded, namespaced,
seccomp-filtered sandboxes on Linux. It exposes a small HTTP API, a
LISTEN/NOTIFY-dispatched worker pool, and a built-in browser playground.

```
┌──────────┐   POST /v1/submissions   ┌─────┐  pg_notify  ┌────────┐
│  Client  │ ───────────────────────► │ API │ ──────────► │ Worker │
└──────────┘   SSE / wait=true poll   └──┬──┘             └───┬────┘
                                         │                    │ chroot + exec
                                         ▼                    ▼
                                   ┌──────────┐         ┌───────────────┐
                                   │ Postgres │         │ runner-rootfs │
                                   └──────────┘         │ (toolchains)  │
                                                        └───────────────┘
```

---

## Table of contents

- [Supported languages](#supported-languages)
- [HTTP API](#http-api)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Architecture in one paragraph](#architecture-in-one-paragraph)
- [Security model](#security-model)
- [Testing](#testing)
- [Documentation](#documentation)
- [License](#license)

---

## Supported languages

The Core 7 ship today; each one has a stable numeric ID so existing
self-hosted-sandbox clients (Judge0-shaped) drop in by ID alone.

| ID | Language | Version       | Type             |
|----|----------|---------------|------------------|
| 71 | Python   | 3.13          | interpreted      |
| 63 | Node.js  | 22 LTS        | interpreted      |
| 73 | Rust     | stable        | compile-then-run |
| 60 | Go       | 1.23+         | compile-then-run |
| 48 | C        | gcc-14, C17   | compile-then-run |
| 52 | C++      | g++-14, C++23 | compile-then-run |
| 62 | Java     | OpenJDK 21 LTS| javac → java     |

Source of truth: [`runners/languages.toml`](runners/languages.toml).
Live registry: `GET /v1/languages`. The expansion plan lives in
[`docs/ROADMAP.md`](docs/ROADMAP.md); each addition ships with its own
edge-case test under [`tests/edge_cases/`](tests/edge_cases/).

---

## HTTP API

```
POST   /v1/submissions                    Submit code for execution
GET    /v1/submissions/{token}            Get result by token
GET    /v1/submissions                    List submissions (paginated)
GET    /v1/submissions/{token}/stream     SSE real-time stdout/stderr
GET    /v1/languages                      List supported languages
GET    /v1/health                         Liveness probe
GET    /v1/ready                          Readiness (DB + queue depth)
GET    /v1/about                          Version info
```

Auth: `Authorization: Bearer <key>` on everything except
`/v1/health`, `/v1/ready`, and `/v1/about`.

### Submit and wait

```bash
curl -X POST 'http://localhost:8080/v1/submissions?wait=true' \
     -H 'Authorization: Bearer dev-only-replace-me' \
     -H 'Content-Type: application/json' \
     -d '{"language_id": 71, "source_code": "print(\"hello world\")"}'
```

### Stream output

```bash
curl -N -H 'Authorization: Bearer dev-only-replace-me' \
     http://localhost:8080/v1/submissions/$TOKEN/stream
```

---

## Quick start

You have two options. The first is fastest if you just want to *see it
work*; the second is what you want for development.

### Option A — full stack in Docker (easiest)

Requires Docker (20.10+) and a Linux host. macOS / Docker Desktop works but
without real cgroups, so the production sandbox features degrade.

```bash
# Build all three images
docker build -f runners/Dockerfile        -t zerocode-runner:dev  runners/
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .
docker build -f deploy/Dockerfile.worker  -t zerocode-worker:dev  .

# Bring up Postgres + API + worker + runner-rootfs init
docker compose -f deploy/docker-compose.yml up -d

# Verify
curl -H 'Authorization: Bearer dev-only-replace-me' \
     http://localhost:8080/v1/languages
```

Web playground at <http://localhost:8080/playground.html>.

### Option B — hot-reload development

Run Postgres and Jaeger in Docker, but `cargo run` the API and worker
on the host so you get fast rebuilds. Full instructions in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md):

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.dev.yml \
               up -d postgres migrate jaeger

cp .env.example .env
cargo run -p zerocode-api      # terminal 1
cargo run -p zerocode-worker   # terminal 2
```

For production deployment, see [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Project layout

```
ZeroCode/
├── crates/                       # Rust workspace (7 crates)
│   ├── zerocode-core/            # Shared domain types — no I/O, no async
│   ├── zerocode-sandbox/         # Sandbox backends (Naive + Native)
│   ├── zerocode-cache/           # Result cache (moka) + compile cache (Postgres)
│   ├── zerocode-stream/          # Postgres LISTEN/NOTIFY abstraction
│   ├── zerocode-migrate/         # One-shot DB migration binary
│   ├── zerocode-api/             # axum HTTP server
│   └── zerocode-worker/          # Job consumer + sandbox executor
│
├── runners/                      # Sandbox rootfs (language toolchains)
│   ├── Dockerfile                # Full Core 7 image (~1.2 GB)
│   ├── Dockerfile.slim           # Per-language slim images
│   └── languages.toml            # Per-language compile/run specs
│
├── deploy/                       # Container images + compose stacks
│   ├── Dockerfile.service        # API + migrate (distroless / musl-static)
│   ├── Dockerfile.worker         # Worker (glibc + libseccomp)
│   ├── docker-compose.yml        # Dev-flavoured baseline stack
│   ├── docker-compose.dev.yml    # Override for `cargo run` hot-reload
│   └── docker-compose.prod.example.yml   # Copy + edit for production
│
├── web/                          # Browser-facing frontend (pnpm workspace)
│   ├── app/                      # Landing + playground (Vite + React)
│   └── docs/                     # User docs site (Astro + Starlight)
│
├── migrations/                   # sqlx SQL migrations
├── tests/edge_cases/             # 71+ adversarial integration tests
├── scripts/                      # Build / smoke-test / load-test helpers
└── docs/                         # Internal documentation
    ├── ARCHITECTURE.md           # System design
    ├── DEPLOY.md                 # Production deployment guide
    ├── DEVELOPMENT.md            # Local dev workflows
    ├── ROADMAP.md                # Planned features
    └── THREAT_MODEL.md           # STRIDE analysis + isolation layers
```

---

## Architecture in one paragraph

The **API** accepts submissions, writes them to Postgres, and emits a
`pg_notify` on `zerocode.jobs`. **Workers** `LISTEN` on that channel and
race for jobs via `SELECT … FOR UPDATE SKIP LOCKED`. The winning worker
hands the job to a **Sandbox** which `chroot`s into the **runner-rootfs**
volume and exec's the language toolchain. The sandbox publishes
`Processing` / `StdoutChunk` / `StderrChunk` / `Finished` events on
`zerocode.events.<token>`, which the API turns into SSE for clients.
Identical submissions short-circuit through a moka result cache without
hitting the queue. Full diagram and crate-by-crate breakdown:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Security model

ZeroCode stacks 8 independent isolation layers on every submission:

1. **User namespaces** — in-sandbox UID 0 maps to an unprivileged host UID
2. **PID / NET / IPC / UTS / MNT namespaces** — full process isolation
3. **`pivot_root`** into a read-only runner rootfs
4. **cgroup v2** — `memory.max`, `cpu.max`, `pids.max`, `cgroup.kill`
5. **Landlock LSM** — filesystem confined to `/box` (RW) and system paths (RO)
6. **seccomp BPF** — blocks `io_uring`, `bpf`, `ptrace`, `mount`, `pivot_root`, `unshare`
7. **Capability drop** — all 5 capsets cleared before `exec`
8. **`PR_SET_NO_NEW_PRIVS`** — prevents privilege re-acquisition

A sandbox escape lands in a read-only filesystem with no database
credentials and no service code. Full STRIDE walkthrough and prior-art CVE
analysis in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

---

## Testing

```bash
# Unit + integration tests (macOS or Linux)
cargo test --workspace

# Adversarial edge cases (Linux with sandbox environment only)
cargo test -p zerocode-sandbox --features edge-cases --test edge_cases

# Lint
cargo clippy --workspace -- -D warnings

# Format
cargo fmt --all
```

Coverage today: 71+ edge-case tests targeting infinite loops, memory
bombs, fork bombs, output floods, sandbox-escape attempts (symlink,
ptrace, mount), signal handling, and per-language runtime quirks.

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System diagram, crate map, submission lifecycle. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local-dev workflow, testing, debugging, hot reload. |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Production deployment: host prereqs, capabilities, TLS, troubleshooting. |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | STRIDE analysis and isolation-layer rationale. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Planned features, language expansion, milestones. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to propose changes, run pre-commit checks. |
| [`deploy/README.md`](deploy/README.md) | What lives in `deploy/` and how the images compose. |

---

## License

Dual-licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
