# ZeroCode Threat Model

> **For**: security reviewers and contributors hardening the sandbox. See [`README.md`](README.md) for docs orientation.

## 1. Overview

ZeroCode is a sandboxed code execution service designed as a replacement for
Judge0. It accepts untrusted source code over an HTTP API, compiles and runs it
inside a Linux sandbox, and returns stdout/stderr/exit status.

**Primary adversary**: any authenticated API consumer who submits arbitrary
source code. The submitted code is assumed to be fully hostile -- it may attempt
container escape, host filesystem access, network exfiltration, denial of
service, or privilege escalation. The threat model also considers
unauthenticated attackers probing the API surface.

**Security goal**: a successful submission must never affect the host, other
submissions, or the control plane (API server, database) regardless of what
syscalls the submitted code invokes.


## 2. Trust Boundaries

> ZeroCode is configured as an **open, unauthenticated backend**. There is
> no application-layer auth on `/v1/*` routes. Operators are expected to
> restrict who can reach the API via the network layer — private subnet,
> firewall, reverse proxy with its own auth, VPN, or service-mesh policy.
> A per-IP `tower_governor` rate limit (default 100 RPS) caps client
> volume. The boundaries below assume that network-layer control is in
> place; the in-process boundaries protect against attackers who have
> already passed it.

```
                         TB1                TB2               TB3
    +---------+    +-----------+    +------------+    +----------+    +----------------+
    |  Client | -->|  API      | -->|  Postgres  | <--|  Worker  | -->|  Sandbox       |
    | (HTTP)  |    |  (axum)   |    |  (pg16)    |    |  (Rust)  |    |  (namespaces   |
    |         |    | rate-     |    |            |    |          |    |   + cgroup      |
    |         |    | limited   |    | submission |    | poll     |    |   + pivot_root  |
    |         |    | per-IP    |    | queue rows |    | loop     |    |   + landlock    |
    |         |    |           |    |            |    |          |    |   + seccomp)    |
    +---------+    +-----------+    +------------+    +----------+    +----------------+
                                                                       |
                                                                       | execvpe
                                                                       v
                                                                     +----------------+
                                                                     | Untrusted code |
                                                                     | (PID 1 in ns)  |
                                                                     +----------------+

TB1 - Data boundary: API to Postgres. Submissions enqueued as rows; worker polls.
      No direct client access to the database. The API rate-limits per-IP and
      caps request body size at 256 KB.
TB2 - Process boundary: worker to sandbox. fork() + unshare() creates an isolated
      child. Parent writes uid_map and attaches the child to a cgroup before
      signalling it to proceed. See crates/zerocode-sandbox/src/native/exec.rs.
TB3 - Kernel enforcement boundary: the sandbox child has been pivot_root'd into a
      minimal rootfs, has all capabilities dropped, is landlock-confined, and has
      a seccomp BPF filter loaded. The only way out is through the kernel, and
      the kernel policy denies the relevant syscalls.
```


## 3. STRIDE Analysis

### Spoofing

| Threat | Mitigation |
|--------|-----------|
| Anyone can submit code | **Accepted.** ZeroCode runs as an open backend — restrict network reach (private subnet, firewall, reverse proxy with auth) at the operator level. |
| Sandbox process spoofs identity to the worker | The child runs in a user namespace where UID 0 maps to the worker's unprivileged host UID (`crates/zerocode-sandbox/src/native/userns.rs`). The parent identifies the child by PID returned from `fork()`, not by any self-reported identity. |

### Tampering

| Threat | Mitigation |
|--------|-----------|
| Submitted code modifies the runner rootfs (shared across submissions) | Runner rootfs is bind-mounted read-only. The writable surface is a per-submission tmpfs at `/box` (32 MB) and `/tmp` (64 MB), created fresh each run (`crates/zerocode-sandbox/src/native/mounts.rs:112-135`). |
| Submitted code modifies host filesystem via symlink traversal | Landlock policy confines FS access: RO on `/usr`, `/lib`, `/lib64`, `/bin`, `/sbin`, `/etc`; RW only on `/box` and `/tmp`. Landlock resolves at the target path, not the link, blocking symlink-escape attacks (`crates/zerocode-sandbox/src/native/landlock_policy.rs`). |
| Submitted code remounts filesystems | `mount`, `umount2`, `pivot_root`, `setns` are denied by seccomp (`crates/zerocode-sandbox/src/native/seccomp.rs:49-51`). All capabilities are dropped before exec (`exec.rs:236-237`). |
| Submitted code tampers with the cgroup limits | The cgroup hierarchy lives on the host under `/sys/fs/cgroup`. After `pivot_root`, the child's root is the runner rootfs -- `/sys/fs/cgroup` is not mounted inside the sandbox. The parent (not the child) writes cgroup knobs. |

