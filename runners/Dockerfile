# syntax=docker/dockerfile:1.7
#
# The "runner" image holds the language toolchains. The worker bind-mounts an
# extracted copy of this image's filesystem as the read-only rootfs every
# sandboxed submission lives inside.
#
# Build with:
#   docker build -f runners/Dockerfile -t zerocode-runner:dev runners/
#
# *** POPULAR LANGUAGE SET (20 languages) ***
# Trimmed from the v1.5 catalogue of 60 to the most-requested / popular tier.
# Source of truth for the list and IDs is runners/languages.toml; this image
# must provide every toolchain that file's compile_cmd/run_cmd reference. For
# slim, per-language images covering only the Core 7, see runners/Dockerfile.slim.
#
#   Core      : Python 3.13, Node.js 22, C/C++ (gcc/g++-14), Go, Rust, Java 21
#   Scripting : Bash, Lua, Perl, Ruby, R, PHP, TypeScript (tsx), SQL (sqlite3)
#   JVM       : Kotlin, Scala 3   (upstream tarballs)
#   .NET      : C#   (.NET 9 SDK, Roslyn-direct compile)
#   Native    : Swift, Dart   (upstream tarballs)
#
# The 40 niche/functional/esoteric languages from the old full image (Fortran,
# Pascal, D, Obj-C, Assembly, Ada, Groovy, Clojure, Haskell, OCaml, Erlang,
# Elixir, Common Lisp, F#, COBOL, Prolog, Octave, Nim, Crystal, Julia, Racket,
# Raku, AWK, CoffeeScript, Forth, Emacs Lisp, Verilog, LLVM IR, V, FreeBASIC,
# PowerShell, Pony, and the code-golf tier) were removed — see git history /
# runners/languages.toml.bak60 to restore any of them.

FROM debian:trixie-slim

# apt toolchains are split into per-batch layers (instead of one giant install)
# so each batch caches independently and any package that drifts in/out of
# Debian testing fails in isolation — the error names ≤7 packages, not 40, and
# every batch before it stays cached. bash + perl ship in the base image; unzip
# is needed to unpack the Kotlin/Dart archives below.

# ---- base utilities + Core ----
# gcc/g++ (unversioned, alternatives → gcc-14) give a generic `cc` for linking;
# C/C++/Rust use the versioned gcc-14 directly.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils unzip locales tar gnupg \
        python3.13 python3.13-dev \
        nodejs npm \
        gcc gcc-14 g++ g++-14 libc6-dev libstdc++-14-dev \
        openjdk-21-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# C.UTF-8 is built into glibc — no locale-gen / update-locale needed (the latter
