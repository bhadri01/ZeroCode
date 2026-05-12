# ZeroCode

Sandboxed code execution service in Rust. Modern Linux host (cgroups v2,
kernel ≥5.13), unprivileged containers, latest language toolchains, content-
addressed result & compile caches, Postgres `LISTEN/NOTIFY` job dispatch.

Designed as a replacement for [Judge0](https://judge0.com) — see the design
plan in `~/.claude/plans/what-is-in-this-transient-engelbart.md` for the full
motivation and roadmap.

## Status

Phase 0 — workspace skeleton, types, migrations, docker-compose, /v1/health.
The production native sandbox lands in Phase 1.5.

## Layout

```
crates/
  zerocode-core/      shared types (Submission, Status, LanguageSpec, Limits)
  zerocode-sandbox/   Sandbox trait; NativeSandbox (libcontainer) lands in Phase 1.5
  zerocode-cache/     moka result cache + Postgres compile-artifact cache
  zerocode-stream/    Postgres LISTEN/NOTIFY job dispatch + SSE event publishing
  zerocode-migrate/   one-shot DB migration binary
  zerocode-api/       axum HTTP server
  zerocode-worker/    apalis-sql consumer + sandbox executor
runners/
  Dockerfile          language toolchains baked into the sandbox rootfs
  languages.toml      LanguageSpec registry
deploy/
  Dockerfile.service  distroless image for the API (musl static)
  Dockerfile.worker   debian-slim image for the worker (needs glibc)
  docker-compose.yml  local stack
migrations/           sqlx migrations
docs/                 deployment, architecture, threat model, edge cases
tests/edge_cases/     adversarial regression suite, sharded by language
```

## Quick start (dev)

Requires Docker, Rust 1.84+, and a modern Linux host for actually running the
sandbox. macOS dev hosts can build and run the API/worker but not exercise the
native sandbox.

```sh
# 1. Spin up Postgres + run migrations
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml \
    up -d postgres migrate

# 2. Run the API locally (auto-uses .env.example settings)
cp .env.example .env
cargo run -p zerocode-api

# 3. Run the worker in another shell
cargo run -p zerocode-worker

# 4. Hit it
curl http://localhost:8080/v1/health
curl http://localhost:8080/v1/ready
```

## License

Dual-licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