### Repudiation

| Threat | Mitigation |
|--------|-----------|
| Submitter denies having submitted code | Submissions are stored in Postgres with a timestamp and the requesting peer IP. The worker logs execution lifecycle events via `tracing`. Stronger attribution requires an authenticating reverse proxy in front. |
| Sandbox error obscures what happened | Exit status, stdout, stderr, wall-clock timeout flag, OOM-kill detection, and peak memory are all captured and returned (`exec.rs:RawOutcome`, `cgroup.rs:oom_killed`, `cgroup.rs:memory_peak_bytes`). |

### Information Disclosure

| Threat | Mitigation |
|--------|-----------|
| Submitted code reads host filesystem | `pivot_root` replaces the root with the runner rootfs; the old root is detached via `umount2(MNT_DETACH)` and `rmdir` (`mounts.rs:165-168`). Landlock additionally denies reads outside the allowed paths. |
| Submitted code reads `/proc` to learn about host processes | A new PID namespace isolates the process tree. `/proc` is remounted inside the new PID ns, showing only the sandbox's own processes (`mounts.rs:172-179`). |
| Submitted code reads other submissions' data | Each submission gets its own tmpfs. There are no shared writable mounts between submissions. User namespace isolation means UID 0 inside the sandbox is an unprivileged host UID. |
| Submitted code probes the network for internal services | A new NET namespace is created with only loopback (`exec.rs:53-59`, `mounts.rs:44-74`). No veth pair is configured, so external network access is impossible. |
| Stdout/stderr overflow leaks memory | Output is read with a per-fd size cap (`read_capped` in `exec.rs:391-417`). Excess output is drained without buffering. |

### Denial of Service

| Threat | Mitigation |
|--------|-----------|
| Fork bomb / thread bomb | `pids.max` cgroup knob limits total PIDs in the cgroup (`cgroup.rs:54`). |
| Memory exhaustion | `memory.max` cgroup knob (in bytes); `memory.swap.max` set to 0 to deny swap (`cgroup.rs:30-39`). OOM kills are detected via `memory.events` (`cgroup.rs:72-84`). |
| CPU exhaustion | `cpu.max` cgroup knob limits to 100% of one CPU per 100 ms period (`cgroup.rs:47-51`). Wall-clock timeout enforced by the parent; on expiry, `cgroup.kill` atomically SIGKILLs all processes in the cgroup (`exec.rs:430-435`, `cgroup.rs:68-70`). |
| Disk exhaustion | `/box` tmpfs capped at 32 MB, `/tmp` tmpfs capped at 64 MB (`exec.rs:41-42`). Both count against the cgroup memory limit. No access to the host filesystem for writes. |
| io_uring bypass of cgroup CPU/IO accounting | `io_uring_setup`, `io_uring_enter`, `io_uring_register` blocked by seccomp (`seccomp.rs:39-41`). |

### Elevation of Privilege

| Threat | Mitigation |
|--------|-----------|
| Regain capabilities after exec | All 5 capability sets (effective, permitted, inheritable, bounding, ambient) cleared before exec (`exec.rs:322-330`). `PR_SET_NO_NEW_PRIVS` set, preventing setuid binaries from granting capabilities (`exec.rs:241-242`). |
| Create nested user namespace | `unshare` blocked by seccomp (`seccomp.rs:52`). `CLONE_NEWUSER` via `clone` is filtered (noted for Phase 2.5 argument inspection). |
| Load kernel module | `init_module`, `finit_module`, `delete_module` blocked by seccomp (`seccomp.rs:60-62`). |
| BPF JIT spray / Spectre gadget | `bpf` syscall blocked by seccomp (`seccomp.rs:43`). |
| ptrace another process | `ptrace` blocked by seccomp (`seccomp.rs:45`). PID namespace prevents seeing processes outside the sandbox anyway. |
| userfaultfd exploitation | `userfaultfd` blocked by seccomp (`seccomp.rs:44`). |
| Kernel keyring manipulation | `keyctl`, `add_key`, `request_key` blocked by seccomp (`seccomp.rs:48`, `seccomp.rs:55-56`). |
| Host reboot / kexec | `reboot`, `kexec_load`, `kexec_file_load` blocked by seccomp (`seccomp.rs:53-55`). |


