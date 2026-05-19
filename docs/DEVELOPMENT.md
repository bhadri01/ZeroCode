# Developing ZeroCode

This guide is for working on ZeroCode itself: running the stack locally,
iterating on the API and worker with hot reloads, and exercising the
test suite. For production deployment, see [`DEPLOY.md`](DEPLOY.md).

---

## 1. Prerequisites

| Tool                | Version       | Notes |
|---------------------|---------------|---|
| **Rust**            | 1.85 stable   | Pinned in [`rust-toolchain.toml`](../rust-toolchain.toml). `rustup` will install it automatically when you first `cargo` in this repo. |
| **Docker**          | 20.10+        | For Postgres, Jaeger, and the runner-rootfs build. Compose v2 (the `docker compose` subcommand) is required. |
| **Node.js + pnpm**  | Node 20+, pnpm 10 | Only needed if you're working on the `web/` frontend. `corepack enable` will provide pnpm. |
| **PostgreSQL client** (optional) | 16 | Handy for poking at the queue: `psql`, `pgcli`. |
| **Linux kernel ≥ 5.14** | required for the native sandbox | macOS / Docker Desktop can run the API + worker, but the production-grade `NativeSandbox` features (cgroups v2, landlock, seccomp) need a real Linux host. The dev `NaiveSandbox` works anywhere. |

Verify with:

```bash
rustc --version          # rustc 1.85.x
docker compose version   # v2.x
pnpm --version           # 10.x
```

---

## 2. First-time setup

```bash
# Clone and enter the repo
git clone https://github.com/zerocode/zerocode.git
cd zerocode

# Copy environment defaults
cp .env.example .env

# (Optional) sanity-check the workspace builds
cargo check --workspace
```

The `.env` defaults work for local dev as-is. Don't commit a modified
`.env`; that's why it's gitignored. `.env.example` is the canonical
template.

---

## 3. Running the stack (hot-reload workflow)

The recommended development setup is **Postgres + Jaeger in Docker,
API + worker via `cargo run`**. You get sub-second rebuilds, full
backtrace, and `tracing` output in your terminal.

### Step 1 — start the supporting services

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.dev.yml \
               up -d postgres migrate jaeger
```

This brings up:

- **Postgres** on host port `5433` (so it doesn't clash with a system Postgres on 5432)
- **migrate** runs once and exits, applying SQL files from `migrations/`
- **Jaeger** at <http://localhost:16686> for trace inspection

The `api`, `worker`, and `runner-rootfs-init` services are intentionally
disabled in the dev override — you'll run those yourself.

### Step 2 — run the API

```bash
DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode \
cargo run -p zerocode-api
```

The API binds to `0.0.0.0:8080` by default. Override with
`ZEROCODE_API_BIND`. Verify with:

```bash
curl http://localhost:8080/v1/health
```

### Step 3 — run the worker

```bash
DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode \
ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs \
cargo run -p zerocode-worker --features unsafe-naive
```

For the worker to actually execute submissions on your dev machine, you
either need:

1. **Linux host with the runner-rootfs extracted locally** (see §5 below), *or*
2. **The full Docker stack** — switch from this hot-reload workflow to
   `docker compose up -d` (Option A in the [README](../README.md#quick-start)).

### Step 4 — submit something

```bash
curl -X POST 'http://localhost:8080/v1/submissions?wait=true' \
     -H 'Authorization: Bearer dev-only-replace-me' \
     -H 'Content-Type: application/json' \
     -d '{"language_id": 71, "source_code": "print(\"hi\")"}'
```

---

## 4. Web frontend development

The `web/` directory is a pnpm workspace with two sub-projects:
**`web/app/`** (Vite + React 18, landing page + playground) and
**`web/docs/`** (Astro + Starlight, user docs site).

```bash
cd web
pnpm install         # once, after a fresh clone

pnpm dev:app         # Vite dev server (proxies /v1 to localhost:8080)
pnpm dev:docs        # Astro dev server with hot reload
pnpm build           # builds both, assembles into web/dist/
```

The API serves `web/dist/` via `tower-http`'s `ServeDir` at the path
configured by `ZEROCODE_WEB_DIR` (default `web/dist`). If the directory
is missing, the API silently skips the mount — so you can develop the
API without a built UI.

---

## 5. Running with the full sandbox (Linux only)

The dev `NaiveSandbox` skips real isolation. To exercise the production
`NativeSandbox` (cgroups + landlock + seccomp + namespaces) locally:

```bash
# 1. Verify your kernel satisfies the requirements
uname -r                              # must be 5.14+
stat /sys/fs/cgroup/cgroup.controllers # cgroup v2 unified hierarchy
sysctl kernel.unprivileged_userns_clone # must be 1

