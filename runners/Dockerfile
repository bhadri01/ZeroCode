# syntax=docker/dockerfile:1.7
#
# The "runner" image holds the language toolchains. The worker bind-mounts an
# extracted copy of this image's filesystem as the read-only rootfs every
# sandboxed submission lives inside.
#
# Build with:
#   docker build -f runners/Dockerfile -t zerocode-runner:dev runners/
#
# Languages currently bundled:
#   - Python 3.13            (Debian trixie nodejs)
#   - Node.js 22 LTS         (Debian trixie nodejs)
#   - C   (gcc-14)           (Debian trixie gcc-14)
#   - C++ (g++-14)           (Debian trixie g++-14)
#   - Go  (latest stable)    (official go.dev tarball)
#   - Rust (latest stable)   (rustup-init.sh)

FROM debian:trixie-slim

# ---- base + apt-installable toolchains ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils locales tar \
        # interpreted runtimes
        python3.13 python3.13-dev \
        nodejs \
        # C / C++ via Debian's gcc-14 default
        gcc-14 g++-14 libc6-dev libstdc++-14-dev \
        # required by the Go + Rust installs below
        && rm -rf /var/lib/apt/lists/* \
    && sed -i '/^# C.UTF-8/s/^# //' /etc/locale.gen 2>/dev/null || true \
    && update-locale LANG=C.UTF-8 LC_ALL=C.UTF-8

# /usr/bin/node fallback in case Debian only ships /usr/bin/nodejs.
RUN if [ ! -e /usr/bin/node ] && [ -e /usr/bin/nodejs ]; then \
        ln -sf /usr/bin/nodejs /usr/bin/node; \
    fi

# ---- Go (latest stable from go.dev) ----
# Pinning the major+minor inside the URL lets ops upgrade by editing one
# place; we don't yet vendor a checksum because /usr/local/go is read-only
# inside the sandbox anyway. Reassess before public release.
ARG GO_VERSION=1.23.4
RUN ARCH=$(dpkg --print-architecture | sed 's/amd64/amd64/; s/arm64/arm64/') \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz \
    && /usr/local/go/bin/go version

# ---- Rust (latest stable via rustup) ----
# RUSTUP_HOME + CARGO_HOME under /usr/local means the toolchain lives where
# every submission can find it after pivot_root. CARGO_HOME/bin holds the
# rustc symlink referenced by runners/languages.toml.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin
RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh \
    && chmod +x /tmp/rustup-init.sh \
    && /tmp/rustup-init.sh -y --default-toolchain stable --no-modify-path --profile minimal \
    && rm /tmp/rustup-init.sh \
    && /usr/local/cargo/bin/rustc --version \
    && chmod -R a+rX "$RUSTUP_HOME" "$CARGO_HOME"

# Create the directory tree the sandbox uses inside the runner rootfs.
RUN mkdir -p /box /tmp && \
    chmod 1777 /tmp && \
    chmod 0700 /box

# The runner image is the rootfs; it doesn't run as a container itself.
# Provide a trivial CMD so `docker run` returns immediately if someone tries.
CMD ["/bin/true"]
