# syntax=docker/dockerfile:1.7
#
# The "runner" image holds the language toolchains. The worker bind-mounts an
# extracted copy of this image's filesystem as the read-only rootfs every
# sandboxed submission lives inside.
#
# Build with:
#   docker build -f runners/Dockerfile -t zerocode-runner:dev runners/
#
# *** FULL LANGUAGE SET (62 languages, ~3+ GB monolithic image) ***
# Core 7 (v1) + Batches A–I + the v2 raw-wasm tier. Source of truth for the
# list and IDs is runners/languages.toml; this image must provide every
# toolchain that file's compile_cmd/run_cmd reference. For slim, per-language
# images covering only the Core 7, see runners/Dockerfile.slim.
#
#   Core 7 : Python 3.13, Node.js 22, C/C++ (gcc/g++-14), Go, Rust, Java 21
#   Batch A: Bash, Lua, Perl, Ruby, R, PHP, TypeScript (tsx)
#   Batch B: Fortran, Pascal (fpc), D (ldc), Objective-C (clang), Assembly
#            (nasm), Ada (gnat)
#   Batch C: Kotlin, Scala 3, Groovy, Clojure   (JVM)
#   Batch D: Haskell (ghc), OCaml, Erlang, Elixir, Common Lisp (sbcl)
#   Batch E: C#, F#   (.NET 9 SDK)
#   Batch F: COBOL (gnucobol), Prolog (swipl), Swift, Octave, SQL (sqlite3)
#   Batch G: Nim, Crystal, Dart, Julia  (Zig removed — sandbox tmpfs EXDEV)
#   Batch H: Racket, Raku, AWK (gawk), CoffeeScript, Forth (gforth, pinned from
#            bookworm), Emacs Lisp, Verilog (iverilog), LLVM IR (lli), V,
#            FreeBASIC, PowerShell, Pony   (tarball toolchains marked VALIDATE)
#            [Smalltalk dropped — gnu-smalltalk removed from Debian; id 175 unused]
#   Batch I: Brainfuck, GolfScript, CJam, Vyxal, Jelly, Samarium, Paradoc
#            (esoteric / code-golf — best-effort, all marked VALIDATE)
#   v2     : raw-wasm runs in-process via wasmtime — no toolchain needed here.

FROM debian:trixie-slim

# apt toolchains are split into per-batch layers (instead of one giant install)
# so each batch caches independently and any package that drifts in/out of
# Debian testing fails in isolation — the error names ≤7 packages, not 40, and
# every batch before it stays cached. bash + perl ship in the base image; unzip
# is needed to unpack the Kotlin/Dart archives below.

# ---- base utilities + Core 7 ----
# gcc/g++ (unversioned, alternatives → gcc-14) give a generic `cc` that ghc,
# ldc, crystal and nim shell out to when linking; Core 7 C/C++/Rust use the
# versioned gcc-14 directly.
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