## 4. Defense-in-Depth Layers

Each layer is independently enforced by the kernel. Disabling one layer does not
compromise the others.

### Layer 1: User Namespace

- **What it blocks**: Maps in-sandbox UID 0 to an unprivileged host UID. Prevents
  the child from exercising any host-level privilege even if it believes it is root.
  `CAP_CHOWN` inside the namespace only applies to mapped UIDs (single-UID map: `0 <host_uid> 1`).
- **Syscall**: `unshare(CLONE_NEWUSER)` in the child; parent writes `/proc/<pid>/uid_map`,
  `/proc/<pid>/gid_map`, and `/proc/<pid>/setgroups` (deny).
- **Source**: `crates/zerocode-sandbox/src/native/userns.rs`

### Layer 2: PID Namespace

- **What it blocks**: The sandbox sees only its own process tree. PID 1 inside
  the namespace is the sandbox init. Cannot signal or ptrace host processes.
  `/proc` is remounted scoped to the new PID ns.
- **Syscall**: `unshare(CLONE_NEWPID)`
- **Source**: `exec.rs:54`, `mounts.rs:172-179`

### Layer 3: NET Namespace

- **What it blocks**: The sandbox has an empty network stack with only loopback
  brought up. No veth pair, no external connectivity. Prevents reaching internal
  services (Postgres, API, metadata endpoints).
- **Syscall**: `unshare(CLONE_NEWNET)`, `SIOCSIFFLAGS` ioctl to bring up `lo`.
- **Source**: `exec.rs:56`, `mounts.rs:44-74`

### Layer 4: IPC Namespace

- **What it blocks**: Isolates System V IPC objects (shared memory segments,
  semaphores, message queues) and POSIX message queues. Prevents cross-submission
  IPC.
- **Syscall**: `unshare(CLONE_NEWIPC)`
- **Source**: `exec.rs:55`

### Layer 5: UTS Namespace

- **What it blocks**: Isolates hostname/domainname. Prevents the sandbox from
  changing the host's hostname or detecting the real hostname.
- **Syscall**: `unshare(CLONE_NEWUTS)`
- **Source**: `exec.rs:57`

### Layer 6: Mount Namespace + pivot_root

- **What it blocks**: Provides a completely separate mount tree. `pivot_root`
  swaps the root to the runner rootfs; the old root is lazy-unmounted and its
  mount point removed. After this, no host paths are reachable from the sandbox
  filesystem hierarchy.
- **Syscall**: `unshare(CLONE_NEWNS)`, `mount(MS_PRIVATE | MS_REC)`,
  `mount(MS_BIND | MS_REC)`, `mount("tmpfs")`, `pivot_root()`, `umount2(MNT_DETACH)`.
- **Source**: `crates/zerocode-sandbox/src/native/mounts.rs`

### Layer 7: Cgroup v2

- **What it blocks**: Enforces memory ceiling (`memory.max`), swap denial
  (`memory.swap.max = 0`), CPU bandwidth (`cpu.max`), PID count (`pids.max`),
  and provides atomic kill (`cgroup.kill`).
- **Kernel feature**: Cgroup v2 unified hierarchy; `cgroup.kill` requires kernel >= 5.14.
- **Source**: `crates/zerocode-sandbox/src/native/cgroup.rs`

### Layer 8: Landlock

- **What it blocks**: Filesystem access outside the allowed set, resolved at the
  target inode -- not at the symlink path. This is an allowlist: `/usr`, `/lib`,
  `/lib64`, `/bin`, `/sbin`, `/etc` are read-only; `/box` and `/tmp` are
  read-write; everything else is denied.
- **Kernel feature**: Landlock LSM, ABI v1.
- **Source**: `crates/zerocode-sandbox/src/native/landlock_policy.rs`

### Layer 9: Seccomp BPF

