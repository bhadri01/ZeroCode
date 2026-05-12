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
#   Core 7 (v1):
#   - Python 3.13            (Debian trixie python3.13)
#   - Node.js 22 LTS         (Debian trixie nodejs)
#   - C   (gcc-14)           (Debian trixie gcc-14)
#   - C++ (g++-14)           (Debian trixie g++-14)
#   - Go  (latest stable)    (official go.dev tarball)
#   - Rust (latest stable)   (rustup-init.sh)
#   - Java 21 LTS            (Debian trixie openjdk-21-jdk-headless)
#
#   v1.5 Batch A — interpreted:
#   - Bash 5.x               (Debian trixie bash — already present)
#   - Lua 5.4                (Debian trixie lua5.4)
#   - Perl 5.x               (Debian trixie perl — already present)
#   - Ruby 3.x               (Debian trixie ruby)
#   - R 4.x                  (Debian trixie r-base)
#   - PHP 8.x                (Debian trixie php-cli)
#   - TypeScript (tsx)        (npm global install)
#
#   v1.5 Batch B — compiled (GCC family):
#   - Fortran (gfortran-14)  (Debian trixie gfortran-14)
#   - Pascal (fpc)           (Debian trixie fp-compiler)
#   - D (ldc2)               (Debian trixie ldc)
#   - Objective-C (clang)    (Debian trixie clang libobjc-14-dev)
#   - Assembly (nasm + ld)   (Debian trixie nasm binutils)
#   - Ada (gnat-14)          (Debian trixie gnat-14)
#
#   v1.5 Batch C — JVM:
#   - Kotlin                 (SDKMAN or Debian)
#   - Scala 3                (SDKMAN or Debian)
#   - Groovy                 (Debian trixie groovy)
#   - Clojure                (Debian trixie clojure)
#
#   v1.5 Batch D — Functional:
#   - Haskell (GHC)          (Debian trixie ghc)
#   - OCaml                  (Debian trixie ocaml ocaml-findlib)
#   - Erlang                 (Debian trixie erlang-base)
#   - Elixir                 (Debian trixie elixir)
#   - Common Lisp (SBCL)     (Debian trixie sbcl)
#
#   v1.5 Batch E — .NET:
#   - C# / F# (.NET 9)      (Microsoft dotnet-sdk-9.0)
#
#   v1.5 Batch F — Niche:
#   - COBOL (GnuCOBOL)       (Debian trixie gnucobol)
#   - Prolog (SWI-Prolog)    (Debian trixie swi-prolog)
#   - Swift 6                (swift.org tarball)
#   - Octave 9               (Debian trixie octave)
#   - SQL (sqlite3)          (Debian trixie sqlite3)
#
#   v1.5 Batch G — Modern:
#   - Zig                    (ziglang.org tarball)
#   - Nim                    (Debian trixie nim or choosenim)
#   - Crystal                (Debian trixie crystal)
#   - Dart                   (dart.dev SDK)
#   - Julia                  (julialang.org tarball)

FROM debian:trixie-slim

