# ZeroCode memory report — actual vs reserved (cache bypassed)

Trivial "hello" program per language. `actual` = cgroup memory.peak
(the `memory` field, KB→MB). `reserved` = default_limits.memory_mb, the
amount the worker admission controller holds for the whole job.

| ID | Language | Status | Actual MB | Reserved MB | Reserved/Actual |
|---:|----------|--------|----------:|------------:|----------------:|
| 71 | Python | accepted | 3.0 | 128 | 42× |
| 63 | Node.js | accepted | 50.2 | 128 | 3× |
| 73 | Rust | accepted | 128.0 | 128 | 1× |
| 60 | Go | accepted | 292.0 | 384 | 1× |
| 48 | C | accepted | 6.9 | 128 | 19× |
| 52 | C++ | accepted | 102.9 | 128 | 1× |
| 62 | Java | accepted | 85.8 | 512 | 6× |
| 100 | Bash | accepted | 0.9 | 128 | 141× |
| 101 | Lua | accepted | 0.8 | 128 | 167× |
| 102 | Perl | accepted | 1.2 | 128 | 105× |
| 103 | Ruby | accepted | 18.1 | 128 | 7× |
| 104 | R | accepted | 46.2 | 128 | 3× |
| 105 | PHP | accepted | 8.1 | 128 | 16× |
| 106 | TypeScript | accepted | 91.6 | 128 | 1× |
| 110 | Fortran | accepted | 10.2 | 128 | 13× |
| 111 | Pascal | accepted | 10.6 | 128 | 12× |
| 112 | D | accepted | 181.8 | 768 | 4× |
| 113 | Objective-C | accepted | 61.4 | 128 | 2× |
| 114 | Assembly | accepted | 2.7 | 128 | 48× |
| 115 | Ada | accepted | 15.5 | 128 | 8× |
| 120 | Kotlin | accepted | 448.6 | 1024 | 2× |
| 121 | Scala | accepted | 192.7 | 1024 | 5× |
| 122 | Groovy | accepted | 63.7 | 512 | 8× |
| 123 | Clojure | accepted | 59.3 | 512 | 9× |
| 130 | Haskell | accepted | 256.5 | 1024 | 4× |
| 131 | OCaml | accepted | 31.5 | 128 | 4× |
| 132 | Erlang | accepted | 66.1 | 128 | 2× |
| 133 | Elixir | accepted | 55.5 | 256 | 5× |
| 134 | Common Lisp | accepted | 15.8 | 128 | 8× |
| 140 | C# | accepted | 92.9 | 512 | 6× |
| 141 | F# | accepted | 160.5 | 1536 | 10× |
| 150 | COBOL | accepted | 2.1 | 128 | 61× |
| 151 | Prolog | accepted | 9.0 | 128 | 14× |
| 152 | Swift | accepted | 189.6 | 1024 | 5× |
| 153 | Octave | accepted | 49.6 | 128 | 3× |
| 154 | SQL | non_zero_exit | 1.8 | 128 | 69× |
| 161 | Nim | accepted | 79.4 | 512 | 6× |
| 162 | Crystal | accepted | 344.3 | 1024 | 3× |
| 163 | Dart | accepted | 204.4 | 768 | 4× |
| 164 | Julia | accepted | 243.6 | 1024 | 4× |
| 170 | Racket | accepted | 189.9 | 512 | 3× |
| 171 | Raku | accepted | 120.6 | 512 | 4× |
| 172 | AWK | accepted | 1.8 | 128 | 72× |
| 173 | CoffeeScript | accepted | 22.2 | 512 | 23× |
| 174 | Forth | accepted | 1.8 | 128 | 72× |
| 176 | Emacs Lisp | accepted | 55.3 | 512 | 9× |
| 177 | Verilog | accepted | 3.4 | 256 | 75× |
| 178 | LLVM IR | accepted | 40.7 | 512 | 13× |
| 179 | V | accepted | 45.9 | 512 | 11× |
| 180 | FreeBASIC | accepted | 14.8 | 512 | 35× |
| 181 | PowerShell | accepted | 79.7 | 1024 | 13× |
| 182 | Pony | accepted | 2.2 | 1024 | 468× |
| 300 | Brainfuck | accepted | 1.2 | 256 | 208× |
| 301 | GolfScript | accepted | 14.7 | 256 | 17× |
| 302 | CJam | accepted | 22.9 | 512 | 22× |
| 303 | Vyxal | accepted | 97.3 | 512 | 5× |
| 305 | Samarium | accepted | 10.3 | 512 | 50× |
| 306 | Paradoc | accepted | 19.3 | 512 | 26× |

**58 languages.** Total actual peak (if all ran once, serially): **4429 MB**.  Total reserved (if all ran concurrently): **24192 MB**.

- Mean actual per simple run: **76.4 MB**;  mean reserved: **417 MB**.
- Heaviest actual: **Kotlin** at **448.6 MB**.
- Aggregate over-reservation: **5.5×** (reserved 24192 MB vs actual 4429 MB).