# ---- Batch A — interpreted (bash + perl already in base) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        lua5.4 ruby r-base-core php-cli \
    && rm -rf /var/lib/apt/lists/*

# ---- Batch B — compiled (GCC family) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        gfortran-14 fp-compiler ldc clang libobjc-14-dev nasm binutils gnat \
    && rm -rf /var/lib/apt/lists/*

# ---- Batch C — JVM (Kotlin + Scala installed from upstream tarballs below) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        groovy clojure \
    && rm -rf /var/lib/apt/lists/*

# ---- Batch D — functional / ML ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        ghc ocaml ocaml-findlib erlang-base erlang-dev elixir sbcl \
    && rm -rf /var/lib/apt/lists/*

# ---- Batch F — niche (.NET + Swift installed from upstream below) ----
# The GnuCOBOL dev lib name tracks the libcob SONAME, which bumps across
# releases — try the known names in order so a trixie bump doesn't break us.
# (The cobc compiler binary + pkg-config are added in a late layer below so
# this and the heavy tarball layers stay cache-stable.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gnucobol4 swi-prolog octave sqlite3 \
    && (apt-get install -y --no-install-recommends libcob4-dev \
        || apt-get install -y --no-install-recommends libcob5-dev \
        || apt-get install -y --no-install-recommends libcob-dev) \
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

# ---- Kotlin (Batch C, id 120) ----
ARG KOTLIN_VERSION=2.1.0
RUN curl -fsSL "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" -o /tmp/kotlin.zip \
    && mkdir -p /usr/local/kotlin && cd /usr/local/kotlin && unzip -q /tmp/kotlin.zip \
    && ln -sf /usr/local/kotlin/kotlinc/bin/kotlinc /usr/bin/kotlinc \
    && rm /tmp/kotlin.zip

# ---- Scala 3 (Batch C, id 121) ----
ARG SCALA_VERSION=3.5.2
RUN curl -fsSL "https://github.com/scala/scala3/releases/download/${SCALA_VERSION}/scala3-${SCALA_VERSION}.tar.gz" -o /tmp/scala.tar.gz \
    && tar -C /usr/local -xzf /tmp/scala.tar.gz \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scalac /usr/bin/scalac \
    && ln -sf /usr/local/scala3-${SCALA_VERSION}/bin/scala /usr/bin/scala \
    && rm /tmp/scala.tar.gz

# ---- .NET 9 SDK (Batch E, ids 140/141) ----
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel 9.0 --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm /tmp/dotnet-install.sh \
    && dotnet --version

# ---- .NET offline warmup ----
# Sandboxed runs have NO network, so NuGet can't restore at submission time.
# Pre-create a Release console project and restore its packages into a baked,
# world-readable cache. C# (id 140) no longer uses this skeleton — it compiles
# with Roslyn (csc) directly via csharp-build.sh (installed in the late-fixes
# section below), which avoids MSBuild's ~130 MB / ~3 s hello-world overhead.
# The restored cache is kept only so F# (id 141, `dotnet fsi`) has a populated
# NUGET_PACKAGES to fall back on.
ENV NUGET_PACKAGES=/usr/local/lib/zerocode/nuget \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
RUN mkdir -p /usr/local/lib/zerocode/nuget \
    && cd /usr/local/lib/zerocode \
    && HOME=/tmp dotnet new console -n app -o csharp-app \
    && cd csharp-app \
    && HOME=/tmp dotnet build -c Release -o bin \
    && rm -rf bin \
    && chmod -R a+rX /usr/local/lib/zerocode

# ---- Swift (Batch F, id 152) ----
# swift.org's debian12 build (Swift isn't packaged for trixie). The download
# URL layout differs by arch: x86_64 has NO arch suffix and lives under the
# bare `debian12/` dir; aarch64 uses a `debian12-aarch64/` dir + `-aarch64`
# suffix. Both nest under a `swift-<ver>-RELEASE/` segment. Runtime libs come
# from apt. `swiftc --version` is NOT masked — a bad URL/dep fails the build
# loudly. NOTE: debian12 binary on trixie — validate before relying on it.
ARG SWIFT_VERSION=6.0.3
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4 libxml2 libedit2 libncursesw6 libpython3.13 \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then SWIFT_PLAT=debian12; SWIFT_FILE=swift-${SWIFT_VERSION}-RELEASE-debian12; \
       else SWIFT_PLAT=debian12-aarch64; SWIFT_FILE=swift-${SWIFT_VERSION}-RELEASE-debian12-aarch64; fi \
    && curl -fsSL --retry 5 --retry-all-errors \
         "https://download.swift.org/swift-${SWIFT_VERSION}-release/${SWIFT_PLAT}/swift-${SWIFT_VERSION}-RELEASE/${SWIFT_FILE}.tar.gz" -o /tmp/swift.tar.gz \
    && tar -C /usr/local -xzf /tmp/swift.tar.gz --strip-components=2 \
    && rm /tmp/swift.tar.gz \
    && swiftc --version

# ---- Zig (Batch G, id 160) — REMOVED ----
# Zig's compiler can't run in the sandbox: `zig build-exe` finalizes its cache
# with a cross-directory rename, which the per-submission tmpfs rejects with
# EXDEV. The language was dropped from runners/languages.toml; no toolchain here.

# ---- Nim (Batch G, id 161) ----
# Not taken from apt (intermittently absent from Debian testing). The official
# prebuilt linux_x64 tarball ships a compiled bin/nim + its stdlib under lib/;
# Nim resolves its stdlib relative to the real binary path, so the /usr/bin
# symlink works. Nim shells out to `cc` to build the generated C (provided
# above). NOTE: nim-lang.org only publishes a prebuilt x86_64 tarball —
# arm64 needs a source build / choosenim.
ARG NIM_VERSION=2.2.10
RUN curl -fsSL "https://nim-lang.org/download/nim-${NIM_VERSION}-linux_x64.tar.xz" -o /tmp/nim.tar.xz \
    && tar -C /usr/local -xJf /tmp/nim.tar.xz \
    && ln -sf /usr/local/nim-${NIM_VERSION}/bin/nim /usr/bin/nim \
    && rm /tmp/nim.tar.xz \
    && nim --version

# ---- Crystal (Batch G, id 162) ----
# Crystal isn't in Debian main, and its vendor apt repo publishes no `trixie`
# suite, so we install the official portable tarball from GitHub plus the
# runtime libraries it links against (the -dev packages provide the .so symlinks
# the compiler links user programs with). The tarball's bin/crystal wrapper
# resolves its bundled stdlib relative to the (symlink-resolved) binary, so the
# /usr/bin/crystal symlink is enough. The closing `crystal eval` is a full
# compile+link smoke test. NOTE: the tarball is x86_64-only — arm64 needs a
# source build.
ARG CRYSTAL_VERSION=1.20.2
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgc-dev libpcre2-dev libevent-dev libgmp-dev libyaml-dev libssl-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://github.com/crystal-lang/crystal/releases/download/${CRYSTAL_VERSION}/crystal-${CRYSTAL_VERSION}-1-linux-x86_64.tar.gz" -o /tmp/crystal.tar.gz \
    && mkdir -p /usr/local/crystal \
    && tar -C /usr/local/crystal --strip-components=1 -xzf /tmp/crystal.tar.gz \
    && ln -sf /usr/local/crystal/bin/crystal /usr/bin/crystal \
    && rm /tmp/crystal.tar.gz \
    && crystal --version \
    && echo 'puts "crystal ok"' | crystal eval

# ---- Dart SDK (Batch G, id 163) ----
ARG DART_VERSION=3.6.0
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then DART_ARCH="x64"; else DART_ARCH="arm64"; fi \
    && curl -fsSL "https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_VERSION}/sdk/dartsdk-linux-${DART_ARCH}-release.zip" -o /tmp/dart.zip \
    && cd /usr/lib && unzip -q /tmp/dart.zip \
    && ln -sf /usr/lib/dart-sdk/bin/dart /usr/bin/dart \
    && rm /tmp/dart.zip

# ---- Julia (Batch G, id 164) ----
# Official binaries live only on julialang-s3 (GitHub releases host source
# only). The S3 bucket intermittently 503s, so curl auto-retries 5xx. The path
# uses a dir slug (x64 / aarch64) distinct from the tarball arch (x86_64 /
# aarch64); the minor-version dir is ${JULIA_VERSION%.*} (e.g. 1.11).
#
# trixie's hardened glibc 2.41 loader refuses to load shared objects that
# request an executable stack, and Julia's bundled libs (libopenlibm.so, …)
# carry that flag. patchelf --clear-execstack strips it; `julia --version`
# then validates the result.
ARG JULIA_VERSION=1.11.2
RUN apt-get update && apt-get install -y --no-install-recommends patchelf \
    && rm -rf /var/lib/apt/lists/* \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then JULIA_DIR=x64; JULIA_ARCH=x86_64; else JULIA_DIR=aarch64; JULIA_ARCH=aarch64; fi \
    && curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors \
         "https://julialang-s3.julialang.org/bin/linux/${JULIA_DIR}/${JULIA_VERSION%.*}/julia-${JULIA_VERSION}-linux-${JULIA_ARCH}.tar.gz" -o /tmp/julia.tar.gz \
    && tar -C /usr/local -xzf /tmp/julia.tar.gz \
    && ln -sf /usr/local/julia-${JULIA_VERSION}/bin/julia /usr/local/bin/julia \
    && rm /tmp/julia.tar.gz \
    && find /usr/local/julia-${JULIA_VERSION} -type f -name '*.so*' \
         -exec sh -c 'patchelf --clear-execstack "$1" 2>/dev/null || true' _ {} \; \
    && julia --version

# ---- Late fixes (kept at the end so the heavy tarball layers stay cached) ----
# cobc ships in gnucobol3 (trixie's gnucobol4 is a 4.0~early stub with no
# compiler binary). pkg-config is needed by Crystal and Swift to locate their
# link-time libraries at compile time inside the sandbox.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gnucobol3 pkg-config \
    && rm -rf /var/lib/apt/lists/*

# C# (id 140) Roslyn-direct compile script. Kept here in the late-fixes section
# so iterating on it doesn't bust the heavy toolchain tarball layers above.
# See csharp-build.sh for why this replaces `dotnet build` (MSBuild).
RUN mkdir -p /usr/local/lib/zerocode/csharp
COPY csharp-build.sh /usr/local/lib/zerocode/csharp/build.sh
RUN chmod 0755 /usr/local/lib/zerocode/csharp/build.sh

# COBOL (id 150) libxml2 version-skew silencer. libcob links libxml2 and calls
# xmlCheckVersion() at startup; on trixie the runtime lib (really 2.9.14, "209")
# is older than gnucobol's build headers (2.12, "212"), so it prints a harmless
# but noisy warning to stderr on every run. We compile a no-op override to an
# object and link it into every COBOL binary (see runners/languages.toml's
# compile_cmd): because libcob references the symbol, the linker exports our
# definition into the executable's .dynsym, interposing libcob's call on every
# execution path — direct, naive and native — with no LD_PRELOAD. See
# cob_xml_quiet.c for the full rationale.
COPY cob_xml_quiet.c /usr/local/lib/zerocode/cobol/cob_xml_quiet.c
RUN gcc -c -fPIC -O2 \
        -o /usr/local/lib/zerocode/cobol/cob_xml_quiet.o \
        /usr/local/lib/zerocode/cobol/cob_xml_quiet.c

# =====================================================================
# Batch H — Practical parity languages (ids 170–182)
#
# apt/npm installs are high-confidence. The upstream-tarball toolchains (V,
# FreeBASIC, PowerShell, Pony) mirror the Nim/Crystal/Dart/Julia pattern and
# are marked VALIDATE — they are x86_64-oriented and a bad URL/arch fails the
# build loudly; confirm on a real build before relying on them.
# =====================================================================

# ---- apt: Racket, Raku, AWK, Emacs (batch), Verilog, LLVM ----
RUN apt-get update && apt-get install -y --no-install-recommends \
        racket rakudo gawk emacs-nox iverilog llvm \
    && rm -rf /var/lib/apt/lists/*

# ---- Bookworm-pinned packages (both dropped from trixie): gforth (Forth, id
#      174) and libtinfo5 (the FreeBASIC `fbc` binary links libtinfo.so.5 with
#      ncurses-5 versioned symbols; trixie only ships ncurses 6). Both verified
#      to install + run cleanly on the trixie base. The bookworm source +
#      preference are removed afterwards so later apt steps stay on trixie. ----
RUN echo "deb http://deb.debian.org/debian bookworm main" > /etc/apt/sources.list.d/bookworm.list \
    && printf 'Package: *\nPin: release n=trixie\nPin-Priority: 700\n\nPackage: gforth gforth-lib gforth-common libtinfo5\nPin: release n=bookworm\nPin-Priority: 750\n' > /etc/apt/preferences.d/bookworm \
    && apt-get update && apt-get install -y --no-install-recommends gforth libtinfo5 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/apt/sources.list.d/bookworm.list /etc/apt/preferences.d/bookworm \
    && gforth -e bye

# ---- CoffeeScript (id 173) — npm global, runs on Node (Core 7) ----
RUN npm install -g coffeescript && npm cache clean --force

# ---- V (id 179) — official prebuilt release ----  [VALIDATE: amd64 only]
ARG V_VERSION=0.4.9
RUN curl -fsSL "https://github.com/vlang/v/releases/download/${V_VERSION}/v_linux.zip" -o /tmp/v.zip \
    && cd /usr/local && unzip -q /tmp/v.zip && rm /tmp/v.zip \
    && ln -sf /usr/local/v/v /usr/local/bin/v \
    && chmod -R a+rX /usr/local/v \
    && HOME=/tmp v version

# ---- FreeBASIC (id 180) — SourceForge release ----  [VALIDATE: url/arch]
ARG FBC_VERSION=1.10.1
RUN curl -fsSL "https://downloads.sourceforge.net/fbc/FreeBASIC-${FBC_VERSION}-linux-x86_64.tar.gz" -o /tmp/fbc.tar.gz \
    && mkdir -p /tmp/fbc && tar -C /tmp/fbc --strip-components=1 -xzf /tmp/fbc.tar.gz \
    && (cd /tmp/fbc && ./install.sh -i /usr/local) \
    && rm -rf /tmp/fbc /tmp/fbc.tar.gz \
    && fbc --version

# ---- PowerShell (id 181) — Microsoft release tarball ----  [VALIDATE: x64 only]
# Installed under /usr/local (NOT /opt): the sandbox's landlock policy only
# allows read/exec on /bin /etc /lib /usr /var, so an /opt install fails with
# EACCES at exec time.
ARG PWSH_VERSION=7.4.6
RUN apt-get update && apt-get install -y --no-install-recommends libicu76 libssl3t64 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/local/microsoft/powershell/7 \
    && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-linux-x64.tar.gz" -o /tmp/pwsh.tar.gz \
    && tar -C /usr/local/microsoft/powershell/7 -xzf /tmp/pwsh.tar.gz \
    && chmod -R a+rX /usr/local/microsoft/powershell/7 \
    && chmod a+x /usr/local/microsoft/powershell/7/pwsh \
    && ln -sf /usr/local/microsoft/powershell/7/pwsh /usr/local/bin/pwsh \
    && rm /tmp/pwsh.tar.gz \
    && HOME=/tmp pwsh --version

# ---- Pony (id 182) — ponylang release ----  [VALIDATE: url/arch]
ARG PONYC_VERSION=0.58.7
RUN curl -fsSL "https://github.com/ponylang/ponyc/releases/download/${PONYC_VERSION}/ponyc-x86-64-unknown-linux-ubuntu24.04.tar.gz" -o /tmp/ponyc.tar.gz \
    && mkdir -p /usr/local/ponyc && tar -C /usr/local/ponyc --strip-components=1 -xzf /tmp/ponyc.tar.gz \
    && ln -sf /usr/local/ponyc/bin/ponyc /usr/bin/ponyc \
    && chmod -R a+rX /usr/local/ponyc \
    && rm /tmp/ponyc.tar.gz \
    && ponyc --version

# =====================================================================
# Batch I — Esoteric / code-golf languages (ids 300–306)
#
# Best-effort parity with Piston's golfing tier. ALL marked VALIDATE — confirm
# package names/entrypoints against a real build + sandbox smoke test before
# relying on them.
# =====================================================================

# ---- Brainfuck (id 300) — `beef` interpreter (`bf` isn't packaged in trixie) ----
RUN apt-get update && apt-get install -y --no-install-recommends beef \
    && rm -rf /var/lib/apt/lists/*

# ---- GolfScript (id 301) — single Ruby file (Ruby from Batch A) ----  [VALIDATE]
RUN mkdir -p /usr/local/lib/zerocode/golfscript \
    && curl -fsSL "http://www.golfscript.com/golfscript/golfscript.rb" \
         -o /usr/local/lib/zerocode/golfscript/golfscript.rb \
    && chmod -R a+rX /usr/local/lib/zerocode/golfscript

# ---- CJam (id 302) — interpreter jar (JVM from Core 7) ----  [VALIDATE: url]
ARG CJAM_VERSION=0.6.5
RUN mkdir -p /usr/local/lib/zerocode/cjam \
    && curl -fsSL "https://downloads.sourceforge.net/project/cjam/cjam-${CJAM_VERSION}/cjam-${CJAM_VERSION}.jar" \
         -o /usr/local/lib/zerocode/cjam/cjam.jar \
    && chmod -R a+rX /usr/local/lib/zerocode/cjam

# ---- Python golfing langs ----  [VALIDATE]
# Vyxal + Samarium are on PyPI. Jelly isn't published to PyPI — install from its
# GitHub tarball (provides the `jelly` console script). Paradoc has no setup.py,
# so it's extracted below and reached via PYTHONPATH (set in languages.toml).
# trixie's Python is externally-managed (PEP 668); --break-system-packages lets
# pip install into the site-packages the sandbox's python3 reads.
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages \
         vyxal samarium \
         "https://github.com/DennisMitchell/jellylanguage/archive/refs/heads/master.tar.gz" \
    && (chmod -R a+rX /usr/local/lib/python3* 2>/dev/null || true)

# ---- Paradoc (id 306) — not pip-installable (no setup.py); extract the package
#      tree under /usr/local (landlock-allowed; /opt is not) and expose it via
#      PYTHONPATH=/usr/local/lib/paradoc-master (set in languages.toml) ----
RUN curl -fsSL "https://github.com/betaveros/paradoc/archive/refs/heads/master.tar.gz" \
      | tar -xz -C /usr/local/lib \
    && chmod -R a+rX /usr/local/lib/paradoc-master

# Create the directory tree the sandbox uses inside the runner rootfs.
RUN mkdir -p /box /tmp && \
    chmod 1777 /tmp && \
    chmod 0700 /box

# The runner image is the rootfs; it doesn't run as a container itself.
# Provide a trivial CMD so `docker run` returns immediately if someone tries.
CMD ["/bin/true"]