# lives in /usr/sbin and isn't on the build PATH). Set it as the default locale.
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# ---- Scripting — interpreted (bash + perl already in base) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        lua5.4 ruby r-base-core php-cli \
    && rm -rf /var/lib/apt/lists/*

# ---- SQL (id 154) — sqlite3 CLI ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# /usr/bin/node fallback in case Debian only ships /usr/bin/nodejs.
RUN if [ ! -e /usr/bin/node ] && [ -e /usr/bin/nodejs ]; then \
        ln -sf /usr/bin/nodejs /usr/bin/node; \
    fi

# ---- TypeScript (tsx — Node-based TS runner, installed globally) ----
# Lands at /usr/local/bin/tsx, which the id=106 run_cmd references directly.
RUN npm install -g tsx && npm cache clean --force

# ---- Go (latest stable from go.dev) ----
ARG GO_VERSION=1.23.4
RUN ARCH=$(dpkg --print-architecture | sed 's/amd64/amd64/; s/arm64/arm64/') \
    && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz \
    && /usr/local/go/bin/go version

# ---- Rust (latest stable via rustup) ----
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin
RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh \
    && chmod +x /tmp/rustup-init.sh \
    && /tmp/rustup-init.sh -y --default-toolchain stable --no-modify-path --profile minimal \
    && rm /tmp/rustup-init.sh \
    && /usr/local/cargo/bin/rustc --version \
    && chmod -R a+rX "$RUSTUP_HOME" "$CARGO_HOME"

# ---- Java: prebuilt CDS archive for javac ----
# javac's JVM startup dominates Java submission latency. A dynamic CDS archive
# of the compiler's classes nearly halves javac startup (~640 ms -> ~340 ms
# under 1 CPU). Stored under /usr/local/lib (landlock-readable inside the
# sandbox) and referenced from runners/languages.toml's Java compile_cmd via
# `-XX:SharedArchiveFile`. Regenerated automatically whenever the JDK layer
# above changes. A version mismatch degrades gracefully (JVM ignores it).
RUN mkdir -p /usr/local/lib/zerocode \
    && printf 'public class Probe{public static void main(String[] a){}}' > /tmp/Probe.java \
    && java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 \
         -XX:ArchiveClassesAtExit=/usr/local/lib/zerocode/javac.jsa \
         -m jdk.compiler/com.sun.tools.javac.Main /tmp/Probe.java \
    && rm -f /tmp/Probe.java /tmp/Probe.class \
    && chmod -R a+rX /usr/local/lib/zerocode

# =====================================================================
# Upstream-tarball toolchains (no Debian package, or we want a pinned
# version). Each lands under /usr/local or /usr/share (landlock-readable
# inside the sandbox) with a /usr/bin or /usr/local/bin entrypoint that the
# matching runners/languages.toml entry references.
# =====================================================================

# ---- Kotlin (id 120) ----
ARG KOTLIN_VERSION=2.1.0
RUN curl -fsSL "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" -o /tmp/kotlin.zip \
    && mkdir -p /usr/local/kotlin && cd /usr/local/kotlin && unzip -q /tmp/kotlin.zip \
    && ln -sf /usr/local/kotlin/kotlinc/bin/kotlinc /usr/bin/kotlinc \
    && rm /tmp/kotlin.zip

# ---- Scala 3 (id 121) ----
ARG SCALA_VERSION=3.5.2
RUN curl -fsSL "https://github.com/scala/scala3/releases/download/${SCALA_VERSION}/scala3-${SCALA_VERSION}.tar.gz" -o /tmp/scala.tar.gz \
    && tar -C /usr/local -xzf /tmp/scala.tar.gz \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scalac /usr/bin/scalac \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scala /usr/bin/scala \
    && rm /tmp/scala.tar.gz

# ---- .NET 9 SDK (id 140, C#) ----
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 9.0 --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm /tmp/dotnet-install.sh \
    && dotnet --version

# C# (id 140) compiles with Roslyn (csc) directly against the SDK's reference
# pack (see csharp-build.sh) — it never touches NuGet, so no offline package
# warmup is needed (that was only for the now-removed F#). The NUGET_PACKAGES
# env is still set + the dir created so csc's env is well-formed.
ENV NUGET_PACKAGES=/usr/local/lib/zerocode/nuget \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
RUN mkdir -p /usr/local/lib/zerocode/nuget \
    && chmod -R a+rX /usr/local/lib/zerocode

# ---- Swift (id 152) ----
# swift.org's debian12 build (Swift isn't packaged for trixie). The download
# URL layout differs by arch: x86_64 has NO arch suffix and lives under the
# bare `debian12/` dir; aarch64 uses a `debian12-aarch64/` dir + `-aarch64`
# suffix. Both nest under a `swift-<ver>-RELEASE/` segment. Runtime libs come
# from apt. `swiftc --version` is NOT masked — a bad URL/dep fails the build
# loudly. NOTE: debian12 binary on trixie — validate before relying on it.
# `libncurses6` (NOT just the wide `libncursesw6`) is required: swiftc links
# `libncurses.so.6` directly. The old full image got it transitively from the
# now-removed Octave/SWI-Prolog/GHC toolchains, so install it explicitly here.
ARG SWIFT_VERSION=6.0.3
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4 libxml2 libedit2 libncurses6 libncursesw6 libpython3.13 \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then SWIFT_PLAT=debian12; SWIFT_FILE=swift-${SWIFT_VERSION}-RELEASE-debian12; \
       else SWIFT_PLAT=debian12-aarch64; SWIFT_FILE=swift-${SWIFT_VERSION}-RELEASE-debian12-aarch64; fi \
    && curl -fsSL --retry 5 --retry-all-errors \
         "https://download.swift.org/swift-${SWIFT_VERSION}-release/${SWIFT_PLAT}/swift-${SWIFT_VERSION}-RELEASE/${SWIFT_FILE}.tar.gz" -o /tmp/swift.tar.gz \
    && tar -C /usr/local -xzf /tmp/swift.tar.gz --strip-components=2 \
    && rm /tmp/swift.tar.gz \
    && swiftc --version

# ---- Dart SDK (id 163) ----
ARG DART_VERSION=3.6.0
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then DART_ARCH="x64"; else DART_ARCH="arm64"; fi \
    && curl -fsSL "https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_VERSION}/sdk/dartsdk-linux-${DART_ARCH}-release.zip" -o /tmp/dart.zip \
    && cd /usr/lib && unzip -q /tmp/dart.zip \
    && ln -sf /usr/lib/dart-sdk/bin/dart /usr/bin/dart \
    && rm /tmp/dart.zip

# ---- Late fixes (kept at the end so the heavy tarball layers stay cached) ----
# pkg-config is needed by Swift to locate its link-time libraries at compile
# time inside the sandbox.
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

# C# (id 140) Roslyn-direct compile script. Kept here in the late-fixes section
# so iterating on it doesn't bust the heavy toolchain tarball layers above.
# See csharp-build.sh for why this replaces `dotnet build` (MSBuild).
RUN mkdir -p /usr/local/lib/zerocode/csharp
COPY csharp-build.sh /usr/local/lib/zerocode/csharp/build.sh
RUN chmod 0755 /usr/local/lib/zerocode/csharp/build.sh

# =====================================================================
# Image slimming — drop toolchain components a single-file "compile + run"
# submission never touches. Placed last so it only DELETES files and never
# busts a cached toolchain layer above (same philosophy as the late-fixes
# section). Saves ~1.5 GB, almost all from the Swift toolchain, which ships a
# full IDE/debugger/package-manager stack on top of the compiler.
#
# Kept (do NOT remove): swiftc -> swift-driver, swift-frontend, the bundled
# clang/lld used for linking, and /usr/local/lib/swift/linux (the runtime libs
# ./prog resolves at run time). Everything below is IDE tooling (SourceKit/
# clangd), the LLDB debugger, SwiftPM, the doc compiler, the static-stdlib SDK
# (languages.toml id 152 links dynamically, no -static-stdlib), and the
# embedded-Swift cross-compile modules for arm/riscv/wasm targets this x86_64
# Linux runner can never use. Scala's scala-cli.jar is unused too: id 121
# compiles with scalac and runs with plain `java` (see languages.toml).
# A swiftc compile+link smoke test runs afterward so a wrong path fails loudly.
RUN set -eux \
    && rm -rf \
        /usr/local/bin/sourcekit-lsp \
        /usr/local/bin/clangd \
        /usr/local/bin/swift-format \
        /usr/local/bin/docc \
        /usr/local/bin/swift-package \
        /usr/local/bin/swift-build-tool \
        /usr/local/bin/swift-build-sdk-interfaces \
        /usr/local/bin/lldb \
        /usr/local/bin/lldb-server \
        /usr/local/bin/lldb-dap \
        /usr/local/bin/lldb-argdumper \
        /usr/local/lib/libsourcekitdInProc.so \
        /usr/local/lib/liblldb.so* \
        /usr/local/lib/swift/embedded \
        /usr/local/lib/swift_static \
    && rm -f /usr/local/scala3-*/bin/scala-cli.jar \
    && rm -rf /usr/share/doc/* /usr/share/info/* \
    && printf 'print("swift slim ok")\n' > /tmp/slimcheck.swift \
    && swiftc -O -o /tmp/slimcheck /tmp/slimcheck.swift \
    && rm -f /tmp/slimcheck.swift /tmp/slimcheck

# Pre-warm the Go build cache with the full standard library. A cold `go build`
# of hello-world recompiles all of stdlib (~11 s, single-threaded under
# GOMAXPROCS=1); with this warm cache it drops to ~0.3 s. At runtime the sandbox
# sets GOCACHE=/var/cache/go-build (read-only) and GOTMPDIR=/tmp, so Go reads
# cached stdlib entries from here and writes the user package's compile output to
# the writable tmpfs — a read-only cache is sufficient. GOFLAGS here MUST match
# the runtime build (-trimpath) or the content-hash cache keys won't hit.
RUN mkdir -p /var/cache/go-build \
    && GOROOT=/usr/local/go GOCACHE=/var/cache/go-build GOFLAGS=-trimpath \
       /usr/local/go/bin/go build std \
    && chmod -R a+rX /var/cache/go-build

# ---- C++ precompiled header for <bits/stdc++.h> ----
# `#include <bits/stdc++.h>` is the near-universal opening line of competitive
# and campus-placement C++, and it is brutally expensive: it pulls in the entire
# standard library, so a cold g++ parse costs ~3.4 s and peaks at ~294 MB RSS.
# That blew straight through the compile-phase cgroup ceiling, and because most
# of the footprint is reclaimable page cache the cgroup ground away in reclaim
# instead of OOMing — the submission just sat there until the wall clock killed
# it and reported `time_limit_exceeded` at exactly the memory ceiling.
#
# GCC automatically prefers `<header>.gch` next to a header it is about to
# include, provided the PCH was built with compatible flags and the include is
# the first thing in the translation unit. Precompiling it here takes those
# ~3.4 s / 294 MB down to ~0.87 s / 106 MB, which fixes the failure and is also
# the single biggest C++ latency win available.
#
# Flags MUST stay in sync with the id=52 compile_cmd in runners/languages.toml
# (`-O0 -std=c++23`; `-pipe` does not participate in PCH validity). On a
# mismatch GCC silently falls back to parsing the real header, so the build
# verifies with `-H` that the PCH is actually consumed rather than trusting it.
# Debian keeps this header in the target-specific include dir, so it is located
# rather than hardcoded.
RUN set -eux; \
    hdr="$(find /usr/include -type f -path '*/bits/stdc++.h' | head -n1)"; \
    [ -n "$hdr" ] || { echo "bits/stdc++.h not found in this image" >&2; exit 1; }; \
    g++-14 -O0 -std=c++23 -x c++-header "$hdr" -o "$hdr.gch"; \
    chmod a+r "$hdr.gch"; \
    printf '#include <bits/stdc++.h>\nint main(){ std::vector<int> v{1}; std::cout << v.size(); }\n' > /tmp/pchprobe.cpp; \
    g++-14 -O0 -pipe -std=c++23 -Winvalid-pch -H /tmp/pchprobe.cpp -o /tmp/pchprobe 2>/tmp/pchprobe.log; \
    grep -q "^! .*stdc++\.h\.gch" /tmp/pchprobe.log \
      || { echo "PCH built but not used by the runtime flags:" >&2; head -5 /tmp/pchprobe.log >&2; exit 1; }; \
    /tmp/pchprobe; echo; \
    rm -f /tmp/pchprobe /tmp/pchprobe.cpp /tmp/pchprobe.log

# Create the directory tree the sandbox uses inside the runner rootfs.
RUN mkdir -p /box /tmp && \
    chmod 1777 /tmp && \
    chmod 0700 /box

# The runner image is the rootfs; it doesn't run as a container itself.
# Provide a trivial CMD so `docker run` returns immediately if someone tries.
CMD ["/bin/true"]
