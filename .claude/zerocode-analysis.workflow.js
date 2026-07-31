export const meta = {
  name: 'zerocode-project-analysis',
  description: 'Exhaustive analysis of the ZeroCode code-execution platform: subsystem deep-reads, cross-cutting lenses (security/perf/quality/docs), synthesized into a complete report',
  phases: [
    { title: 'Subsystem deep-read', detail: 'parallel readers over each crate + web + infra' },
    { title: 'Cross-cutting analysis', detail: 'security, performance, quality, doc-accuracy lenses' },
    { title: 'Synthesis', detail: 'assemble the complete report' },
  ],
}

const ROOT = '/home/succeedex/projects/ZeroCode'

const SUBSYSTEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'one_liner', 'purpose', 'key_files', 'architecture', 'notable_details', 'external_deps', 'concerns'],
  properties: {
    name: { type: 'string' },
    one_liner: { type: 'string', description: 'one sentence summary' },
    purpose: { type: 'string', description: '2-4 sentences on what this subsystem does and why it exists' },
    key_files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'role'],
        properties: { path: { type: 'string' }, role: { type: 'string' } },
      },
    },
    architecture: { type: 'string', description: 'how it is structured internally; data flow; key types/traits/abstractions; control flow' },
    notable_details: { type: 'array', items: { type: 'string' }, description: 'clever, surprising, or important implementation details worth calling out' },
    external_deps: { type: 'array', items: { type: 'string' }, description: 'key external crates/libraries/services it relies on and why' },
    concerns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'note'],
        properties: { severity: { enum: ['high', 'medium', 'low', 'info'] }, note: { type: 'string' } },
      },
      description: 'bugs, risks, tech debt, or gaps observed',
    },
  },
}

const LENS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'summary', 'findings', 'strengths'],
  properties: {
    lens: { type: 'string' },
    summary: { type: 'string', description: 'overall assessment, 3-6 sentences' },
    strengths: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail', 'location'],
        properties: {
          severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          location: { type: 'string', description: 'file:line or area' },
        },
      },
    },
  },
}

// ---------- Phase 1: subsystem deep-reads ----------
phase('Subsystem deep-read')

const TAIL = '\n\nReturn a thorough structured analysis. Be concrete and cite file paths. This feeds a comprehensive engineering report on the project.'

