# Deploying ZeroCode

Production deployment guide for ZeroCode -- a sandboxed code execution service
consisting of an HTTP API server and one or more sandbox workers backed by
Postgres.

---

## 1. Host Requirements

ZeroCode workers create Linux user-namespace sandboxes with cgroup-based
resource limits. The host kernel must satisfy all of the following.

### Linux kernel >= 5.14

The worker uses `cgroup.kill` (landed in 5.14) and Landlock LSM (5.13+).

```bash
uname -r
# Must print 5.14.x or later.
```

### cgroup v2 unified hierarchy

The cgroup filesystem must be mounted as the v2 unified hierarchy (no hybrid
mode).

```bash
mount | grep cgroup2
# Should show a line like:
#   cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)

# The worker specifically checks for this file at boot:
stat /sys/fs/cgroup/cgroup.controllers
```

### Unprivileged user namespaces

The sandbox creates unprivileged user namespaces for isolation. On some
distributions this is gated behind a sysctl.

```bash
sysctl kernel.unprivileged_userns_clone
# Must be 1. If the sysctl does not exist, user namespaces are
# unconditionally enabled on your kernel and you are fine.

# To enable it persistently:
echo 'kernel.unprivileged_userns_clone=1' | sudo tee /etc/sysctl.d/99-userns.conf
sudo sysctl --system
```

### Delegated cgroup subtree

