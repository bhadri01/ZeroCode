#!/bin/sh
# csharp-build.sh — compile ONE C# source file (main.cs in cwd) with the Roslyn
# compiler (csc) directly, deliberately bypassing MSBuild.
#
# Why not `dotnet build`: for even a hello-world, MSBuild peaks ~130 MB and ~3 s,
# and that compile phase shares the submission's cgroup, so it dominated both the
# reported memory and the wall time. Invoking csc on the single source file does
# the same job in well under a second with a fraction of the memory. The runtime
# itself (`dotnet app.dll`) was never the problem — it runs in ~15 MB.
#
# Diagnostics: csc writes errors AND warnings to STDOUT. We redirect that to
# STDERR (1>&2) because the sandbox captures the compile sub-child's stderr as
# compile_output; this keeps diagnostics out of the program's own stdout while
# still surfacing real compile errors to the caller.
set -e

# Resolve the toolchain by glob so we don't pin SDK / ref-pack patch versions
# (the Dockerfile installs whatever `--channel 9.0` currently resolves to).
CSC=$(ls /usr/share/dotnet/sdk/*/Roslyn/bincore/csc.dll 2>/dev/null | sort -V | tail -n1)
REF=$(ls -d /usr/share/dotnet/packs/Microsoft.NETCore.App.Ref/*/ref/net*/ 2>/dev/null | sort -V | tail -n1)

# .NET creates named-mutex shm files under $TMPDIR/.dotnet/shm and aborts if the
# dir is missing in the fresh per-submission /tmp; /box/bin holds the output.
mkdir -p /tmp/.dotnet/shm /box/bin

# Implicit global usings — mirrors `dotnet new console`'s <ImplicitUsings>enable
# so top-level scripts that omit `using System;` (Console.WriteLine(...)) still
# compile, matching the previous MSBuild-based behaviour.
cat > /tmp/GlobalUsings.g.cs <<'CS'
global using global::System;
global using global::System.Collections.Generic;
global using global::System.IO;
global using global::System.Linq;
global using global::System.Net.Http;
global using global::System.Threading;
global using global::System.Threading.Tasks;
CS

# Binds the apphost to the shared framework; rollForward picks the installed patch.
cat > /box/bin/app.runtimeconfig.json <<'JSON'
{
  "runtimeOptions": {
    "tfm": "net9.0",
    "rollForward": "Major",
    "framework": { "name": "Microsoft.NETCore.App", "version": "9.0.0" }
  }
}
JSON

# Build the reference list from the ref pack (no NuGet, no MSBuild). -nostdlib is
# correct because the ref pack already supplies System.Private.CoreLib's surface.
set -- -nologo -noconfig -nostdlib -optimize+ -nowarn:1701,1702 \
       -target:exe -out:/box/bin/app.dll
for d in "$REF"*.dll; do set -- "$@" "-r:$d"; done

exec dotnet "$CSC" "$@" /tmp/GlobalUsings.g.cs main.cs 1>&2
