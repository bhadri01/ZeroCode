# Deploying ZeroCode

Production deployment guide. Covers host prerequisites, image build,
capabilities, cgroup delegation, TLS termination, and a troubleshooting
section that includes the failure modes the team has hit in practice.

> **For**: operators running ZeroCode on their own host. See [`README.md`](README.md) for docs orientation; [`DEVELOPMENT.md`](DEVELOPMENT.md) for local-dev workflow.

---

## 1. Host requirements

ZeroCode workers create per-submission Linux user-namespace sandboxes
with cgroup-based resource limits. The host kernel must satisfy *all* of
the following.

### Kernel ≥ 5.14

The worker uses `cgroup.kill` (landed in 5.14) and Landlock LSM (5.13+).

```bash
uname -r
# Must print 5.14.x or later.
```

### cgroup v2 unified hierarchy

The cgroup filesystem must be mounted as the v2 unified hierarchy (no
hybrid mode).

```bash
mount | grep cgroup2
# Expect something like:
#   cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)

# The worker preflight specifically stats this file:
stat /sys/fs/cgroup/cgroup.controllers
```

Distributions that default to unified cgroup v2: **Ubuntu 22.04+, Fedora
31+, Debian 12+, RHEL 9+**. On older hosts, boot with
`systemd.unified_cgroup_hierarchy=1` on the kernel command line.

### Unprivileged user namespaces

```bash
sysctl kernel.unprivileged_userns_clone
# Must be 1. If the sysctl does not exist, user namespaces are
# unconditionally enabled on your kernel and you are fine.

# Persistently enable:
echo 'kernel.unprivileged_userns_clone=1' | sudo tee /etc/sysctl.d/99-userns.conf
sudo sysctl --system
```

### Delegated cgroup subtree