The worker process (UID `zerocode`, 10001 inside the container) must own a
cgroup subtree so it can create per-sandbox child cgroups. See
[Section 6 -- Cgroup Delegation](#6-cgroup-delegation) for setup instructions.

```bash
# Quick smoke test -- the worker's cgroup subtree should be writable:
ls -la /sys/fs/cgroup/zerocode/
# Owner should be the worker user.
```

---

## 2. Environment Variables

Every variable is read via `clap` with `env = "..."` annotations. Variables
without a default are **required**.

### API server (`zerocode-api`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | -- | Postgres connection string. Example: `postgres://zerocode:secret@db:5432/zerocode` |
| `ZEROCODE_API_BIND` | no | `0.0.0.0:8080` | Socket address the API listens on. |
| `ZEROCODE_API_KEY` | yes | -- | Static Bearer token for v1 authentication. Clients send `Authorization: Bearer <key>`. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Path to the language registry TOML file. |
| `RUST_LOG` | no | `info,zerocode=debug` | `tracing` / `env_filter` directive. |

### Worker (`zerocode-worker`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | -- | Same Postgres connection string as the API. |
| `ZEROCODE_WORKER_ID` | no | `worker-<ulid>` | Stable identifier persisted alongside job claims. Used by the sweeper to attribute stuck rows to a specific worker. Set this explicitly when running multiple workers. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Path to the language registry TOML file. |
| `ZEROCODE_MAX_PARALLEL` | no | number of CPUs | Maximum concurrent sandboxed executions. |
| `ZEROCODE_WEBHOOK_SECRET` | no | empty string | HMAC-SHA256 secret for signing outbound webhook payloads (`X-ZeroCode-Signature`). Leave unset only in development. |
| `ZEROCODE_RUNNER_ROOTFS` | yes (in practice) | -- | Path to the extracted runner filesystem. Typically `/var/lib/zerocode/runner-rootfs`. |
| `RUST_LOG` | no | `info,zerocode=debug` | `tracing` / `env_filter` directive. |

### Shared / infrastructure

| Variable | Used by | Description |
|---|---|---|
| `ZEROCODE_RETENTION_HOURS` | sweeper | How long completed submissions are retained before cleanup. |
| `ZEROCODE_PAYLOAD_TTL_SECS` | sweeper | TTL for large payload blobs (stdout/stderr). |

---

## 3. Docker Compose Quickstart

The repository ships a Compose file at `deploy/docker-compose.yml` with four
services: `postgres`, `migrate`, `runner-rootfs-init`, `api`, and `worker`.

### Step 1 -- Build images

```bash
# Build the runner rootfs image (language toolchains).
docker build -f runners/Dockerfile -t zerocode-runner:dev runners/

# Build the API + migrate image (statically linked, distroless).
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .

# Build the worker image (glibc + libseccomp).
docker build -f deploy/Dockerfile.worker -t zerocode-worker:dev .
```

### Step 2 -- Start the stack

```bash
cd deploy/
docker compose up -d
```

This will, in order:

1. Start Postgres and wait for its healthcheck.
2. Run `zerocode-migrate` against Postgres (exits after applying migrations).
3. Run `runner-rootfs-init` to extract the runner image filesystem into the
   `runner-rootfs` named volume (one-shot, exits when done).
4. Start the API on port 8080.
5. Start the worker, which mounts the runner rootfs read-only and begins
   polling for submissions.

### Step 3 -- Verify

```bash
# Check that all services are healthy / exited cleanly:
docker compose ps

# Smoke-test the API:
curl -s -H "Authorization: Bearer dev-only-replace-me" \
     http://localhost:8080/v1/languages | head
```

### Step 4 -- Tear down

```bash
docker compose down
# To also remove volumes (Postgres data + runner rootfs):
docker compose down -v
```

---

## 4. Runner Rootfs Setup

The worker sandbox uses `pivot_root` to place each submission inside a
read-only copy of the runner filesystem. This filesystem contains all the
language toolchains (Python, Node, GCC, Go, Rust, Java) installed by
`runners/Dockerfile`.

### How it works in Compose

The `runner-rootfs-init` service runs as a one-shot container:

```yaml
runner-rootfs-init:
  image: zerocode-runner:dev
  entrypoint: ["/bin/sh", "-c"]
  command:
    - |
      set -eu
      cp -a / /target/ 2>/dev/null || true
      echo "runner rootfs ready"
  volumes:
    - runner-rootfs:/target
  restart: "no"
```

It copies the entire runner image filesystem into the `runner-rootfs` named
volume. The worker then mounts that volume read-only at
`/var/lib/zerocode/runner-rootfs`.

### Manual setup (without Compose)

If you run the worker outside of Compose, extract the rootfs yourself:

```bash
# Create a throwaway container from the runner image.
cid=$(docker create zerocode-runner:dev /bin/true)

# Export its filesystem into a directory.
sudo mkdir -p /var/lib/zerocode/runner-rootfs
docker export "$cid" | sudo tar -xf - -C /var/lib/zerocode/runner-rootfs

# Clean up the throwaway container.
docker rm "$cid"

# The worker reads this path via ZEROCODE_RUNNER_ROOTFS.
export ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs
```

### Updating the rootfs

When you rebuild the runner image (e.g., to add a language or upgrade a
toolchain), re-run the extraction:

```bash
# Compose:
docker compose run --rm runner-rootfs-init

# Manual: repeat the export steps above.
```

---

## 5. TLS Termination

ZeroCode's API server listens on plain HTTP only. In production, place a
reverse proxy in front for TLS termination.

### Caddy (recommended for simplicity)

```
zerocode.example.com {
    reverse_proxy localhost:8080
}
```

Caddy handles certificate provisioning (ACME / Let's Encrypt) automatically.
Save this as `Caddyfile` and run:

```bash
caddy run --config Caddyfile
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name zerocode.example.com;

    ssl_certificate     /etc/letsencrypt/live/zerocode.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zerocode.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik

If you already run Traefik, add labels to the `api` service in your Compose
override:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.zerocode.rule=Host(`zerocode.example.com`)"
  - "traefik.http.routers.zerocode.tls.certresolver=letsencrypt"
  - "traefik.http.services.zerocode.loadbalancer.server.port=8080"
```

---

## 6. Cgroup Delegation

The worker creates a child cgroup for every sandbox execution to enforce
memory, CPU, and PID limits. The worker process must own a cgroup subtree
with the required controllers delegated to it.

### Method A -- systemd (recommended)

If the worker runs under systemd (either bare-metal or inside a container
with `cgroup: private`), use a transient scope or a drop-in:

**Transient scope (quick test):**

```bash
sudo systemd-run \
    --scope \
    --unit=zerocode-worker \
    --property="Delegate=cpu memory pids" \
    --uid=zerocode \
    /usr/local/bin/zerocode-worker
```

**Persistent service unit:**

Create `/etc/systemd/system/zerocode-worker.service`:

```ini
[Unit]
Description=ZeroCode sandbox worker
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=exec
User=zerocode
Group=zerocode
ExecStart=/usr/local/bin/zerocode-worker
Delegate=cpu memory pids
EnvironmentFile=/etc/zerocode/worker.env
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/sys/fs/cgroup
ReadOnlyPaths=/var/lib/zerocode/runner-rootfs

[Install]
WantedBy=multi-user.target
```

The key line is `Delegate=cpu memory pids` -- this tells systemd to hand off
the named controllers to the service's cgroup so the worker can create child
cgroups.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zerocode-worker
```

### Method B -- manual (no systemd)

Create a cgroup subtree and transfer ownership to the worker user:

```bash
# Create the subtree.
sudo mkdir -p /sys/fs/cgroup/zerocode

# Enable the required controllers.
echo "+cpu +memory +pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control

# Hand ownership to the worker user (uid 10001 in the container image).
sudo chown -R zerocode:zerocode /sys/fs/cgroup/zerocode
```

The worker will create per-sandbox child cgroups (e.g.,
`/sys/fs/cgroup/zerocode/sandbox-<id>`) and clean them up after execution.

### Docker Compose

The Compose file already handles delegation:

```yaml
worker:
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:rw
  cap_add:
    - SYS_ADMIN
  cgroup: private
```

`cgroup: private` gives the container its own cgroup namespace. The
`SYS_ADMIN` capability is scoped to the worker's user namespace and is
required for `unshare`, `mount`, and `pivot_root` inside the sandbox.

---

## 7. Troubleshooting

### "kernel feature missing" on worker boot

The worker runs a preflight check at startup (`kernel_check::preflight`) and
exits immediately if any required feature is absent. The error message tells
you exactly what is missing.

| Error | Fix |
|---|---|
| `cgroup v2 unified hierarchy not detected` | Boot with `systemd.unified_cgroup_hierarchy=1` on the kernel command line, or switch to a distribution that defaults to cgroup v2 (Ubuntu 22.04+, Fedora 31+, Debian 12+). |
| `cgroup.kill not writable (need kernel >= 5.14)` | Upgrade your kernel to 5.14 or later. |
| `landlock not available` | Ensure `CONFIG_SECURITY_LANDLOCK=y` in your kernel config. Most recent distribution kernels have this enabled. |
| `user namespaces disabled` | Run `sudo sysctl -w kernel.unprivileged_userns_clone=1` and persist it in `/etc/sysctl.d/`. |

Check the worker logs -- the preflight prints a full report before it fails:

```bash
docker compose logs worker | grep -E 'kernel|cgroup|landlock|userns'
```

### "runner rootfs not found"

The worker cannot find the extracted runner filesystem at the path specified
by `ZEROCODE_RUNNER_ROOTFS`.

```bash
# Verify the volume was populated:
docker compose run --rm worker ls /var/lib/zerocode/runner-rootfs/usr/bin/python3.13

# If empty, re-run the init service:
docker compose run --rm runner-rootfs-init

# Check that the volume is mounted read-only in the worker:
docker inspect $(docker compose ps -q worker) | grep -A5 runner-rootfs
```

If running outside Compose, ensure the directory exists and was extracted
correctly (see [Section 4](#4-runner-rootfs-setup)).

### "cgroup setup failed: permission denied"

The worker process does not have write access to its cgroup subtree.

```bash
# Check who owns the worker's cgroup:
cat /proc/$(pgrep zerocode-worker)/cgroup
# Then inspect that path:
ls -la /sys/fs/cgroup/<path-from-above>/

# The worker user must own the directory and be able to write
# cgroup.subtree_control, memory.max, pids.max, etc.
```

Fixes:

- **systemd**: add `Delegate=cpu memory pids` to the service unit (see
  Section 6).
- **Docker Compose**: ensure `cgroup: private` and `cap_add: [SYS_ADMIN]`
  are set on the worker service.
- **Manual**: `chown` the cgroup subtree to the worker user.

### DB connection failures

Both the API and worker fail fast if they cannot reach Postgres within 2
seconds.

```bash
# Test connectivity from the host:
psql "postgres://zerocode:zerocode@localhost:5432/zerocode" -c "SELECT 1;"

# Inside Compose, check Postgres is healthy:
docker compose ps postgres
docker compose logs postgres

# Verify migrations ran successfully:
docker compose logs migrate
```

Common causes:

- Postgres not yet ready -- the Compose file uses a healthcheck with retries;
  if you removed it, the API/worker may start before Postgres accepts
  connections.
- Wrong `DATABASE_URL` -- double-check hostname, port, credentials, and
  database name.
- Connection pool exhaustion -- the worker defaults to `max_connections=4`.
  If you run many workers against the same database, ensure
  `max_connections` in `postgresql.conf` can accommodate them all.

### Worker claims stuck in "processing"

If a worker crashes mid-execution, its claimed rows remain in `processing`
state. The built-in sweeper task (running inside each worker) periodically
scans for stale claims and requeues them.

```bash
# Check for stuck rows:
psql "$DATABASE_URL" -c "
  SELECT id, worker_id, claimed_at
  FROM submissions
  WHERE status = 'processing'
    AND claimed_at < NOW() - INTERVAL '5 minutes';
"
```

If the sweeper is not recovering them:

- Verify the sweeper is running (look for `sweeper` in worker logs).
- Manually requeue stuck rows:

```bash
psql "$DATABASE_URL" -c "
  UPDATE submissions
  SET status = 'queued', worker_id = NULL, claimed_at = NULL
  WHERE status = 'processing'
    AND claimed_at < NOW() - INTERVAL '10 minutes';
"
```

- If a specific worker is consistently crashing, check its logs and the
  `ZEROCODE_WORKER_ID` to isolate the problem instance.
