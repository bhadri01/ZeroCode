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
| 110 | Fortran | accepted | 1.0 | 128 | 123× |
| 111 | Pascal | accepted | 1.1 | 128 | 121× |
| 112 | D | accepted | 2.8 | 768 | 276× |
| 113 | Objective-C | accepted | 1.0 | 128 | 134× |
| 114 | Assembly | accepted | 0.8 | 128 | 161× |
| 115 | Ada | accepted | 3.8 | 128 | 33× |
| 120 | Kotlin | accepted | 24.6 | 1024 | 42× |
| 121 | Scala | accepted | 38.0 | 1024 | 27× |
| 122 | Groovy | accepted | 54.3 | 256 | 5× |
| 123 | Clojure | accepted | 59.4 | 256 | 4× |
| 130 | Haskell | accepted | 20.0 | 1024 | 51× |
| 131 | OCaml | accepted | 2.9 | 128 | 44× |
| 132 | Erlang | accepted | 48.3 | 128 | 3× |
| 133 | Elixir | accepted | 59.5 | 192 | 3× |
| 134 | Common Lisp | accepted | 15.1 | 96 | 6× |
| 140 | C# | accepted | 24.8 | 512 | 21× |
| 141 | F# | accepted | 165.9 | 512 | 3× |
| 150 | COBOL | accepted | 2.3 | 128 | 55× |
| 151 | Prolog | accepted | 9.1 | 96 | 10× |
| 152 | Swift | accepted | 7.0 | 1024 | 146× |
| 153 | Octave | accepted | 49.4 | 128 | 3× |
| 154 | SQL | non_zero_exit | 2.3 | 64 | 27× |
| 161 | Nim | accepted | 0.9 | 512 | 585× |
| 162 | Crystal | accepted | 3.2 | 1024 | 315× |
| 163 | Dart | accepted | 13.1 | 768 | 59× |
| 164 | Julia | accepted | 279.1 | 512 | 2× |
| 170 | Racket | accepted | 145.8 | 384 | 3× |
| 171 | Raku | accepted | 120.2 | 256 | 2× |
| 172 | AWK | accepted | 1.5 | 64 | 42× |
| 173 | CoffeeScript | accepted | 22.4 | 256 | 11× |
| 174 | Forth | accepted | 1.6 | 64 | 40× |
| 176 | Emacs Lisp | accepted | 50.4 | 192 | 4× |
| 177 | Verilog | accepted | 2.5 | 256 | 101× |
| 178 | LLVM IR | accepted | 73.6 | 192 | 3× |
| 179 | V | accepted | 1.3 | 512 | 384× |
| 180 | FreeBASIC | accepted | 0.8 | 512 | 615× |
| 181 | PowerShell | accepted | 81.8 | 384 | 5× |
| 182 | Pony | accepted | 1.7 | 1024 | 620× |
| 300 | Brainfuck | accepted | 5.0 | 64 | 13× |
| 301 | GolfScript | accepted | 14.5 | 96 | 7× |
| 302 | CJam | accepted | 23.8 | 256 | 11× |
| 303 | Vyxal | accepted | 95.5 | 192 | 2× |
| 305 | Samarium | accepted | 9.1 | 192 | 21× |
| 306 | Paradoc | accepted | 19.4 | 192 | 10× |

**58 languages.** Total actual peak (if all ran once, serially): **1866 MB**.  Total reserved (if all ran concurrently): **18144 MB**.

- Mean actual per simple run: **32.2 MB**;  mean reserved: **313 MB**.
- Heaviest actual: **Julia** at **279.1 MB**.
- Aggregate over-reservation: **9.7×** (reserved 18144 MB vs actual 1866 MB).

---

## Why compiled languages keep high reserved limits

For a compiled language, compile and run share **one cgroup** with a single
`memory.max = default_limits.memory_mb`, so the limit must cover the **compiler**
(the bigger consumer). The `actual` column above can understate that need: when a
compile artifact is cached, the measured peak is run-only (e.g. Pony 1.7 MB,
Swift 7 MB). The real, uncached compile of `kotlinc`/`ghc`/`swiftc`/`ponyc` needs
the headroom — so compiled-language limits are intentionally left high.

Only **interpreted** languages (single run phase, no compiler) were right-sized.
`default_limits` is just the default; a submission can still request more memory
up to the configured ceiling.

A future option is per-phase limits (apply the larger `compile_limits` during
compile, then shrink `memory.max` to a small run limit) so compiled languages
could reserve little for the run too — that's a sandbox change, not config.
