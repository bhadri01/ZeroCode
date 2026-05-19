# ZeroCode Roadmap

> **For**: everyone — forward-looking only. See [`README.md`](README.md) for docs orientation; completed milestones live in [`../CHANGELOG.md`](../CHANGELOG.md).

Legend: `[ ]` planned · `[~]` in progress

---

## Shipped (summary)

- **v1 — core service**: API + worker + Postgres queue, NaiveSandbox (dev)
  and NativeSandbox (production with cgroups v2, landlock, seccomp,
  pivot_root, capability drop, no-new-privs).
- **v1.5 — language expansion**: Core 7 (Python, Node, Rust, Go, C, C++,
  Java) plus 34 additional languages across Batches A–G (interpreted,
  native GCC family, JVM family, functional/ML, .NET, niche, modern).
- **Web surface**: embedded landing + playground (Vite + React) and
  Astro/Starlight docs site, served by the API.
- **Operational**: Prometheus `/metrics`, multi-arch images (amd64 +
  arm64), OpenAPI 3.1 spec + SDK generator, end-to-end smoke and load
  test scripts.

See [`../CHANGELOG.md`](../CHANGELOG.md) for the version-by-version log.

---

## In progress

- **[~] WASM tier** — `WasmSandbox` runs pre-compiled `.wasm` blobs via
  wasmtime. The dispatch routing (`SandboxTier::Wasm` in
  `LanguageSpec`) and the `id=200` raw-wasm registry entry exist. Open:
  WASI-targeted compile pipelines for Rust/Go/C/C++ so users submit
  source rather than `.wasm`; `cwasm` AOT pre-compilation.
- **[~] Auto-scaling worker pool** — pending-jobs and active-sandbox
  gauges are exported. The scaler/operator that consumes them (HPA,
  KEDA, custom) is intentionally out-of-tree.

---

## v2 — performance + advanced isolation

- **[ ] Firecracker microVM tier** with snapshot/restore (~5–10 ms cold start)
- **[ ] CRIU interpreter snapshots** — pre-warmed CPython / JVM / Node images
- **[ ] Sandbox warm-up pool** — pre-built cgroups + mount layouts +
  landlock rulesets, claimed lock-free by jobs (deferred from v1.5;
  needs profiling to validate the win)
- **[ ] Separate compile-time / compile-memory limits**
  (`compile_time_limit`, `compile_memory_limit`); today compile shares
  the run-phase wall budget
- **[ ] Optional authentication layer** — pluggable auth (static keys,
  OIDC, mTLS) for deployments that can't rely on network-layer access
  control. Today ZeroCode is open / unauthenticated by design; this
  would put it behind an opt-in middleware.
- **[ ] Typed TS SDK in `web/app/src/sdk/`** generated from
  `/v1/openapi.json` (today the playground uses a hand-written client)
- **[ ] Auto-generated REST reference** rendered from
  `/v1/openapi.json` at docs-site build time (today written by hand)
- **[ ] Versioned docs URLs** (`/v0.1/docs`, `/v0.2/docs`) once we
  have ≥ 2 released versions to switch between

---

## v3 — advanced platform features

- **[ ] Custom judges / checkers** — `code + judge_code`, SPJ semantics
- **[ ] Multi-file submissions** — `additional_files` tar/zip
- **[ ] Multiple versions of the same language** side-by-side
- **[ ] Network access tier** with per-submission egress firewall
- **[ ] File output artifacts** — `GET /v1/submissions/{token}/artifacts/<path>`
- **[ ] Multi-tenancy + per-API-key quotas**
- **[ ] GPU sandbox tier** — Firecracker + CUDA passthrough
- **[ ] Distributed tracing across the submission lifecycle**
- **[ ] Time-travel debugging** — `rr`-based replay
- **[ ] Static-analysis preflight** — `?preflight=lint`
- **[ ] Helm chart / Kubernetes operator**
- **[ ] CPU pinning / cpuset** for benchmark-consistent timing
- **[ ] `expected_output` field** with `WrongAnswer` / `Accepted` comparison

---

## Cross-cutting tech-debt items

- **[ ] Extract a shared `zerocode-db` crate** if duplication between
  `api/db.rs` and `worker/db.rs` continues to grow
- **[ ] Generalise per-language slim runner images** to v1.5 batches
  (today slim images cover Core 7 only; the full image still bundles
  every Batch A–G language)
- **[ ] CI smoke test against a built UI** — `web/` typechecks + builds
  on PR today, but doesn't exercise the assembled bundle against a
  running API

---

## Explicitly out of scope

These appeared in earlier plans and have been decided against:

- **gRPC API surface** — REST + SSE is the only public protocol. The
  gRPC tier didn't justify its dependency footprint and was removed in
  v0.1.5.
- **WebSocket interactive REPL sessions** — dropped alongside gRPC.
  Long-lived bidirectional sessions are not on the roadmap.
- **OTLP tracing export** — Prometheus metrics + structured stdout logs
  are the supported observability surface. Re-add only if distributed
  tracing becomes load-bearing.

---

_Have something you'd like to see on this list? Open an issue with the
use case before opening a PR — see
[`../CONTRIBUTING.md`](../CONTRIBUTING.md)._
