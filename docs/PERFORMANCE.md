# ZeroCode performance datasheet

> Measured against the live stack on **2026-08-01**. Two independent datasets:
> a **per-language profile** (all 20 languages, cold vs warm) and a
> **production-shaped benchmark** (7 languages × 30 real coding questions,
> 2,394 graded submissions, concurrency ramped 1 → 40, plus a 30-minute soak).
>
> Raw data:
> [`coldwarm.csv`](../benchmarks/data/coldwarm.csv) (per-language cold vs warm) ·
> [`graded.csv`](../benchmarks/data/graded.csv) (latency + overhead split) ·
> [`ramp.csv`](../benchmarks/data/ramp.csv) (concurrency ramp) ·
> [`languages.csv`](../benchmarks/data/languages.csv) (complexity profile, a
> separate synthetic workload from `scripts/benchmark.sh`) ·
> [`throughput.csv`](../benchmarks/data/throughput.csv) (saturation sweep).

This sheet answers three questions:

1. **What does a submission cost**, per language, cold and warm.
2. **Where does the server saturate** as concurrent submissions climb.
3. **What should you size, and in what order**, to scale it.

---

## TL;DR

- **A warm submission costs 54–342 ms end to end** across all 20 languages —
  queueing, sandbox construction, execution and result write-back included.
  Actual execution is 10–500 ms of that; the rest is a flat ~50 ms floor.
- **The compile cache is the dominant lever, and it now covers every compiled
  language.** Cold-to-warm: Kotlin 5.91 s → 0.33 s, Scala 3.94 s → 0.34 s,
  Dart 3.38 s → 0.16 s, C++ 1.55 s → 0.06 s. JVM and .NET languages benefit
  as much as single-binary ones — the cache stores the whole post-compile
  directory, not just one executable.
- **Throughput is flat across languages: 70–79 req/s peak**, whatever the
  language. That flatness is the point — it says the ceiling is the platform,
  not the toolchain. Peak lands at concurrency 10–20 on a 4-vCPU host.
