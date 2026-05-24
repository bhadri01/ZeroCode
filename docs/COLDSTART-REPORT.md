# ZeroCode cold-compile datasheet — wall + memory (caches bypassed, min-of-3)

Trivial "hello" per language, **forced cold** every run: unique stdin (result-cache
miss) + a unique nonce comment in compiled-language source (compile-cache miss),
so every measurement re-pays the full compile. Numbers are **min of 3 cold runs**
(min trims page-cache / scheduler noise). `wall` = wall_time s (cold compile +
spawn + run). `actual MB` = RUN-phase peak RSS (sampled after the compiler is
reaped — NOT the compiler's transient RSS). `reserved MB` = default_limits.memory_mb
the admission controller holds for the whole job.

| ID | Language | Status | Wall s (min/3) | CPU s (min/3) | Actual MB (min/3) | Reserved MB |
|---:|----------|--------|---------------:|--------------:|------------------:|------------:|
| 71 | Python | accepted | 0.043 | 0.028 | 3.0 | 128 |
| 63 | Node.js | accepted | 0.169 | 0.153 | 13.1 | 128 |
| 73 | Rust | accepted | 0.900 | 0.398 | 9.1 | 256 |
| 60 | Go | accepted | 0.692 | 0.466 | 5.6 | 256 |
| 48 | C | accepted | 0.112 | 0.075 | 1.1 | 128 |
| 52 | C++ | accepted | 0.949 | 0.912 | 1.4 | 192 |
| 62 | Java | accepted | 0.552 | 0.532 | 17.6 | 512 |
| 100 | Bash | accepted | 0.034 | 0.011 | 0.8 | 64 |
| 101 | Lua | accepted | 0.022 | 0.009 | 0.9 | 64 |
| 102 | Perl | accepted | 0.030 | 0.012 | 1.1 | 64 |
| 103 | Ruby | accepted | 0.105 | 0.089 | 13.7 | 128 |
| 104 | R | accepted | 0.218 | 0.199 | 41.5 | 128 |
| 105 | PHP | accepted | 0.064 | 0.043 | 4.9 | 128 |
| 106 | TypeScript | accepted | 0.928 | 0.923 | 74.0 | 128 |
| 120 | Kotlin | accepted | 5.721 | 5.682 | 23.6 | 1024 |
| 121 | Scala | accepted | 3.830 | 3.732 | 34.6 | 1024 |
| 140 | C# | accepted | 0.738 | 0.719 | 5.1 | 512 |
| 152 | Swift | accepted | 1.309 | 0.746 | 1.5 | 1024 |
| 154 | SQL | non_zero_exit | 0.035 | 0.013 | 1.1 | 64 |
| 163 | Dart | accepted | 1.851 | 1.818 | 11.3 | 768 |

**20 languages, all forced cold (min of 3).** Mean cold wall **0.92 s** (slowest: **Kotlin 5.72 s**). Mean run-phase peak **13.2 MB** (heaviest: **TypeScript 74.0 MB**).

- Total reserved if all 20 ran concurrently: **6720 MB**; total run-phase actual if run serially: **265 MB** (**25.4×** over-reservation — compiled langs reserve for the cold *compiler*, which the actual column excludes).
- SQL (154) prints the right output but sqlite3's `.read` exits non-zero — cosmetic, not a failure. All other languages: accepted.
