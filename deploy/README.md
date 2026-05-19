# `deploy/` — container images and compose stacks

This directory contains everything you need to build container images and
orchestrate the ZeroCode services. See also:

- [`../docs/DEPLOY.md`](../docs/DEPLOY.md) — full production deployment guide
  (host prerequisites, capabilities, troubleshooting).
- [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) — local-dev workflows.

---

## What's in here

| File | Purpose |
|---|---|
| `Dockerfile.service` | Builds the **API + migrate** image. Distroless / musl-static. Bundles the web UI from `web/`. |
| `Dockerfile.worker`  | Builds the **worker** image. glibc-based (libseccomp + libcontainer need glibc). |
| `docker-compose.yml` | Dev-flavoured baseline stack: Postgres, migrate, runner-rootfs init, API, worker. |
| `docker-compose.dev.yml` | Override for local-dev: exposes Postgres on `:5433`, adds Jaeger, disables the API/worker so you can `cargo run` them. |
| `docker-compose.prod.example.yml` | Production-shaped reference compose. Copy + edit; do not run as-is. |

The runner-rootfs image (the filesystem containing language toolchains) lives
under [`../runners/`](../runners/) — it's logically part of the deploy stack
but its build is independent and triggered by the `runner-rootfs-init` service.

---

## Quick reference

### Build all three images

```bash
# From repo root:
docker build -f runners/Dockerfile        -t zerocode-runner:dev  runners/
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .
docker build -f deploy/Dockerfile.worker  -t zerocode-worker:dev  .
```

### Bring up the full dev stack

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Then:

```bash
curl http://localhost:8080/v1/languages
```

### Bring up just Postgres + Jaeger for `cargo run` development

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.dev.yml \
               up -d postgres migrate jaeger
```

See [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) for the full
hot-reload workflow.

### Tear down

```bash
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml down -v   # also drops volumes
```

---

## Production deployment

`docker-compose.yml` here is **dev-shaped**, not production. ZeroCode runs
as an open, unauthenticated backend — protect access at the network layer
(private subnet, firewall, reverse proxy with its own auth) before
exposing this anywhere.

For production, copy `docker-compose.prod.example.yml`, populate the
Postgres password placeholder, and read
[`../docs/DEPLOY.md`](../docs/DEPLOY.md) for:

- host kernel + cgroup v2 prerequisites
- which Linux capabilities the worker needs (`CAP_SYS_ADMIN`, `CAP_SYS_CHROOT`)
- cgroup delegation under systemd
- TLS termination patterns (Caddy / nginx / Traefik)
- common failure modes (silent `/proc` bind-mount failures, etc.)