The worker process must own a cgroup subtree so it can create per-sandbox
child cgroups. Under Docker, the compose file (`cgroup: private`) handles
this. Under systemd, use `Delegate=cpu memory pids`. See
[§6 — Cgroup delegation](#6-cgroup-delegation).

---

## 2. Environment variables

Every variable is read via `clap` with `env = "..."` annotations.
Variables without a default are **required**.

### API server (`zerocode-api`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string. |
| `ZEROCODE_API_BIND` | no | `0.0.0.0:8080` | Listen address. |
| `ZEROCODE_API_KEY` | yes | — | Static Bearer token for v1 auth. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Language registry path. |
| `ZEROCODE_CORS_ORIGINS` | no | empty | Comma-separated origin allowlist. Empty = same-origin only. |
| `ZEROCODE_ALLOW_ANONYMOUS` | no | `false` | Admit unauthenticated requests under the anon quota. **Leave off for prod.** |
| `ZEROCODE_GOVERNOR_RPS` | no | `100` | Per-IP requests per second. |
| `ZEROCODE_GOVERNOR_BURST` | no | `100` | Per-IP burst capacity. |
| `ZEROCODE_WEB_DIR` | no | `web/dist` | Where the playground static assets live. `""` disables the mount. |
| `RUST_LOG` | no | `info` | `tracing`/`env_filter` directive. |

### Worker (`zerocode-worker`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Same as API. |
| `ZEROCODE_WORKER_ID` | no | `worker-<ulid>` | Stable identifier. Set explicitly with multiple workers. |
| `ZEROCODE_RUNNER_ROOTFS` | yes | — | Path to the extracted runner filesystem. Typically `/var/lib/zerocode/runner-rootfs`. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Language registry path. |
| `ZEROCODE_MAX_PARALLEL` | no | num CPUs | Concurrent sandbox count. |
| `ZEROCODE_WEBHOOK_SECRET` | no | empty | HMAC-SHA256 secret for outbound webhook signatures. **Set in prod.** |
| `RUST_LOG` | no | `info` | Logging filter. |

### Sweeper (runs inside each worker)

| Variable | Used by | Description |
|---|---|---|
| `ZEROCODE_RETENTION_HOURS` | sweeper | Submission retention TTL. |
| `ZEROCODE_PAYLOAD_TTL_SECS` | sweeper | TTL for stdout/stderr blobs. |

---

## 3. Docker Compose quickstart

The repo ships a dev-flavoured compose at
[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) and a
production-shaped template at
[`deploy/docker-compose.prod.example.yml`](../deploy/docker-compose.prod.example.yml).

### Step 1 — build images

```bash
# Toolchain rootfs
docker build -f runners/Dockerfile        -t zerocode-runner:v0.1.0  runners/

# API + migrate (distroless/musl-static)
docker build -f deploy/Dockerfile.service -t zerocode-service:v0.1.0 .

# Worker (glibc)
docker build -f deploy/Dockerfile.worker  -t zerocode-worker:v0.1.0  .
```

### Step 2 — production compose

```bash
cp deploy/docker-compose.prod.example.yml deploy/docker-compose.prod.yml
# Edit secrets — replace every __CHANGE_ME__ marker. Set ZEROCODE_API_KEY,
# ZEROCODE_WEBHOOK_SECRET, POSTGRES_PASSWORD, and the DATABASE_URL.

docker compose -f deploy/docker-compose.prod.yml up -d
```

This brings up, in dependency order:

1. **postgres** — waits for healthcheck to pass.
2. **migrate** — applies SQL migrations, exits.
3. **runner-rootfs-init** — extracts the runner image filesystem into the shared volume.
4. **api** — listens on `127.0.0.1:8080` (behind your reverse proxy).
5. **worker** — claims jobs and runs sandboxes.

### Step 3 — verify

```bash
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs worker | grep -E 'bind-mount|rootfs'
# Expect two "bind-mounted into runner rootfs" lines.

curl -s -H "Authorization: Bearer $YOUR_KEY" \
     http://localhost:8080/v1/languages | jq
```

### Step 4 — tear down

```bash
docker compose -f deploy/docker-compose.prod.yml down
docker compose -f deploy/docker-compose.prod.yml down -v   # also drops volumes
```

---

## 4. Runner rootfs setup

The worker sandbox uses `pivot_root` (production) or `chroot` (dev) to
place each submission inside a copy of the runner filesystem. That
filesystem contains every language toolchain: Python, Node, GCC, Go,
Rust, Java.

### How it works under Compose

[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) declares a
named volume `runner-rootfs` and a one-shot `runner-rootfs-init`
service that extracts the runner image into it:

```yaml
runner-rootfs-init:
  image: zerocode-runner:v0.1.0
  command:
    - |
      tar -C / \
        --exclude=./target \
        --exclude=./dev --exclude=./proc --exclude=./sys --exclude=./tmp \
        -cf - . | tar -C /target -xf -
  volumes:
    - runner-rootfs:/target
```

The exclusions are important — `/proc`, `/sys`, and `/dev` are
kernel-backed pseudo-filesystems. If you tar them you'll inflate the
rootfs dramatically and pull in bogus files like `pagemap`.

The worker then mounts `runner-rootfs` at
`/var/lib/zerocode/runner-rootfs` and bind-mounts the worker's `/proc`
and `/dev` *into* that path at startup so chrooted processes have
working pseudo-filesystems. **This bind-mount step is essential** —
without it, Go, Java, and Rust will all fail; see
[§7 — Troubleshooting](#7-troubleshooting).

### Manual setup (no compose)

```bash
# Create a throwaway container from the runner image
cid=$(docker create zerocode-runner:v0.1.0 /bin/true)

# Export its filesystem
sudo mkdir -p /var/lib/zerocode/runner-rootfs
docker export "$cid" | sudo tar -xf - -C /var/lib/zerocode/runner-rootfs
docker rm "$cid"

# Point the worker at it
export ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs
```

### Updating the rootfs

When you rebuild the runner image (new language, toolchain upgrade):

```bash
# Rebuild the runner image first
docker build -f runners/Dockerfile -t zerocode-runner:v0.1.1 runners/

# Re-run the extraction
docker compose -f deploy/docker-compose.prod.yml run --rm runner-rootfs-init

# Restart the worker so it picks up the new toolchains
docker compose -f deploy/docker-compose.prod.yml restart worker
```

---

## 5. TLS termination

The API listens on plain HTTP only. Always front it with a TLS-terminating
reverse proxy.

### Caddy (simplest)

```caddyfile
zerocode.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy handles ACME / Let's Encrypt automatically.

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

        # SSE streaming endpoint
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

The `proxy_buffering off` is required for `GET
/v1/submissions/{token}/stream` — without it, nginx buffers SSE chunks
and clients see traffic arrive in batches.

### Traefik

Add labels on the `api` service:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.zerocode.rule=Host(`zerocode.example.com`)"
  - "traefik.http.routers.zerocode.tls.certresolver=letsencrypt"
  - "traefik.http.services.zerocode.loadbalancer.server.port=8080"
```

---

## 6. Cgroup delegation

The worker creates a child cgroup per sandbox to enforce memory, CPU,
and PID limits. Its parent process needs to *own* a cgroup subtree
with the right controllers delegated.

### Method A — systemd (recommended for bare-metal)

```ini
# /etc/systemd/system/zerocode-worker.service
[Unit]
Description=ZeroCode sandbox worker
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=exec
User=zerocode
Group=zerocode
ExecStart=/usr/local/bin/zerocode-worker
EnvironmentFile=/etc/zerocode/worker.env

# Cgroup delegation — the load-bearing line
Delegate=cpu memory pids

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/sys/fs/cgroup
ReadOnlyPaths=/var/lib/zerocode/runner-rootfs

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zerocode-worker
```

### Method B — manual (no systemd)

```bash
sudo mkdir -p /sys/fs/cgroup/zerocode
echo "+cpu +memory +pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control
sudo chown -R zerocode:zerocode /sys/fs/cgroup/zerocode
```

### Docker Compose

The provided compose files already handle delegation:

```yaml
worker:
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:rw
  cap_add:
    - SYS_ADMIN
    - SYS_CHROOT
  cgroup: private
```

`cgroup: private` gives the container its own cgroup namespace.
`SYS_ADMIN` is scoped to the worker's user namespace and is required
for `unshare`, `mount` (including the `/proc` bind-mount), and
`pivot_root`. `SYS_CHROOT` is needed by the NaiveSandbox to call
`chroot()`.

---

## 7. Troubleshooting

### Worker can't bind-mount `/proc` (silent on older builds — now fatal)

**Symptom (current builds):** worker logs `bind-mount /proc -> <rootfs>/proc failed`
at startup or on first submission.

**Symptom (pre-fix builds):** worker logs a `warn`, then every Go,
Java, and Rust submission fails with one of:

- Go: `cannot find GOROOT directory: 'go' binary is trimmed and GOROOT is not set`
- Java: `/usr/bin/javac: error while loading shared libraries: libjli.so: cannot open shared object file`
- Rust: spawn errors / "sandbox error"

**Why:** Go, Java, and Rust all use `/proc/self/exe` to locate their
install dir. If `/proc` isn't bind-mounted into the chroot, none of
them can find their stdlib / sysroot / RPATH origin.

**Fixes (in priority order):**

1. **Grant the worker `CAP_SYS_ADMIN`.** Required for the bind-mount.
   Under Compose, this is in
   [`deploy/docker-compose.yml`](../deploy/docker-compose.yml#L122-L127);
   under Kubernetes, add it to `securityContext.capabilities.add`;
   under systemd, `AmbientCapabilities=CAP_SYS_ADMIN`.
2. **Mount the runner rootfs read-write.** The worker needs to create
   `<rootfs>/proc` and `<rootfs>/dev` directories before binding into them.
3. **Ensure `/bin/mount` exists in the worker image.** It's installed
   by [`deploy/Dockerfile.worker`](../deploy/Dockerfile.worker#L33-L35); only
   relevant if you've forked the worker image.

Verify after the fix:

```bash
docker exec <worker> cat /proc/self/mountinfo | grep runner-rootfs
docker exec <worker> ls /var/lib/zerocode/runner-rootfs/proc | head
```

### "kernel feature missing" on worker boot

The worker preflight (`kernel_check::preflight`) exits immediately if any
required feature is absent.

| Error | Fix |
|---|---|
| `cgroup v2 unified hierarchy not detected` | Boot with `systemd.unified_cgroup_hierarchy=1` or switch to a distro defaulting to cgroup v2. |
| `cgroup.kill not writable (need kernel >= 5.14)` | Upgrade kernel. |
| `landlock not available` | `CONFIG_SECURITY_LANDLOCK=y` in the kernel config. |
| `user namespaces disabled` | `sudo sysctl -w kernel.unprivileged_userns_clone=1` (persist in `/etc/sysctl.d/`). |

```bash
docker compose logs worker | grep -E 'kernel|cgroup|landlock|userns'
```

### "runner rootfs not found"

```bash
docker compose run --rm worker ls /var/lib/zerocode/runner-rootfs/usr/bin/python3.13
# If empty, re-extract:
docker compose run --rm runner-rootfs-init
```

### "cgroup setup failed: permission denied"

The worker process doesn't have write access to its cgroup subtree.

```bash
cat /proc/$(pgrep zerocode-worker)/cgroup
ls -la /sys/fs/cgroup/<path-from-above>/
```

Fixes:
- **systemd**: add `Delegate=cpu memory pids` (see §6).
- **Docker**: ensure `cgroup: private` and `cap_add: [SYS_ADMIN]`.
- **Manual**: `chown` the cgroup subtree to the worker user.

### DB connection failures

Both binaries fail fast if Postgres isn't reachable in 2 seconds.

```bash
psql "$DATABASE_URL" -c "SELECT 1;"
docker compose logs postgres
docker compose logs migrate
```

Common causes:
- Postgres still booting — the compose healthcheck handles this; if you
  removed it, the API/worker may race ahead.
- Wrong `DATABASE_URL` — check host, port, credentials.
- Pool exhaustion — workers default to `max_connections=4`; tune
  `postgresql.conf` `max_connections` for the worker count.

### Worker claims stuck in `processing`

If a worker crashes mid-execution, its claimed rows stay `processing`.
The sweeper (running inside each worker) periodically requeues them.

```bash
psql "$DATABASE_URL" -c "
  SELECT id, worker_id, claimed_at
  FROM submissions
  WHERE status = 'processing'
    AND claimed_at < NOW() - INTERVAL '5 minutes';"
```

Manual requeue if the sweeper is wedged:

```bash
psql "$DATABASE_URL" -c "
  UPDATE submissions
  SET status = 'queued', worker_id = NULL, claimed_at = NULL
  WHERE status = 'processing'
    AND claimed_at < NOW() - INTERVAL '10 minutes';"
```

---

## 8. Scaling notes

- **Workers** scale horizontally. Run as many as your Postgres
  connection budget allows. Each worker needs a distinct
  `ZEROCODE_WORKER_ID`.
- **API** scales horizontally behind any L7 load balancer. Stateless
  apart from the in-process moka result cache, which is per-instance
  (cache misses fall through to Postgres).
- **Postgres** is the queue and the source of truth. Vertical scaling
  carries you a long way; the queue uses `LISTEN/NOTIFY` + `SELECT FOR
  UPDATE SKIP LOCKED`, both of which are cheap on modern hardware.
- **Runner-rootfs** is shared across workers via the same named volume.
  All workers on a host pin the same toolchain set — rebuild and
  re-extract the rootfs together to keep them in sync.