# ---- base + apt-installable toolchains ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils locales tar gnupg \
        # Core 7: interpreted runtimes
        python3.13 python3.13-dev \
        nodejs npm \
        # Core 7: C / C++ via Debian's gcc-14 default
        gcc-14 g++-14 libc6-dev libstdc++-14-dev \
        # Core 7: Java 21 LTS (headless — no GUI deps)
        openjdk-21-jdk-headless \
        # Batch A: interpreted (bash + perl already in base)
        lua5.4 \
        ruby \
        r-base-core \
        php-cli \
        # Batch B: compiled (GCC family)
        gfortran-14 \
        fp-compiler \
        ldc \
        clang libobjc-14-dev \
        nasm binutils \
        gnat-14 \
        # Batch C: JVM family
        groovy \
        clojure \
        # Batch D: functional / ML
        ghc \
        ocaml ocaml-findlib \
        erlang-base erlang-dev \
        elixir \
        sbcl \
        # Batch E: .NET (SDK installed separately below)
        # Batch F: niche
        gnucobol4 libcob4-dev \
        swi-prolog \
        octave \
        sqlite3 \
        # Batch G: modern (some installed separately below)
        nim \
        crystal \
        && rm -rf /var/lib/apt/lists/* \
    && sed -i '/^# C.UTF-8/s/^# //' /etc/locale.gen 2>/dev/null || true \
    && update-locale LANG=C.UTF-8 LC_ALL=C.UTF-8

# /usr/bin/node fallback in case Debian only ships /usr/bin/nodejs.
RUN if [ ! -e /usr/bin/node ] && [ -e /usr/bin/nodejs ]; then \
        ln -sf /usr/bin/nodejs /usr/bin/node; \
    fi

# ---- TypeScript (tsx — Node-based TS runner, globally installed) ----
RUN npm install -g tsx && npm cache clean --force

# ---- Kotlin (latest stable from GitHub releases) ----
ARG KOTLIN_VERSION=2.1.0
RUN curl -fsSL "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" -o /tmp/kotlin.zip \
    && mkdir -p /usr/local/kotlin && cd /usr/local/kotlin && unzip -q /tmp/kotlin.zip \
    && ln -sf /usr/local/kotlin/kotlinc/bin/kotlinc /usr/bin/kotlinc \
    && rm /tmp/kotlin.zip

# ---- Scala 3 (from GitHub releases) ----
ARG SCALA_VERSION=3.5.2
RUN curl -fsSL "https://github.com/scala/scala3/releases/download/${SCALA_VERSION}/scala3-${SCALA_VERSION}.tar.gz" -o /tmp/scala.tar.gz \
    && tar -C /usr/local -xzf /tmp/scala.tar.gz \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scalac /usr/bin/scalac \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scala /usr/bin/scala \
    && rm /tmp/scala.tar.gz

# ---- .NET 9 SDK (Microsoft packages) ----
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 9.0 --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm /tmp/dotnet-install.sh \
    && dotnet --version

# ---- Swift (from swift.org) ----
ARG SWIFT_VERSION=6.0.3
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then SWIFT_ARCH="x86_64"; else SWIFT_ARCH="aarch64"; fi \
    && curl -fsSL "https://download.swift.org/swift-${SWIFT_VERSION}-release/debian12/${SWIFT_ARCH}/swift-${SWIFT_VERSION}-RELEASE-debian12-${SWIFT_ARCH}.tar.gz" -o /tmp/swift.tar.gz \
    && tar -C /usr/local -xzf /tmp/swift.tar.gz --strip-components=2 \
    && rm /tmp/swift.tar.gz \
    && swiftc --version || true

# ---- Zig (from ziglang.org) ----
ARG ZIG_VERSION=0.13.0
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then ZIG_ARCH="x86_64"; else ZIG_ARCH="aarch64"; fi \
    && curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-linux-${ZIG_ARCH}-${ZIG_VERSION}.tar.xz" -o /tmp/zig.tar.xz \
    && tar -C /usr/local -xJf /tmp/zig.tar.xz \
    && ln -sf /usr/local/zig-linux-${ZIG_ARCH}-${ZIG_VERSION}/zig /usr/local/bin/zig \
    && rm /tmp/zig.tar.xz \
    && zig version

# ---- Dart SDK (from dart.dev) ----
ARG DART_VERSION=3.6.0
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then DART_ARCH="x64"; else DART_ARCH="arm64"; fi \
    && curl -fsSL "https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_VERSION}/sdk/dartsdk-linux-${DART_ARCH}-release.zip" -o /tmp/dart.zip \
    && mkdir -p /usr/lib/dart && cd /usr/lib && unzip -q /tmp/dart.zip \
    && ln -sf /usr/lib/dart-sdk/bin/dart /usr/bin/dart \
    && rm /tmp/dart.zip

# ---- Julia (from julialang.org) ----
ARG JULIA_VERSION=1.11.2
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then JULIA_ARCH="x86_64"; else JULIA_ARCH="aarch64"; fi \
    && curl -fsSL "https://julialang-s3.julialang.org/bin/linux/${JULIA_ARCH%_*}64/${JULIA_VERSION%.*}/julia-${JULIA_VERSION}-linux-${JULIA_ARCH}.tar.gz" -o /tmp/julia.tar.gz \
    && tar -C /usr/local -xzf /tmp/julia.tar.gz \
    && ln -sf /usr/local/julia-${JULIA_VERSION}/bin/julia /usr/local/bin/julia \
    && rm /tmp/julia.tar.gz \
    && julia --version

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
