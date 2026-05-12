# syntax=docker/dockerfile:1.7
#
# The "runner" image holds the language toolchains. The worker bind-mounts an
# extracted copy of this image's filesystem as the read-only rootfs every
# sandboxed submission lives inside.
#
# Build with:
#   docker build -f runners/Dockerfile -t zerocode-runner:dev runners/

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates locales \
        # Phase 1.5 — Python
        python3.13 python3.13-dev \
        # Phase 3a — Node.js (Debian trixie ships nodejs 22.x LTS)
        nodejs \
        && \
    rm -rf /var/lib/apt/lists/* && \
    sed -i '/^# C.UTF-8/s/^# //' /etc/locale.gen 2>/dev/null || true && \
    update-locale LANG=C.UTF-8 LC_ALL=C.UTF-8

# Symlink so `/usr/bin/node` always resolves to the installed runtime even if
# Debian decides to rename binaries down the line.
RUN if [ ! -e /usr/bin/node ] && [ -e /usr/bin/nodejs ]; then \
        ln -sf /usr/bin/nodejs /usr/bin/node; \
    fi

# Create the directory tree the sandbox uses inside the runner rootfs.
RUN mkdir -p /box /tmp && \
    chmod 1777 /tmp && \
    chmod 0700 /box

# The runner image is the rootfs; it doesn't run as a container itself.
# Provide a trivial CMD so `docker run` returns immediately if someone tries.
CMD ["/bin/true"]