- **The first submission of any given solution is the expensive one.** Everything
  after it hits the cache. Pre-warm before a timed exam; see
  [Cold starts](#cold-starts-and-pre-warming).
- **The binding scaling limit today is Postgres connections, not CPU** — the
  current topology sits at 96 of 100. See [Bottlenecks](#bottlenecks-in-priority-order).

---

## Test environment

| | |
|---|---|
| Host | 4 vCPU, 15 GiB RAM (shared dev box) |
| Topology | 1 API + 3 workers + Postgres 16, `deploy/docker-compose.yml` |
| Worker parallelism | `ZEROCODE_MAX_PARALLEL` unset → `available_parallelism()` = **4 per worker** |
| API DB pools | query **24**, listener **48** (`crates/zerocode-api/src/state.rs`) |
| Worker DB pool | parallelism + 4 = **8 each** |
| Sandbox | NativeSandbox (cgroup v2 + userns + landlock + seccomp + pivot_root) |
| Per-sandbox CPU | `cpu.max = 100000 100000` — one full core each |

Numbers are **machine-specific**. They scale with vCPU count (worker
parallelism) and connection limits. Use the *shape* — where it saturates, the
relative per-language costs, the cold/warm ratio — rather than absolute req/s,
when sizing other hardware.

---

## How `time` is measured

| Field | Meaning |
|---|---|
| `time` | CPU seconds of the **run phase only**. For compiled languages the compiler's CPU is excluded. |
| `compile_time` | Wall-clock of the **compile phase**. Absent for interpreted languages and for compile-cache hits. |
| `wall_time` | Wall-clock for the whole submission, compile included. |
| `memory` | Peak resident memory of the **run phase**; the compiler's footprint is excluded. |

The two phases are billed separately at the compile→run barrier. This matters
twice over: `time` describes the submitted program rather than our toolchain,
and the submission's `cpu_time_limit` is charged only for the run — a slow
compile cannot push an otherwise fine program over its budget.

The compile phase also has its **own** wall budget
(`compile_limits.wall_time`), and the run phase's budget restarts from the
barrier. So a slow compile can never surface as `time_limit_exceeded` against
the student's program.

---

## Per-language datasheet

All 20 registered languages, same workload: read an integer from stdin, print
`n × 2`. That isolates fixed cost — toolchain startup, sandbox construction,
I/O — from algorithmic work.

**cold** = a source never seen before, so the compile cache misses and a real
compile runs. **warm** = the same source with different stdin, so the compile
cache hits while the API result cache does not. Warm figures are the median of
three real executions.

| ID | Language | cold e2e | compile | **warm e2e** | exec | memory |
|---:|---|---:|---:|---:|---:|---:|
| 100 | Bash | 0.08 s | — | **0.058 s** | 12.0 ms | 1.1 MB |
| 101 | Lua | 0.06 s | — | **0.058 s** | 14.3 ms | 0.9 MB |
| 102 | Perl | 0.07 s | — | **0.065 s** | 13.6 ms | 1.1 MB |
| 154 | SQL | 0.07 s | — | **—** | 14.0 ms | 1.2 MB |
| 48 | C | 0.25 s | 0.17 s | **0.054 s** | 10.7 ms | 0.9 MB |
| 52 | C++ | 1.55 s | 1.47 s | **0.057 s** | 12.4 ms | 1.0 MB |
| 152 | Swift | 1.20 s | 1.13 s | **0.068 s** | 21.5 ms | 1.3 MB |
| 71 | Python | 0.08 s | — | **0.069 s** | 24.1 ms | 3.2 MB |
| 105 | PHP | 0.09 s | — | **0.083 s** | 35.0 ms | 4.7 MB |
| 60 | Go | 1.16 s | 1.00 s | **0.088 s** | 14.5 ms | 5.0 MB |
| 63 | Node.js | 0.12 s | — | **0.104 s** | 53.2 ms | 8.1 MB |
| 73 | Rust | 1.16 s | 0.96 s | **0.108 s** | 21.8 ms | 9.0 MB |
| 140 | C# | 1.09 s | 0.95 s | **0.109 s** | 71.3 ms | 5.9 MB |
| 103 | Ruby | 0.20 s | — | **0.131 s** | 84.3 ms | 13.7 MB |
| 62 | Java | 0.67 s | 0.52 s | **0.136 s** | 96.1 ms | 19.2 MB |
| 163 | Dart | 3.38 s | 2.80 s | **0.164 s** | 37.9 ms | 13.4 MB |
| 104 | R | 0.34 s | — | **0.267 s** | 204.7 ms | 41.8 MB |
| 120 | Kotlin | 5.91 s | 5.58 s | **0.332 s** | 254.0 ms | 25.6 MB |
| 121 | Scala | 3.94 s | 3.56 s | **0.342 s** | 320.1 ms | 35.1 MB |
| 106 | TypeScript | 0.57 s | — | **0.533 s** | 506.9 ms | 58.5 MB |

All 20 produced correct output on both the cold and warm passes.

### Reading the table

- **There is a ~50 ms floor.** The fastest languages land at 54–58 ms warm, and
  almost none of that is the program — C executes in 10.7 ms. The rest is
  queue → claim → sandbox construction (namespaces, cgroup, pivot_root,
  landlock, seccomp) → execute → write back → notify.
- **Compiled languages converge on that floor once warm.** C++ warm (57 ms) is
  indistinguishable from Bash (58 ms), because neither is compiling.
- **`compile` is the whole story for cold cost.** It is 85–95% of every cold
  number in the table.
- **TypeScript is the outlier**, and it is execution, not compile: `tsx`
  type-checks and transpiles inside the run phase, so it pays 507 ms every
  time with nothing to cache.
- **Memory tracks runtime weight**, not compile weight: interpreted and
  native-binary languages sit under 10 MB; JVM/.NET/R land at 19–42 MB;
  TypeScript's Node process is the heaviest at 58 MB.

---

## Production-shaped benchmark

The datasheet above measures fixed cost. This measures the thing that actually
matters: **real coding-question solutions, graded**. 30 active questions solved
in 7 languages — 210 solution units, 1,197 test cases, 2,394 graded
submissions.

### Latency at rest (concurrency 6)

End-to-end wall clock for one graded submission: queueing, compile, execution,
and network. This is a student pressing Run while a few others are.

| Language | p50 | p95 | p99 |
|---|---:|---:|---:|
| C | 140 ms | 224 ms | 408 ms |
| C++ | 152 ms | 277 ms | 380 ms |
| Python | 174 ms | 262 ms | 303 ms |
| JavaScript | 217 ms | 443 ms | 606 ms |
| Go | 221 ms | 368 ms | 453 ms |
| Java | 248 ms | 416 ms | 656 ms |
| Rust | 265 ms | 453 ms | 802 ms |

### Where the time goes

Splitting the median into engine-reported execution versus everything else —
queueing, sandbox construction, orchestration, network.

| Language | exec | overhead | overhead share |
|---|---:|---:|---:|
| C | 12.2 ms | 127 ms | 91% |
| C++ | 14.2 ms | 138 ms | 91% |
| Go | 17.7 ms | 203 ms | 92% |
| Rust | 25.7 ms | 240 ms | 90% |
| Python | 28.6 ms | 145 ms | 84% |
| JavaScript | 57.5 ms | 160 ms | 74% |
| Java | 69.5 ms | 178 ms | 72% |

**Execution is trivial; overhead dominates.** That is the expected shape for a
sandboxed engine — the isolation work (six namespaces, a cgroup, pivot_root,
landlock, seccomp, per-job tmpfs) is the cost, and it is roughly constant at
127–240 ms under this concurrency. It is also where any future latency work
should go: shaving execution has almost no leverage.

### Under load

40 submissions per level, ramped 1 → 40, per language.

**Throughput (req/s) by concurrency:**

| Language | 1 | 2 | 5 | 10 | 20 | 40 | peak |
|---|---:|---:|---:|---:|---:|---:|---:|
| C | 33.5 | 57.7 | 69.5 | 69.5 | 70.0 | 59.4 | **70** |
| C++ | 32.1 | 50.6 | 66.6 | 70.4 | 61.5 | 63.2 | **70** |
| Rust | 31.7 | 55.4 | 63.6 | 70.7 | 67.1 | 68.0 | **71** |
| Go | 33.5 | 58.7 | 68.2 | 71.9 | 78.9 | 58.5 | **79** |
| Java | 30.1 | 45.7 | 51.9 | 75.2 | 77.7 | 58.8 | **78** |
| JavaScript | 26.5 | 56.1 | 62.2 | 70.5 | 62.6 | 61.7 | **71** |
| Python | 26.3 | 41.9 | 65.8 | 70.7 | 75.5 | 67.6 | **75** |

**p99 latency (ms) by concurrency:**

| Language | 1 | 2 | 5 | 10 | 20 | 40 |
|---|---:|---:|---:|---:|---:|---:|
| C | 86 | 70 | 109 | 204 | 332 | 653 |
| C++ | 75 | 60 | 118 | 178 | 493 | 548 |
| Rust | 102 | 55 | 103 | 182 | 400 | 442 |
| Go | 76 | 47 | 108 | 227 | 327 | 562 |
| Java | 223 | 64 | 167 | 175 | 253 | 561 |
| JavaScript | 348 | 51 | 123 | 222 | 354 | 554 |
| Python | 179 | 99 | 111 | 193 | 392 | 461 |

**The ceiling is flat at 70–79 req/s regardless of language**, and p99 stays
under 700 ms even at 40 concurrent. Flatness across languages is the useful
signal: it means throughput is bounded by the platform (worker slots, sandbox
construction, connections) rather than by any toolchain, so capacity planning
does not need a per-language model. Throughput peaks at concurrency 10–20 and
dips slightly at 40, where 40 in-flight submissions contend for 12 worker slots
on 4 vCPU.

### Stability soak

35 rounds over 30 minutes, a small burst in 4 languages every 45 seconds —
1,680 submissions.

| Language | median | wrong answers |
|---|---:|---:|
| Go | 91 ms | 0 |
| Rust | 75 ms | 0 |
| C++ | 79 ms | 0 |
| Python | 76 ms | 0 |

Medians held in a 75–91 ms band for the full 30 minutes. Six submissions
exceeded 3 s and **all of them were in round 1** — C++ at a 14.3 s median on
the first round, then 79 ms for the remaining 34. That is cold-start cost, and
it is the subject of the next section.

---

## Cold starts and pre-warming

The first submission of a given `(language, source)` pays a full compile;
everything identical afterwards hits the cache. From the datasheet above, that
gap is:

| Language | first submission | cached | ratio |
|---|---:|---:|---:|
| Kotlin | 5.91 s | 0.332 s | 18× |
| Scala | 3.94 s | 0.342 s | 12× |
| Dart | 3.38 s | 0.164 s | 21× |
| C++ | 1.55 s | 0.057 s | 27× |
| Go | 1.16 s | 0.088 s | 13× |
| Rust | 1.16 s | 0.108 s | 11× |

Two consequences worth designing around:

1. **Benchmarking a cold run against a warm one shows a 10–25× "slowdown" that
   is really cache miss versus cache hit.** It looks selective by language,
   because compile cost is — interpreted languages show no gap at all. It is
   not a subset of workers degrading: there are no per-language workers, every
   worker serves every language from one queue.
2. **Many concurrent first-time submissions of the same new solution all miss
   together**, and compiling N copies at once is much slower than one.

**Pre-warm before a timed exam.** Submit each solution once in advance. The
compile cache is keyed on `(language_id, source)` and is not evicted, so one
warm-up per solution covers every test case that runs against it later.

To check warmth from outside, poll `GET /v1/health/languages`. Each language
reports `state` (`ok` / `cold` / `degraded` / `no_data`), `warm_ratio`, p50/p95
wall, and `fault_ratio`. `cold` means first-run solutions are paying compile
cost — expected, and fixed by pre-warming. `degraded` means engine faults were
observed and an exam should not start.

---

## Bottlenecks, in priority order

### 1. Postgres connections — the binding limit today

```
max_connections = 100
API:      24 (query pool) + 48 (listener pool) = 72
workers:   3 × (parallelism 4 + 4)             = 24
                                          total = 96 / 100
```

A fourth worker (+8) exceeds the limit. This — not CPU — is what stops you
adding workers right now. Raise `max_connections`, or put PgBouncer in front.

### 2. CPU is 3× oversubscribed

Three workers × parallelism 4 = **12 concurrent sandboxes on 4 vCPU**, each
entitled to a full core. `parallelism` defaults to the whole host's core count
and each replica computes it independently. On this host, 3 workers ×
parallelism 2 would match the hardware. Set `ZEROCODE_MAX_PARALLEL` explicitly
per replica rather than letting each one guess.

### 3. Memory admission does not coordinate across replicas

Each worker sets its budget to 60% of `MemAvailable` independently — all three
logged `memory_budget_mb: 5646`, i.e. **16.9 GB of "budget" on a 15 GB host**.
The semaphores bound each worker; nothing bounds the host. Set
`ZEROCODE_MEMORY_BUDGET_MB` explicitly to that replica's real share.

### 4. The compile-artifact cache grows without bound

`compile_artifacts` is never purged — `CompileCache::purge_before` exists but
has no callers, and the retention job only touches `submissions`. Artifacts are
large for some languages (Rust ~4.2 MB each, Go ~2.1 MB, versus ~31 KB for
C++). Add a TTL sweep before scaling traffic up.

### Recommended order

1. Raise `max_connections` / add PgBouncer — nothing else helps until this moves.
2. Add worker replicas with **explicit** `ZEROCODE_MAX_PARALLEL` and
   `ZEROCODE_MEMORY_BUDGET_MB` per node.
3. Move workers onto their own hosts; they need only Postgres reachability and
   the runner rootfs volume.
4. Then API replicas — but move the result cache to a shared store first, or
   its hit rate shards across replicas.

### Autoscaling signals

The worker publishes the inputs on a 5 s poll:

```
utilisation = zerocode_active_sandboxes / zerocode_worker_parallelism
queue_ratio = zerocode_pending_jobs / (parallelism × worker_count)

scale up   when queue_ratio > 1
scale down when utilisation < 0.25 sustained AND pending_jobs == 0
```

Backpressure is layered: submissions shed at queue depth > 5,000 (503 +
`Retry-After`), and `/v1/ready` flips at > 10,000 so a load balancer pulls the
instance before it collapses.

---

## Reproduce

```bash
# Per-language complexity profile -> benchmarks/data/languages.csv
./scripts/benchmark.sh languages

# Saturation sweep -> benchmarks/data/throughput.csv
./scripts/benchmark.sh throughput

# Both
./scripts/benchmark.sh all
```

Cold-start figures require an empty compile cache for the source under test.
`scripts/coldstart-report.sh` does this correctly by appending a unique comment
per run, which changes the cache key without changing the program. Re-running
`benchmark.sh` against fixed sources measures the **warm** path after the first
pass, so do not read its output as cold-start cost.