- **What it blocks**: Dangerous syscalls return `EPERM`. The deny list covers:
  `io_uring_*`, `bpf`, `userfaultfd`, `ptrace`, `unshare`, `keyctl`, `mount`,
  `umount2`, `pivot_root`, `setns`, `reboot`, `kexec_*`, `add_key`, `request_key`,
  `swapon`, `swapoff`, `init_module`, `finit_module`, `delete_module`.
- **Kernel feature**: `seccomp(SECCOMP_SET_MODE_FILTER)`. Requires `PR_SET_NO_NEW_PRIVS`
  to be set first for unprivileged loading.
- **Source**: `crates/zerocode-sandbox/src/native/seccomp.rs`

### Layer 10: Capability Drop

- **What it blocks**: All 5 capability sets (effective, permitted, inheritable,
  bounding, ambient) are cleared. Even if some other layer fails, the process
  has zero capabilities.
- **Syscall**: `caps::clear()` on all sets.
- **Source**: `exec.rs:322-330`

### Layer 11: PR_SET_NO_NEW_PRIVS

- **What it blocks**: Prevents gaining new privileges through `execve` of setuid/
  setgid binaries or files with capabilities in their extended attributes.
  Inherited across `fork` and `exec`.
- **Syscall**: `prctl(PR_SET_NO_NEW_PRIVS, 1)`
- **Source**: `exec.rs:241-242`


## 5. Known Limitations

Gaps acknowledged in the current implementation. Each represents a hardening
opportunity, tracked in [`ROADMAP.md`](ROADMAP.md) where work is planned.

1. **No RLIMIT_FSIZE / RLIMIT_NOFILE enforcement**. File size and open file
   descriptor counts are bounded only indirectly by the tmpfs size limit and
   cgroup memory ceiling. A process can open many small files up to the kernel
   default `RLIMIT_NOFILE` (typically 1024). Adding `setrlimit` calls before
   exec would close this gap.

2. **No /dev restrictions beyond landlock**. After `pivot_root`, the runner
   rootfs may contain device nodes in `/dev`. Landlock ABI v1 does not restrict
   device access. The tmpfs mounts use `MS_NODEV`, but `/dev` in the runner
   rootfs is inherited from the bind-mount. Mounting a minimal devtmpfs or
   bind-mounting only `/dev/null`, `/dev/zero`, `/dev/urandom` would harden this.

3. **No application-layer authentication.** ZeroCode is configured as an
   open, unauthenticated backend — every `/v1/*` route is reachable by
   anyone who can connect to the API port. Access control is the operator's
   responsibility (private subnet, firewall, reverse proxy with auth, VPN,
   service-mesh policy). The only in-app guard is the per-IP
   `tower_governor` rate limit.

4. **No TLS termination**. The API server binds plaintext HTTP (`0.0.0.0:8080`
   in `docker-compose.yml`). TLS must be terminated by a reverse proxy (nginx,
   Caddy, cloud load balancer) when traffic crosses an untrusted network.

5. **Seccomp is deny-list, not allow-list**. The filter defaults to
   `ScmpAction::Allow` and subtracts specific dangerous syscalls (`seccomp.rs:31`).
   A novel dangerous syscall added in a future kernel version would be allowed
   until explicitly added to the deny list. An allowlist approach would be
   stronger but requires careful enumeration per language runtime.

6. **No Firecracker / gVisor isolation tier**. All sandbox isolation is
   provided by Linux namespaces, cgroups, landlock, and seccomp in a shared
   kernel. A kernel vulnerability in an allowed syscall could bypass all layers
   simultaneously. A microVM (Firecracker) or user-space kernel (gVisor) tier
   would add a hardware/process-level boundary.

7. **No Landlock network restrictions**. Landlock ABI v1 covers only filesystem
   access. Network restrictions via Landlock require ABI v4+ (kernel >= 6.7).
   Currently, network isolation relies entirely on the NET namespace (no external
   connectivity).

8. **CLONE_NEWUSER argument filtering not yet active**. The seccomp filter
   blocks the `unshare` syscall entirely, but `clone` with `CLONE_NEWUSER` flag
   argument inspection is deferred to a follow-up hardening pass (`seccomp.rs:47`).


## 6. CVE Analysis: Judge0 2024 Vulnerabilities

### CVE-2024-28185: Symlink-based sandbox escape via `/box`