# 2. Extract the runner rootfs (toolchains) into a host directory
docker build -f runners/Dockerfile -t zerocode-runner:dev runners/
cid=$(docker create zerocode-runner:dev /bin/true)
sudo mkdir -p /var/lib/zerocode/runner-rootfs
docker export "$cid" | sudo tar -xf - -C /var/lib/zerocode/runner-rootfs
docker rm "$cid"

# 3. Run the worker with the `native` feature
DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode \
ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs \
cargo run -p zerocode-worker --features native
```

See [`DEPLOY.md`](DEPLOY.md) §6 for cgroup delegation if the worker
complains about cgroup permissions.

---

## 6. Testing

```bash
# Workspace unit + integration tests (cross-platform)
cargo test --workspace

# Adversarial sandbox edge cases (Linux only — needs the native sandbox)
cargo test -p zerocode-sandbox --features edge-cases --test edge_cases

# End-to-end smoke test against a fresh Docker stack
./scripts/smoke-test.sh

# Load test (k6-style, hits the API + Postgres + worker chain)
./scripts/load-test.sh

# Lint + format
cargo clippy --workspace -- -D warnings
cargo fmt --all
```

If you add a new language, also add an edge-case file under
[`tests/edge_cases/<lang>/`](../tests/edge_cases/) covering at least:
infinite loop, memory bomb, fork bomb, output flood, and one
language-specific runtime quirk.

---

## 7. Database migrations

Migrations live in [`migrations/`](../migrations/) and are run by the
`zerocode-migrate` binary (which is also what the `migrate` compose
service invokes).

```bash
# Apply pending migrations against a running Postgres
DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode \
cargo run -p zerocode-migrate

# Refresh the sqlx offline metadata after schema changes
cargo install sqlx-cli --no-default-features --features postgres
DATABASE_URL=postgres://zerocode:zerocode@localhost:5433/zerocode \
cargo sqlx prepare --workspace
```

The `.sqlx/` directory is committed so CI and the production image
build can compile without a live database (`SQLX_OFFLINE=true`).

---

## 8. Tracing and observability

The API and worker emit OpenTelemetry spans over OTLP gRPC when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. The dev override ships Jaeger
all-in-one at `localhost:4317` (gRPC) with a UI at
<http://localhost:16686>.

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
cargo run -p zerocode-api
```

Without that env var, both binaries fall back to stdout JSON logging
via `tracing-subscriber`. Filter logs with `RUST_LOG`, e.g.
`RUST_LOG=info,zerocode=debug,sqlx=warn`.

---

## 9. Useful one-liners

```bash
# Show the live state of every submission
psql "$DATABASE_URL" -c "SELECT id, language_id, status, claimed_at \
                         FROM submissions ORDER BY created_at DESC LIMIT 20;"

# Tail worker stdout while jobs flow through
docker compose -f deploy/docker-compose.yml logs -f worker

# Rebuild only the runner rootfs (after editing runners/languages.toml or Dockerfile)
docker compose -f deploy/docker-compose.yml run --rm runner-rootfs-init

# Wipe everything and start from scratch
docker compose -f deploy/docker-compose.yml down -v
```

---

## 10. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `connection refused (5432)` from `cargo run` | Default Postgres port collides with dev compose. | Use `localhost:5433` in your `DATABASE_URL` (set by the dev override). |
| `SQLX_OFFLINE_DIR not found` build error | `.sqlx/` metadata stale after schema change. | `cargo sqlx prepare --workspace` against a live DB. |
| `runner rootfs not found` at worker startup | `ZEROCODE_RUNNER_ROOTFS` path doesn't exist or wasn't extracted. | See §5, or use the full `docker compose up -d` flow. |
| `bind-mount failed` / Go-Java-Rust submissions all error | `/proc` couldn't be bind-mounted into the rootfs. | See [`DEPLOY.md` §7](DEPLOY.md) — usually missing `CAP_SYS_ADMIN` or a read-only volume. |
| `kernel feature missing` at worker boot | Host kernel too old, cgroup v1, or userns disabled. | See [`DEPLOY.md` §1](DEPLOY.md) for required kernel features. |

---

## 11. Where to go next

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system design, crate map, submission lifecycle
- [`THREAT_MODEL.md`](THREAT_MODEL.md) — what the sandbox actually defends against
- [`DEPLOY.md`](DEPLOY.md) — production deployment
- [`ROADMAP.md`](ROADMAP.md) — planned features and known limitations
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — submitting changes
