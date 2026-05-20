#!/bin/sh
# Runtime setup for the NativeSandbox, done here because it can only happen
# once the container's cgroup + filesystems are mounted:
#
#   1. Create the per-submission scratch dir (NativeSandboxConfig.scratch_dir).
#   2. Create the cgroup parent the sandbox creates per-job sub-cgroups under
#      (NativeSandboxConfig.cgroup_parent) and delegate the cpu/memory/pids
#      controllers down to it.
#
# Requires `cgroup: private` (so /sys/fs/cgroup is the container's *namespaced*
# cgroup root — operations stay inside our delegated scope under nsdelegate)
# and CAP_SYS_ADMIN (to remount cgroupfs rw and create cgroups). Do NOT also
# bind-mount the host /sys/fs/cgroup: that exposes the host root cgroup, which
# nsdelegate forbids us from modifying.
#
# All cgroup steps are best-effort: the worker still boots if a controller
# isn't delegated, and the preflight + per-job cgroup writes surface the gap in
# the logs rather than crash-looping the container here.
set -u

SCRATCH_DIR="${ZEROCODE_SCRATCH_DIR:-/run/zerocode-sandbox}"
CGROUP_PARENT="${ZEROCODE_CGROUP_PARENT:-/sys/fs/cgroup/zerocode}"
CG_ROOT="/sys/fs/cgroup"

mkdir -p "$SCRATCH_DIR"

# Docker mounts /sys/fs/cgroup read-only by default; we own this namespaced
# tree, so remount it read-write.
mount -o remount,rw "$CG_ROOT" 2>/dev/null \
  || echo "worker-entrypoint: WARNING could not remount $CG_ROOT rw" >&2

if mkdir -p "$CG_ROOT/worker" 2>/dev/null; then
  # cgroup v2 "no internal processes" rule: a cgroup may not hold member
  # processes once it delegates controllers to children. We (PID 1) currently
  # live in the namespace-root cgroup, so move into a leaf first.
  echo $$ > "$CG_ROOT/worker/cgroup.procs" 2>/dev/null \
    || echo "worker-entrypoint: WARNING could not move self into $CG_ROOT/worker" >&2

  # Make the controllers the sandbox needs available to the root's children,
  # one at a time so a single missing controller doesn't block the rest.
  for c in cpu memory pids; do
    echo "+$c" > "$CG_ROOT/cgroup.subtree_control" 2>/dev/null || true
  done

  # The parent the sandbox creates `<parent>/<ulid>` cgroups under, plus the
  # same controllers enabled for *its* children (where memory.max/cpu.max/
  # pids.max actually get written).
  mkdir -p "$CGROUP_PARENT" 2>/dev/null || true
  for c in cpu memory pids; do
    echo "+$c" > "$CGROUP_PARENT/cgroup.subtree_control" 2>/dev/null || true
  done

  echo "worker-entrypoint: cgroup ready parent=$CGROUP_PARENT" \
       "root.controllers=[$(cat "$CG_ROOT/cgroup.controllers" 2>/dev/null)]" \
       "parent.controllers=[$(cat "$CGROUP_PARENT/cgroup.controllers" 2>/dev/null)]"
else
  echo "worker-entrypoint: WARNING cannot create cgroups under $CG_ROOT" \
       "(need 'cgroup: private' + CAP_SYS_ADMIN, and NO host /sys/fs/cgroup bind-mount)." \
       "Native per-job cgroup limits will fail until this is fixed." >&2
fi

exec /usr/local/bin/zerocode-worker "$@"
