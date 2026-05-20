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

### AppArmor (Ubuntu / Debian)

The worker performs two operations that the **stock Docker AppArmor profile
(`docker-default`) blocks or restricts**, even with `CAP_SYS_ADMIN`:

1. **`mount` / `pivot_root`** — `docker-default` denies the `mount` syscall
   outright. The sandbox needs it to build each per-submission rootfs.
2. **User-namespace setup** — Ubuntu 23.10+ ships
   `kernel.apparmor_restrict_unprivileged_userns=1`, which makes the
   per-job `uid_map`/`gid_map` write fail with `EPERM` (symptom:
   `userns map write failed … write uid_map: Operation not permitted`).

The supported fix is the **named AppArmor profile** shipped at
[`deploy/apparmor/zerocode-worker`](../deploy/apparmor/zerocode-worker),
which grants `userns` + `mount` + `pivot_root`. Load it on the host before
starting the worker:

```bash
sudo apparmor_parser -r -W deploy/apparmor/zerocode-worker
sudo aa-status | grep zerocode-worker      # confirm it's loaded
# persist across reboots:
sudo cp deploy/apparmor/zerocode-worker /etc/apparmor.d/zerocode-worker
```

The compose worker then runs under `security_opt: apparmor=zerocode-worker`.
If your AppArmor is < 4.0 (the `userns` rule won't parse), the only
alternative is `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
— but that disables the mitigation **host-wide**, which is a poor trade on a
host that runs untrusted code. Prefer the profile.

> Hosts without AppArmor (many non-Ubuntu distros) skip this entirely.

The AppArmor profile is necessary but **not sufficient** for a containerised
worker. Two more `security_opt` settings are required (full list in
[§6 — Docker Compose](#docker-compose)):
- **`seccomp=unconfined`** — Docker's default seccomp profile blocks
  `pivot_root` (even with `CAP_SYS_ADMIN`).
- **`systempaths=unconfined`** — Docker locks `/proc` on a non-privileged
  container, which makes the kernel refuse the per-job procfs mount
  (`mount /proc: EPERM`).

Plus `CAP_SETFCAP` in `cap_add` (the kernel requires it to establish
user-namespace ID maps). All of these relax confinement on the *trusted
worker only*; user code stays boxed by the per-job sandbox. None are needed on
bare metal / systemd, where there are no locked container mounts or default
seccomp profile.

### Delegated cgroup subtree

The worker process must own a cgroup subtree so it can create per-sandbox
child cgroups. Under Docker, `cgroup: private` gives the container its own
cgroup namespace and the worker's entrypoint
([`deploy/worker-entrypoint.sh`](../deploy/worker-entrypoint.sh)) remounts
it read-write and delegates the `cpu/memory/pids` controllers at startup.
Under systemd, use `Delegate=cpu memory pids`. See
[§6 — Cgroup delegation](#6-cgroup-delegation).

---

## 2. Environment variables

Every variable is read via `clap` with `env = "..."` annotations.
Variables without a default are **required**.

### API server (`zerocode-api`)

ZeroCode runs as an open, unauthenticated backend. The only client-volume
guard is a per-IP `tower_governor` rate limit. Network-layer protection
(private subnet, firewall, reverse proxy with auth) is the operator's
responsibility.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string. |
| `ZEROCODE_API_BIND` | no | `0.0.0.0:8080` | Listen address. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Language registry path. |
| `ZEROCODE_GOVERNOR_RPS` | no | `100` | Per-IP requests per second. |
| `ZEROCODE_GOVERNOR_BURST` | no | `100` | Per-IP burst capacity. |
| `ZEROCODE_WEB_DIR` | no | `web/dist` | Where the playground static assets live. `""` disables the mount. |
| `RUST_LOG` | no | `info` | `tracing`/`env_filter` directive. |

> Hiding the `/docs/` site is a **build-time** choice (`VITE_HIDE_DOCS`), not a
> runtime env var — see [§3 Step 1](#step-1--build-images).

### Worker (`zerocode-worker`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Same as API. |
| `ZEROCODE_WORKER_ID` | no | `worker-<ulid>` | Stable identifier. Set explicitly with multiple workers. |
| `ZEROCODE_RUNNER_ROOTFS` | yes | — | Path to the extracted runner filesystem. Typically `/var/lib/zerocode/runner-rootfs`. |
| `ZEROCODE_CGROUP_PARENT` | no | `/sys/fs/cgroup/zerocode` | Delegated cgroup the sandbox creates per-job child cgroups under. Give each worker on a host a distinct path. |
| `ZEROCODE_SCRATCH_DIR` | no | `/run/zerocode-sandbox` | Where per-submission scratch dirs are created before `pivot_root`. |
| `ZEROCODE_LANGUAGES_FILE` | no | `runners/languages.toml` | Language registry path. |
| `ZEROCODE_MAX_PARALLEL` | no | num CPUs | Concurrent sandbox count. |
| `ZEROCODE_WEBHOOK_SECRET` | no | empty | HMAC-SHA256 secret for outbound webhook signatures. Optional — leave empty to deliver webhooks unsigned. |
| `RUST_LOG` | no | `info` | Logging filter. |

### Sweeper (runs inside each worker)

| Variable | Used by | Description |
|---|---|---|
| `ZEROCODE_RETENTION_HOURS` | sweeper | Submission retention TTL. |
| `ZEROCODE_PAYLOAD_TTL_SECS` | sweeper | TTL for stdout/stderr blobs. |

---

## 3. Docker Compose quickstart

The repo ships a single compose file at
[`deploy/docker-compose.yml`](../deploy/docker-compose.yml). It works for
both local dev and production behind a reverse proxy.

### Step 1 — build images

```bash
# Toolchain rootfs
docker build -f runners/Dockerfile        -t zerocode-runner:dev  runners/

# API + migrate (distroless/musl-static)
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .

# Worker (glibc)
docker build -f deploy/Dockerfile.worker  -t zerocode-worker:dev  .
```

Tag with a version (`:v0.1.0`) instead of `:dev` when shipping to a
production host — pinned tags make rollbacks deliberate.

The worker image is built `--features native` (real OS-level isolation:
namespaces + cgroups + seccomp + landlock). On AppArmor hosts, load the
worker profile now — see [§1 — AppArmor](#apparmor-ubuntu--debian):

```bash
sudo apparmor_parser -r -W deploy/apparmor/zerocode-worker
```

#### Documentation visibility (`VITE_HIDE_DOCS`)

The `/docs/` site is gated by a **build-time** flag baked into the web bundle
by `deploy/Dockerfile.service`. It is *not* a runtime env var — flipping it
on a running container does nothing; you must rebuild the service image.

| `--build-arg`        | Effect                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| `VITE_HIDE_DOCS=true`  | **Default.** Drops every `/docs/*` link from the UI, repoints "get started" CTAs to the playground, and skips building/serving the docs site so `/docs/` returns **404**. |
| `VITE_HIDE_DOCS=false` | Builds and serves the full docs site at `/docs/`.                                        |

```bash
# Docs hidden (current launch default — no build-arg needed):
docker build -f deploy/Dockerfile.service -t zerocode-service:dev .

# Bring docs back:
docker build -f deploy/Dockerfile.service --build-arg VITE_HIDE_DOCS=false -t zerocode-service:dev .
```

Local `pnpm dev` / `pnpm build` (outside Docker) default to docs **shown** —
the flag only defaults on inside the service image.

### Step 2 — bring up the stack

```bash
docker compose -f deploy/docker-compose.yml up -d
```

This brings up, in dependency order:

1. **postgres** — waits for healthcheck to pass.
2. **migrate** — applies SQL migrations, exits.
3. **runner-rootfs-init** — extracts the runner image filesystem into the shared volume.
4. **api** — listens on `0.0.0.0:8080` (mapped to the host).
5. **worker** — claims jobs and runs sandboxes.

For production behind a reverse proxy (Caddy, nginx, Traefik), either
keep the `8080:8080` port mapping and proxy to `localhost:8080`, or
uncomment the Traefik network block at the bottom of the compose file
and remove the port mapping (see `deploy/README.md` § "Traefik (optional)").

### Step 3 — verify

```bash
docker compose -f deploy/docker-compose.yml ps

# Worker boot should show the native preflight passing and the cgroup
# subtree delegated — no "uid_map" / "kernel feature missing" errors.
docker compose -f deploy/docker-compose.yml logs worker \
  | grep -E 'preflight|cgroup ready|NativeSandbox|user namespaces'
# Expect lines like:
#   worker-entrypoint: cgroup ready parent=/sys/fs/cgroup/zerocode controllers=[cpu memory pids]
#   starting NativeSandbox for tier=Native

curl -s http://localhost:8080/v1/languages | jq

# End-to-end smoke test (synchronous):
curl -s -X POST 'http://localhost:8080/v1/submissions?wait=true' \
  -H 'Content-Type: application/json' \
  -d '{"language_id":71,"source_code":"print(\"ok\")","base64_encoded":false}' | jq '.status,.stdout'
```

### Step 4 — tear down

```bash
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml down -v   # also drops volumes
```

---

## 4. Runner rootfs setup

The worker sandbox `pivot_root`s each submission into the runner
filesystem (inside a per-job mount namespace). That filesystem contains
every language toolchain: Python, Node, GCC, Go, Rust, Java.

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
      # Recreate the mountpoints the sandbox mounts onto, as empty dirs.
      mkdir -p /target/tmp /target/proc /target/dev /target/box
      chmod 1777 /target/tmp
  volumes:
    - runner-rootfs:/target
```

The exclusions are important — `/proc`, `/sys`, and `/dev` are
kernel-backed pseudo-filesystems. If you tar them you'll inflate the
rootfs dramatically and pull in bogus files like `pagemap`. **But the
sandbox still needs empty `/tmp`, `/proc`, `/dev`, and `/box` mountpoints
to exist** in the rootfs — the `mkdir` line above recreates them. Miss it
and submissions fail with `mount setup failed: tmpfs /tmp: ENOENT`.

The worker mounts `runner-rootfs` at `/var/lib/zerocode/runner-rootfs`
(read-mostly). Per submission, the sandbox `rbind`s it into a private
mount namespace, overlays per-job `tmpfs` at `/box` and `/tmp`,
`pivot_root`s in, and mounts a fresh `/proc` scoped to the new PID
namespace — so each job gets working pseudo-filesystems without anything
being baked into or leaked out of the shared rootfs.

### Manual setup (no compose)

```bash
# Create a throwaway container from the runner image
cid=$(docker create zerocode-runner:v0.1.0 /bin/true)

# Export its filesystem
sudo mkdir -p /var/lib/zerocode/runner-rootfs
docker export "$cid" | sudo tar -xf - -C /var/lib/zerocode/runner-rootfs
docker rm "$cid"

# Ensure the sandbox mountpoints exist as empty dirs
sudo mkdir -p /var/lib/zerocode/runner-rootfs/{tmp,proc,dev,box}
sudo chmod 1777 /var/lib/zerocode/runner-rootfs/tmp

# Point the worker at it
export ZEROCODE_RUNNER_ROOTFS=/var/lib/zerocode/runner-rootfs
```

### Updating the rootfs

When you rebuild the runner image (new language, toolchain upgrade):

```bash
# Rebuild the runner image first
docker build -f runners/Dockerfile -t zerocode-runner:v0.1.1 runners/

# Re-run the extraction
docker compose -f deploy/docker-compose.yml run --rm runner-rootfs-init

# Restart the worker so it picks up the new toolchains
docker compose -f deploy/docker-compose.yml restart worker
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

Under Compose, `cgroup: private` only makes delegation *possible* — it
gives the container its own cgroup namespace, but something still has to
remount cgroupfs read-write (Docker mounts it read-only) and enable the
controllers. The worker's entrypoint
([`deploy/worker-entrypoint.sh`](../deploy/worker-entrypoint.sh)) does
that at startup. The relevant compose settings:

```yaml
worker:
  # NOTE: do NOT bind-mount the host /sys/fs/cgroup — that exposes the host
  # root cgroup and nsdelegate blocks the worker from creating cgroups
  # (EACCES). Rely on the namespaced mount from `cgroup: private` instead.
  cgroup: private
  cap_drop: [ "ALL" ]
  cap_add:
    - SYS_ADMIN     # unshare, mount, pivot_root, remount cgroupfs rw
    - SYS_CHROOT    # pivot_root / chroot into the runner rootfs
    - SETUID        # write the per-job uid_map
    - SETGID        # write the per-job gid_map
    - SETFCAP       # PR_CAPBSET_DROP / establish userns ID maps
  security_opt:
    - apparmor=zerocode-worker   # §1 — grants userns + mount/pivot_root
    - seccomp=unconfined         # Docker's default seccomp blocks pivot_root
    - systempaths=unconfined     # unlock /proc so the sandbox can mount a fresh procfs
```

All three `security_opt` entries are required when the worker runs **inside a
container**: the AppArmor profile permits `userns`/`mount`, `seccomp=unconfined`
unblocks `pivot_root`, and `systempaths=unconfined` removes the locked-mount on
`/proc` that otherwise blocks the per-job procfs (`mount /proc: EPERM`). They
relax confinement on the **trusted worker only** — untrusted user code is still
fully boxed by the per-job namespaces, cgroups, seccomp and landlock the sandbox
applies. On bare metal / systemd (§6 Method A) none of these are needed.

The entrypoint then, at boot:

1. `mount -o remount,rw /sys/fs/cgroup` (namespaced cgroup tree).
2. Moves PID 1 into a leaf cgroup so the namespace-root can delegate
   controllers (cgroup v2 "no internal processes" rule).
3. `echo +cpu +memory +pids > cgroup.subtree_control` on the root and on
   the `ZEROCODE_CGROUP_PARENT` it creates.

Confirm it worked: the worker logs
`worker-entrypoint: cgroup ready parent=/sys/fs/cgroup/zerocode controllers=[cpu memory pids]`.

---

## 7. Troubleshooting

### `userns map write failed … write uid_map: Operation not permitted`

**Symptom:** the worker boots fine but every submission fails; logs show
`userns map write failed; killing child` and submissions return exit
`127` with empty stdout/stderr.

**Why:** the sandbox creates a per-job user namespace and the worker
writes the child's `uid_map`. On Ubuntu 23.10+,
`kernel.apparmor_restrict_unprivileged_userns=1` blocks this for
containers that lack the AppArmor `userns` permission — even with
`CAP_SETUID` + `CAP_SYS_ADMIN` + `apparmor=unconfined`.

**Fix:** load the worker AppArmor profile (grants `userns`) and run the
worker under it — see [§1 — AppArmor](#apparmor-ubuntu--debian):

```bash
sudo apparmor_parser -r -W deploy/apparmor/zerocode-worker   # then recreate the worker
```

Also confirm the worker has `CAP_SETUID`, `CAP_SETGID` **and `CAP_SETFCAP`**
(compose `cap_add`) — the kernel needs `CAP_SETFCAP` to establish userns ID
maps, and the write fails without it even when AppArmor allows it:

```bash
grep CapEff /proc/$(docker inspect -f '{{.State.Pid}}' <worker>)/status
# decode: capsh --decode=<hex>  → must include cap_setuid,cap_setgid
```

### `failed to apply apparmor profile … zerocode-worker` on `up`

The named profile isn't loaded in the kernel. Load it
(`sudo apparmor_parser -r -W deploy/apparmor/zerocode-worker`) **before**
starting the worker, or temporarily set `apparmor=unconfined` in compose
(note: unconfined still hits the `uid_map` issue above on Ubuntu 23.10+).

### `mount setup failed: tmpfs /tmp: ENOENT`

The runner rootfs is missing the `/tmp` (or `/box`/`/proc`/`/dev`)
mountpoint the sandbox mounts onto. The extraction excludes those paths;
recreate them as empty dirs — see [§4](#4-runner-rootfs-setup). Re-run
`runner-rootfs-init`, then check:

```bash
docker run --rm -v <stack>_runner-rootfs:/r:ro busybox ls -ld /r/tmp /r/box /r/proc
```

### Compiled-language submissions fail to spawn (`No such file or directory`)

The `compile_cmd[0]`/`run_cmd[0]` path in `runners/languages.toml` doesn't
exist inside the runner rootfs (e.g. `/usr/bin/rustc` when rustup installed
the proxy at `/usr/local/cargo/bin/rustc`). Confirm the binary exists in
the rootfs and fix the path/env in the registry to match the runner image.

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

## 8. Scaling workers

Workers are stateless and coordinate only through Postgres
(`SELECT … FOR UPDATE SKIP LOCKED`), so adding workers scales throughput
linearly — no leader, no broker.

### Scale on one host

```bash
docker compose -f deploy/docker-compose.yml up -d --scale worker=4
```

The compose file leaves `ZEROCODE_WORKER_ID` unset, so each replica
auto-generates a unique `worker-<ulid>` — required for the stuck-job
sweeper to attribute claims correctly. (Adjust the `deploy.replicas`
value in the file to make a count stick without the `--scale` flag.)

### Two knobs

| Axis | Knob | Effect |
|---|---|---|
| Vertical | `ZEROCODE_MAX_PARALLEL` (default = CPU cores) | concurrent sandboxes *per* worker |
| Horizontal | `--scale worker=N` / `deploy.replicas` / more hosts | more workers on the shared queue |

Because sandboxes run real user code, workers are CPU-bound — keep
`MAX_PARALLEL ≈ cores`, then add workers/hosts for more.

### Watch these ceilings

- **Postgres connections (first wall).** Each worker opens a pool of 4,
  the API uses 16. Keep `16 + workers × 4 < max_connections` (default
  100) → roughly **20 workers** before you raise `max_connections` or
  add **PgBouncer** (transaction pooling).
- **Per-host rootfs.** The `runner-rootfs` volume is per host. On a new
  host, run `runner-rootfs-init` there too. Rebuild + re-extract on all
  hosts together so toolchains stay in sync.
- **cgroup parent (native sandbox).** Multiple native-sandbox workers on
  one host each need a distinct `ZEROCODE_CGROUP_PARENT` so they don't
  contend for the same delegated subtree.

### Autoscale on queue depth

Each worker exports the signals an autoscaler needs:

- `zerocode_pending_jobs` — queued count (sampled every 5 s)
- `zerocode_active_sandboxes` / `zerocode_worker_parallelism` — utilisation

Point a Kubernetes HPA or KEDA `ScaledObject` at `zerocode_pending_jobs`
(scale up as the queue grows, down as it drains). Rough capacity:

```
sustained throughput ≈ (Σ MAX_PARALLEL across workers) / avg_job_seconds
```

If `pending_jobs` keeps climbing instead of hovering near zero, you're
under-provisioned — add workers until it drains.

### The other tiers

- **API** scales horizontally behind any L7 load balancer. Stateless
  apart from the in-process moka result cache (per-instance; misses fall
  through to Postgres).
- **Postgres** is the queue and source of truth. Vertical scaling carries
  you far; `LISTEN/NOTIFY` + `SKIP LOCKED` are cheap. Beyond that, add
  PgBouncer and consider a read replica for the read-heavy `GET` paths.