**Judge0 vulnerability**: The sandbox did not restrict symlinks in the submission
directory. An attacker could create a symlink inside `/box` pointing to an
arbitrary host path (e.g., `/etc/shadow`), and subsequent read/write operations
followed the symlink to the host filesystem.

**ZeroCode mitigation**: Three independent layers prevent this:
- **pivot_root** (`mounts.rs:154`): After `pivot_root`, the host filesystem is
  detached. There is no host path reachable from within the sandbox to symlink to.
- **Landlock** (`landlock_policy.rs`): Landlock resolves access checks at the
  inode level of the target path, not the link. Even if a symlink existed, the
  kernel would deny I/O at the target because it falls outside the allowed path
  set.
- **Per-submission tmpfs** (`mounts.rs:112-123`): `/box` is a fresh tmpfs
  mounted with `MS_NOSUID | MS_NODEV`. Source and stdin are copied (not
  bind-mounted) into it. No pre-existing symlinks can exist.

### CVE-2024-28189: chown-based sandbox escape

**Judge0 vulnerability**: The sandbox allowed `chown` operations that changed
file ownership to arbitrary UIDs, enabling privilege escalation by making files
owned by root accessible.

**ZeroCode mitigation**:
- **User namespace** (`userns.rs`): The single-UID map (`0 <host_uid> 1`) means
  `chown` inside the sandbox can only target UID 0 within the namespace, which
  maps to the worker's unprivileged host UID. There are no other mapped UIDs to
  escalate to.
- **Capability drop** (`exec.rs:322-330`): All capabilities, including
  `CAP_CHOWN`, are dropped before exec.
- **setgroups deny** (`userns.rs:32`): `/proc/<pid>/setgroups` is set to `deny`,
  preventing supplementary group manipulation.

### CVE-2024-29021: Network access to internal services (SSRF)

**Judge0 vulnerability**: Sandboxed code could reach internal services on the
Docker network (including the database), enabling SQL injection, metadata
service access, and data exfiltration via SSRF.

**ZeroCode mitigation**:
- **NET namespace** (`exec.rs:58`): The sandbox is created with
  `CLONE_NEWNET`, giving it an empty network stack. Only the loopback interface
  is brought up (`mounts.rs:44-74`). No veth pair or bridge is configured.
- **No DNS, no routes**: Without a default route or DNS resolver, the sandbox
  cannot resolve or reach any host, including Postgres, the API server, or
  cloud metadata endpoints (169.254.169.254).
- **Structural impossibility**: This is not a firewall rule that could be
  misconfigured -- the network namespace contains no interfaces connected to
  any external network. The only IP reachable is 127.0.0.1 within the sandbox's
  own namespace.


## 7. Host Requirements

| Requirement | Minimum | Used by |
|------------|---------|---------|
| Linux kernel | >= 5.14 | `cgroup.kill` (`cgroup.rs:68`), unified cgroup v2 |
| Cgroup v2 | Unified hierarchy mounted at `/sys/fs/cgroup` | `cgroup.rs` -- direct writes to `memory.max`, `cpu.max`, `pids.max`, `cgroup.procs`, `cgroup.kill` |
| Landlock LSM | ABI >= v1 (kernel >= 5.13) | `landlock_policy.rs` -- filesystem access control |
| Seccomp BPF | `CONFIG_SECCOMP_FILTER=y` | `seccomp.rs` -- syscall filtering via `libseccomp` |
| User namespaces | `kernel.unprivileged_userns_clone = 1` (on distros that gate this) | `userns.rs`, `exec.rs` -- `unshare(CLONE_NEWUSER)` from unprivileged worker |
| `/proc/<pid>/uid_map` writable | Standard on all kernels with user namespace support | `userns.rs:38` |
| `memory.peak` (optional) | kernel >= 5.19 | `cgroup.rs:89` -- peak memory reporting; graceful fallback to 0 |
| Architecture | x86_64 or aarch64 | `seccomp.rs:36` -- `ScmpArch::native()` |

**Docker-specific** (when deploying via `deploy/docker-compose.yml`):
- Worker container requires `CAP_SYS_ADMIN` for `unshare`/`mount`/`pivot_root`.
- Worker mounts `/sys/fs/cgroup:rw` from the host.
- Worker uses `cgroup: private` for an isolated cgroup subtree.
- API container runs with `cap_drop: ALL`, `read_only: true`, and `no-new-privileges`.
