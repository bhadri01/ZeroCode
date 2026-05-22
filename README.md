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
                                         │                    │ pivot_root + exec
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

60 languages ship today, each with a stable numeric ID so existing
self-hosted-sandbox clients (Judge0-shaped) drop in by ID alone. The
**Core 7** below are the primary, most-tuned targets; **Batches A–I** add 52
more, and the v2 `raw-wasm` tier (id 200) runs bring-your-own `.wasm` blobs.

| ID | Language | Version       | Type             |
|----|----------|---------------|------------------|
| 71 | Python   | 3.13          | interpreted      |
| 63 | Node.js  | 22 LTS        | interpreted      |
| 73 | Rust     | stable        | compile-then-run |
| 60 | Go       | 1.23+         | compile-then-run |
| 48 | C        | gcc-14, C17   | compile-then-run |
| 52 | C++      | g++-14, C++23 | compile-then-run |
| 62 | Java     | OpenJDK 21 LTS| javac → java     |

<details>
<summary><strong>Batches A–I</strong> (52 more languages)</summary>

| Batch | IDs | Languages |
|-------|-----|-----------|
| A — interpreted        | 100–106 | Bash, Lua, Perl, Ruby, R, PHP, TypeScript (tsx) |
| B — GCC-family compiled| 110–115 | Fortran, Pascal, D, Objective-C, Assembly, Ada |
| C — JVM                | 120–123 | Kotlin, Scala, Groovy, Clojure |
| D — functional / ML    | 130–134 | Haskell, OCaml, Erlang, Elixir, Common Lisp |
| E — .NET               | 140–141 | C#, F# |
| F — niche              | 150–154 | COBOL, Prolog, Swift, Octave, SQL (SQLite) |
| G — modern             | 161–164 | Nim, Crystal, Dart, Julia |
| H — practical          | 170–182 | Racket, Raku, AWK, CoffeeScript, Forth, Emacs Lisp, Verilog, LLVM IR, V, FreeBASIC, PowerShell, Pony |
| I — esoteric / golf    | 300–306 | Brainfuck, GolfScript, CJam, Vyxal, Jelly, Samarium, Paradoc |
| v2 — WASM tier         | 200     | raw-wasm (pre-compiled `.wasm`, runs under WasmSandbox) |

</details>

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

ZeroCode runs as an open, unauthenticated backend — restrict access at the
network layer (private subnet, firewall, reverse proxy with auth in front).
A per-IP rate limit (`tower_governor`) caps client volume.

### Submit and wait

```bash
curl -X POST 'http://localhost:8080/v1/submissions?wait=true' \
     -H 'Content-Type: application/json' \
     -d '{"language_id": 71, "source_code": "print(\"hello world\")"}'
```

### Stream output

```bash
curl -N http://localhost:8080/v1/submissions/$TOKEN/stream
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
curl http://localhost:8080/v1/languages
```

Web playground at <http://localhost:8080/playground.html>.

### Option B — hot-reload development

Run only Postgres in Docker, but `cargo run` the API and worker on the
host so you get fast rebuilds. Full instructions in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md):

```bash
docker compose -f deploy/docker-compose.yml up -d postgres migrate

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
│   ├── Dockerfile                # Full image — all 60 language toolchains
│   ├── Dockerfile.slim           # Per-language slim images
│   └── languages.toml            # Per-language compile/run specs
│
├── deploy/                       # Container images + compose stack
│   ├── Dockerfile.service        # API + migrate (distroless / musl-static)
│   ├── Dockerfile.worker         # Worker (glibc + libseccomp)
│   └── docker-compose.yml        # Full stack — Postgres, migrate, runner-rootfs, API, worker
│
├── web/                          # Browser-facing frontend (pnpm workspace)
│   ├── app/                      # Landing + playground (Vite + React)
│   └── docs/                     # User docs site (Astro + Starlight)
│
├── migrations/                   # sqlx SQL migrations
├── tests/edge_cases/             # 130+ adversarial integration tests
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
hands the job to a **Sandbox** which `pivot_root`s into the
**runner-rootfs** volume (inside per-job namespaces + cgroups, with
seccomp and landlock) and exec's the language toolchain. The sandbox publishes
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

Coverage today: 130+ edge-case tests targeting infinite loops, memory
bombs, fork bombs, output floods, sandbox-escape attempts (symlink,
ptrace, mount), signal handling, and per-language runtime quirks.

---

## Documentation

ZeroCode has two documentation systems for two audiences:

- **[`docs/`](docs/README.md)** — plain markdown for contributors and
  operators (read on GitHub or in your IDE).
- **[`web/docs/`](web/docs/README.md)** — Astro/Starlight site for API
  users, served at `/docs/` on any running instance (e.g.,
  <http://localhost:8080/docs/> after `docker compose up`).

**Start at [`docs/README.md`](docs/README.md)** — it's the index, has the
"where do I start?" decision tree, and lists every doc in the project
with audience labels.

---

## License

Dual-licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
