# syntax=docker/dockerfile:1.7
#
# The "runner" image holds the language toolchains. The worker bind-mounts an
# extracted copy of this image's filesystem as the read-only rootfs every
# sandboxed submission lives inside.
#
# Phase 0: only Python is installed (used by Phase 1.5's smoke test). Phases
# 3a-c and v1.5 progressively add the remaining toolchains.
#
# Build with:
#   docker build -f runners/Dockerfile -t zerocode-runner:dev runners/

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates locales \
        python3.13 python3.13-dev \
        && \
    rm -rf /var/lib/apt/lists/* && \
    sed -i '/^# C.UTF-8/s/^# //' /etc/locale.gen 2>/dev/null || true && \
    update-locale LANG=C.UTF-8 LC_ALL=C.UTF-8

# Create the directory tree the sandbox uses inside the runner rootfs.
RUN mkdir -p /box /tmp && \
    chmod 1777 /tmp && \
    chmod 0700 /box

# The runner image is the rootfs; it doesn't run as a container itself.
# Provide a trivial CMD so `docker run` returns immediately if someone tries.
CMD ["/bin/true"]