const SUBSYSTEMS = [
  {
    key: 'core',
    prompt: `You are analyzing the ZeroCode platform (a sandboxed multi-language code-execution service in Rust). Deep-read the CORE crate at ${ROOT}/crates/zerocode-core/. Read EVERY .rs file: lib.rs, language.rs, limits.rs, payload.rs, registry.rs, status.rs, submission.rs, token.rs, error.rs, and Cargo.toml. Explain the domain model: how languages are represented and registered, how resource limits work, the submission/payload/token/status types, the registry. This crate is the shared domain vocabulary used by api/worker/sandbox. Be concrete: name the key structs/enums/traits and how they relate.`,
  },
  {
    key: 'sandbox',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read the SANDBOX crate at ${ROOT}/crates/zerocode-sandbox/. Read EVERY .rs file: lib.rs, naive.rs, wasm.rs, artifact.rs, kernel_check.rs, and Cargo.toml. This is the security-critical isolation layer. Explain: the sandbox trait/abstraction, the "naive" native sandbox (namespaces, cgroups, landlock, seccomp, capabilities via nix/caps/landlock/libseccomp/cgroups-rs/libcontainer), the WASM tier (wasmtime), how artifacts/compile output are handled, kernel capability detection. Detail exactly which isolation primitives are applied and where. Note any escape surface or gaps.`,
  },
  {
    key: 'api',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read the API crate at ${ROOT}/crates/zerocode-api/. Read EVERY .rs file in src/ and any subdirs (config.rs, db.rs, error.rs, main.rs, metrics_layer.rs, openapi.rs, state.rs, telemetry.rs, plus any routes/handlers — run a recursive listing first) and Cargo.toml. This is the public HTTP surface (axum). Explain: all routes/endpoints and what they do, request/response shapes, auth/rate-limiting (tower_governor), how submissions are enqueued, how results/status are fetched, the result cache integration, OpenAPI generation, error handling, config. Enumerate the endpoints explicitly.`,
  },
  {
    key: 'worker',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read the WORKER crate at ${ROOT}/crates/zerocode-worker/. Read EVERY .rs file: main.rs, runner.rs, db.rs, metrics.rs, queue_depth.rs, reaper.rs, retention.rs, sandbox_select.rs, sweeper.rs, telemetry.rs, and Cargo.toml. This consumes jobs from the apalis/Postgres queue and executes them in the sandbox. Explain: the job lifecycle, how a submission is compiled+run, sandbox tier selection (sandbox_select.rs), the reaper/sweeper/retention background tasks, queue depth tracking, metrics, concurrency model. Detail the full execution pipeline end to end.`,
  },
  {
    key: 'cache_stream_migrate',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read THREE small crates: (1) CACHE at ${ROOT}/crates/zerocode-cache/ (compile.rs, key.rs, lib.rs, result.rs) — the compile-artifact cache and result cache (moka + blake3 keys); (2) STREAM at ${ROOT}/crates/zerocode-stream/ (events.rs, jobs.rs, lib.rs) — job/event streaming; (3) MIGRATE at ${ROOT}/crates/zerocode-migrate/ (main.rs) — DB migration runner. Read every .rs file and each Cargo.toml. Explain cache key derivation, eviction, what is cached and TTLs, the streaming event model, and the migration tooling. Treat this as ONE combined subsystem report covering all three.`,
  },
  {
    key: 'web',
    prompt: `You are analyzing the ZeroCode platform. Deep-read the WEB frontend at ${ROOT}/web/. Read package.json, vite.config.ts, the build scripts (web/scripts/build.mjs, assemble-dist.mjs), and ALL source under web/app/src/ (shared/, playground/, landing/). Also glance at web/docs/. Explain: the two apps (landing + playground), how it is built (Vite multi-entry, the assemble-dist step), the Monaco-based editor, how the frontend talks to the API (shared/api.ts), theming (note: light theme was recently removed per git log), and supported-language presentation. Do NOT attempt to build it.`,
  },
  {
    key: 'infra',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read the INFRASTRUCTURE/DEPLOY layer at ${ROOT}. Read: deploy/docker-compose.yml, deploy/Dockerfile.service, deploy/Dockerfile.worker, deploy/worker-entrypoint.sh, deploy/apparmor/zerocode-worker; runners/Dockerfile, runners/Dockerfile.slim, runners/languages.toml (the supported-language definitions — count them and list them; note languages.toml.bak60 is a historical 60-language set), runners/csharp-build.sh, runners/cob_xml_quiet.c; all migrations/*.sql; .github/workflows/*.yml; .env.example; rust-toolchain.toml; deny.toml. Explain: the container topology (service vs worker images, read-only rootfs), how languages/toolchains are provisioned, the DB schema (from migrations), CI/CD, AppArmor profile, and how the whole thing is deployed. Enumerate the supported languages.`,
  },
  {
    key: 'docs_bench',
    prompt: `You are analyzing the ZeroCode platform (sandboxed code execution in Rust). Deep-read the DOCUMENTATION and BENCHMARKS at ${ROOT}. Read: README.md, docs/ARCHITECTURE.md, docs/PERFORMANCE.md (skip the .pdf), all of scripts/ (benchmark.sh, load-test.sh, smoke-test.sh, smoke-languages.sh, report-languages.sh, mem-report.sh, coldstart-core.sh, coldstart-report.sh, build-runner-tags.sh, generate-sdks.sh), and benchmarks/ (criterion setup, benchmarks/programs/, benchmarks/data/). Summarize: the project's self-described architecture and value proposition, the claimed performance characteristics and how they're measured, the benchmark/load-test/smoke-test tooling, and SDK generation. Capture concrete claimed numbers (throughput, latency, cold-start, memory) so they can later be checked against the code.`,
  },
]

const subsystemMaps = await parallel(
  SUBSYSTEMS.map((s) => () =>
    agent(s.prompt + TAIL, {
      label: `read:${s.key}`,
      phase: 'Subsystem deep-read',
      schema: SUBSYSTEM_SCHEMA,
    })
  )
)

const validMaps = subsystemMaps.filter(Boolean)
const mapsDigest = validMaps
  .map((m) => `### Subsystem: ${m.name}\n${m.one_liner}\nPURPOSE: ${m.purpose}\nKEY FILES: ${m.key_files.map((f) => f.path + ' (' + f.role + ')').join('; ')}\nARCHITECTURE: ${m.architecture}\nNOTABLE: ${(m.notable_details || []).join(' | ')}\nDEPS: ${(m.external_deps || []).join(', ')}\nCONCERNS: ${(m.concerns || []).map((c) => '[' + c.severity + '] ' + c.note).join(' | ')}`)
  .join('\n\n')

// ---------- Phase 2: cross-cutting lenses ----------
phase('Cross-cutting analysis')

const LENS_TAIL = '\n\n--- SUBSYSTEM MAP (from phase 1; use as a guide but VERIFY against source) ---\n' + mapsDigest + '\n--- END MAP ---\n\nReturn a structured lens report. Severity-rate each finding. Cite file:line where possible. Be rigorous and skeptical; prefer concrete, verifiable findings over speculation.'

const LENSES = [
  {
    key: 'security',
    prompt: `You are a security engineer reviewing the ZeroCode platform, which COMPILES AND RUNS UNTRUSTED USER CODE in ~20 languages. Sandbox integrity is the highest-stakes property. INDEPENDENTLY re-read the security-critical code: ${ROOT}/crates/zerocode-sandbox/ (naive.rs, wasm.rs, kernel_check.rs), ${ROOT}/crates/zerocode-worker/ (runner.rs, sandbox_select.rs), the ${ROOT}/crates/zerocode-api/ HTTP surface (auth, rate limiting, input/size validation), and ${ROOT}/deploy/ (apparmor profile, container hardening, compose privileges, read-only rootfs). Assess: sandbox escape surface, syscall filtering (seccomp), filesystem isolation (landlock), namespace/cgroup setup, network isolation, capability dropping, resource-exhaustion / fork-bomb / memory-bomb defenses, secrets handling, and any TOCTOU or privilege gaps. Flag missing hardening. Rate findings critical/high/medium/low/info.`,
  },
  {
    key: 'performance',
    prompt: `You are a performance/scalability engineer reviewing the ZeroCode platform. INDEPENDENTLY read the hot paths: ${ROOT}/crates/zerocode-worker/ (runner.rs, queue_depth.rs, the concurrency model), ${ROOT}/crates/zerocode-cache/ (compile + result cache), ${ROOT}/crates/zerocode-api/ (db pool, handlers), the apalis/Postgres queue usage, and docs/PERFORMANCE.md. Assess: throughput and latency ceilings, the two known bottlenecks (worker vCPU count, API DB pool size), cold-start cost, compile-cache effectiveness (helps binaries, not JVM/.NET), memory footprint per execution, cgroup limit sizing, connection pooling, and any obvious inefficiencies or contention points. Check whether the code matches the performance claims in docs. Rate findings.`,
  },
  {
    key: 'quality',
    prompt: `You are a staff engineer reviewing code quality and maintainability of the ZeroCode Rust workspace plus web frontend. INDEPENDENTLY survey: error handling (anyhow/thiserror usage), test coverage (search for #[cfg(test)], integration tests, the smoke/load scripts), unwrap/expect/panic usage in production paths, code duplication across crates, the workspace dependency hygiene (deny.toml, Cargo.lock pins like the wasmtime 27 / apalis rc pins), API/worker shared-type discipline via zerocode-core, logging/observability (tracing, metrics), config management, and overall idiomatic Rust. Also assess the frontend code quality briefly. Identify the biggest maintainability risks and tech debt. Rate findings.`,
  },
  {
    key: 'docs_accuracy',
    prompt: `You are a technical reviewer checking whether the ZeroCode documentation matches reality. INDEPENDENTLY compare claims in README.md and docs/ARCHITECTURE.md and docs/PERFORMANCE.md against the actual code. Specifically verify: (1) the supported-language count and list (docs/git say it was trimmed 60 to 20 to 11; what does runners/languages.toml ACTUALLY contain now?), (2) the architecture description (crates, queue, sandbox tiers) vs the real crate layout, (3) any performance numbers vs the benchmark tooling, (4) endpoint/API documentation vs actual routes, (5) stale references to removed features (e.g. gRPC tier, light theme, OTLP tracing). List concrete doc-vs-code discrepancies as findings, rated by how misleading they are.`,
  },
]

const lensReports = await parallel(
  LENSES.map((l) => () =>
    agent(l.prompt + LENS_TAIL, {
      label: `lens:${l.key}`,
      phase: 'Cross-cutting analysis',
      schema: LENS_SCHEMA,
    })
  )
)

const validLenses = lensReports.filter(Boolean)
const lensDigest = validLenses
  .map((l) => `### Lens: ${l.lens}\nSUMMARY: ${l.summary}\nSTRENGTHS: ${(l.strengths || []).join(' | ')}\nFINDINGS:\n${(l.findings || []).map((f) => `  - [${f.severity}] ${f.title} (${f.location}): ${f.detail}`).join('\n')}`)
  .join('\n\n')

// ---------- Phase 3: synthesis ----------
phase('Synthesis')

const fullMaps = validMaps
  .map((m) => JSON.stringify(m, null, 1))
  .join('\n\n')

const synthPrompt = `You are the lead engineer writing the DEFINITIVE analysis report for the ZeroCode project — a sandboxed, multi-language remote code-execution platform written in Rust (a Judge0/Piston-class system) with an Astro/React web frontend.

You are given (A) detailed per-subsystem structured maps and (B) four cross-cutting lens reports (security, performance, code quality, documentation accuracy), all produced by engineers who read the actual source. Synthesize them into ONE cohesive, well-structured Markdown report. Do not just concatenate — integrate, deduplicate, and reconcile. Where lenses disagree or overlap, resolve it.

The report MUST include these sections:
1. **Executive Summary** — what ZeroCode is, its maturity, and your overall verdict in a few paragraphs.
2. **What It Does** — the product/value proposition and core capabilities.
3. **Architecture Overview** — the workspace crates and how they fit together (request -> API -> queue -> worker -> sandbox -> result), the data stores, the sandbox tiers. Include a concise ASCII/text component-and-flow diagram.
4. **Subsystem Breakdown** — one subsection per subsystem (core, sandbox, api, worker, cache/stream/migrate, web, infra/deploy, docs/bench) covering purpose, key files, and how it works.
5. **Technology Stack** — languages, key crates, frameworks, datastores, infra.
6. **Security Posture** — sandbox isolation model and the security findings, honestly rated. This is the most important quality section for this kind of system.
7. **Performance & Scalability** — claimed characteristics, real bottlenecks, cache behaviour.
8. **Code Quality & Maintainability** — testing, error handling, tech debt.
9. **Documentation Accuracy** — concrete doc-vs-code discrepancies.
10. **Key Risks & Findings** — a single consolidated, severity-sorted table of the most important findings across all lenses (columns: Severity | Area | Finding | Location).
11. **Recommendations** — prioritized, actionable next steps (quick wins vs larger efforts).

Be specific and cite file paths. Be honest about both strengths and weaknesses. Aim for a thorough but readable report (roughly 1500-2800 words). Output ONLY the Markdown report.

===== (A) SUBSYSTEM MAPS =====
${fullMaps}

===== (B) CROSS-CUTTING LENS REPORTS =====
${lensDigest}
`

const report = await agent(synthPrompt, { label: 'synthesize-report', phase: 'Synthesis' })

return {
  report,
  subsystemCount: validMaps.length,
  lensCount: validLenses.length,
  totalFindings: validLenses.reduce((n, l) => n + (l.findings ? l.findings.length : 0), 0),
}
