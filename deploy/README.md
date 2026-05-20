# `deploy/` — container images and compose stack

Everything you need to build and run ZeroCode in Docker. See also:

- [`../docs/DEPLOY.md`](../docs/DEPLOY.md) — full production deployment guide
  (host prereqs, capabilities, troubleshooting).
- [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) — local-dev workflows.

---

## What's in here

| File | Purpose |
|---|---|
| `Dockerfile.service` | Builds the **API + migrate** image. Distroless / musl-static. Bundles the web UI from `web/`. |
| `Dockerfile.worker`  | Builds the **worker** image. glibc-based (libseccomp + libcontainer need glibc). |
| `docker-compose.yml` | The full stack: Postgres, migrate, runner-rootfs init, API, worker. Works out of the box; has an optional Traefik integration commented at the bottom. |

The runner-rootfs image (the filesystem containing language toolchains) lives
under [`../runners/`](../runners/) — built independently and triggered by the
`runner-rootfs-init` service in the compose file.

---

## Build all three images

```bash
# From the repo root:
docker build -f runners/Dockerfile        -t zerocode-runner:dev  runners/
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .
docker build -f deploy/Dockerfile.worker  -t zerocode-worker:dev  .
```

## Bring up the stack

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Then:

```bash
curl http://localhost:8080/v1/health
curl http://localhost:8080/v1/languages
```

Web playground at <http://localhost:8080/playground.html>.

## Tear down

```bash
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml down -v   # also drops volumes
```

---

## Production deployment

ZeroCode runs as an open, unauthenticated backend — control access at the
network layer (private subnet, firewall, reverse proxy with its own auth,
VPN). Read [`../docs/DEPLOY.md`](../docs/DEPLOY.md) for:

- host kernel + cgroup v2 prerequisites
- which Linux capabilities the worker needs (`CAP_SYS_ADMIN`, `CAP_SYS_CHROOT`)
- cgroup delegation under systemd
- common failure modes (silent `/proc` bind-mount, etc.)

### Traefik (optional)

If you front the stack with a Traefik reverse proxy, the compose file
already carries the routing labels. To wire them up:

1. Create the shared discovery network once on the host:
   ```bash
   docker network create traefik
   ```
2. Edit your `deploy/docker-compose.yml` and uncomment the `networks` block
   at the bottom (it joins the `traefik` external network).
3. Remove the `ports: ["8080:8080"]` mapping on the `api` service so the
   API isn't reachable on the public host port — Traefik routes to it via
   the Docker network instead.

Update the `traefik.http.routers.zero-code.rule` label to match your
Host header.
