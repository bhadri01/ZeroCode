# ZeroCode memory report — actual vs reserved (cache bypassed)

Trivial "hello" program per language. `actual` = cgroup memory.peak
(the `memory` field, KB→MB). `reserved` = default_limits.memory_mb, the
amount the worker admission controller holds for the whole job.

| ID | Language | Status | Actual MB | Reserved MB | Reserved/Actual |
|---:|----------|--------|----------:|------------:|----------------:|
| 71 | Python | accepted | 6.2 | 128 | 21× |
| 63 | Node.js | accepted | 55.8 | 128 | 2× |
| 73 | Rust | accepted | 8.9 | 128 | 14× |
| 60 | Go | accepted | 4.6 | 384 | 84× |
| 48 | C | accepted | 0.8 | 128 | 155× |
| 52 | C++ | accepted | 0.9 | 128 | 148× |
| 62 | Java | accepted | 50.3 | 512 | 10× |
| 100 | Bash | accepted | 1.0 | 64 | 63× |
| 101 | Lua | accepted | 1.2 | 64 | 55× |
| 102 | Perl | accepted | 1.1 | 64 | 56× |
| 103 | Ruby | accepted | 18.6 | 128 | 7× |
| 104 | R | accepted | 56.1 | 128 | 2× |
| 105 | PHP | accepted | 9.2 | 128 | 14× |
| 106 | TypeScript | accepted | 91.1 | 128 | 1× |
| 120 | Kotlin | accepted | 24.6 | 1024 | 42× |
| 121 | Scala | accepted | 38.0 | 1024 | 27× |
| 140 | C# | accepted | 24.8 | 512 | 21× |
| 152 | Swift | accepted | 7.0 | 1024 | 146× |
| 154 | SQL | non_zero_exit | 2.3 | 64 | 27× |
| 163 | Dart | accepted | 13.1 | 768 | 59× |

**20 languages.** Total actual peak (if all ran once, serially): **416 MB**.  Total reserved (if all ran concurrently): **6656 MB**.

- Mean actual per simple run: **20.8 MB**;  mean reserved: **333 MB**.
- Heaviest actual: **TypeScript** at **91.1 MB**.
- Aggregate over-reservation: **16×** (reserved 6656 MB vs actual 416 MB).

---

## Why compiled languages keep high reserved limits

For a compiled language, compile and run share **one cgroup** with a single
`memory.max = default_limits.memory_mb`, so the limit must cover the **compiler**
(the bigger consumer). The `actual` column above can understate that need: when a
compile artifact is cached, the measured peak is run-only (e.g. Swift 7 MB,
Dart 13 MB). The real, uncached compile of `kotlinc`/`scalac`/`swiftc` needs
the headroom — so compiled-language limits are intentionally left high.

Only **interpreted** languages (single run phase, no compiler) were right-sized.
`default_limits` is just the default; a submission can still request more memory
up to the configured ceiling.

A future option is per-phase limits (apply the larger `compile_limits` during
compile, then shrink `memory.max` to a small run limit) so compiled languages
could reserve little for the run too — that's a sandbox change, not config.
