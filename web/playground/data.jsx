// playground/data.jsx
// 41 languages with sample snippets + minimal syntax highlighters + canned outputs.

const LANGS = [
  // ── Core 7 ─────────────────────────────────────────────────────────
  { id: 71,  name: 'Python',     version: '3.12.4',    ext: 'py',  family: 'py',    core: true, accent: '#3776ab',
    snippet: `# fibonacci, the python way
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

for i in range(10):
    print(f"fib({i}) = {fib(i)}")
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.018, memory: 3.7, exit: 0 }
  },
  { id: 93,  name: 'JavaScript', version: 'node 22',   ext: 'js',  family: 'c',     core: true, accent: '#f7df1e',
    snippet: `// fibonacci, the node way
const fib = n => {
  let [a, b] = [0n, 1n];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
};

for (let i = 0; i < 12; i++) {
  console.log(\`fib(\${i}) = \${fib(i)}\`);
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34','fib(10) = 55','fib(11) = 89'],
    metrics: { time: 0.042, memory: 12.4, exit: 0 }
  },
  { id: 73,  name: 'Rust',       version: '1.85.0',    ext: 'rs',  family: 'c',     core: true, accent: '#D17B49',
    snippet: `fn fib(n: u32) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        (a, b) = (b, a + b);
    }
    a
}

fn main() {
    for i in 0..10 {
        println!("fib({i}) = {}", fib(i));
    }
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.014, memory: 3.2, exit: 0 }
  },
  { id: 95,  name: 'Go',         version: '1.23.4',    ext: 'go',  family: 'c',     core: true, accent: '#00add8',
    snippet: `package main

import "fmt"

func fib(n int) uint64 {
    a, b := uint64(0), uint64(1)
    for i := 0; i < n; i++ {
        a, b = b, a+b
    }
    return a
}

func main() {
    for i := 0; i < 10; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fib(i))
    }
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.021, memory: 5.4, exit: 0 }
  },
  { id: 50,  name: 'C',          version: 'gcc 14',    ext: 'c',   family: 'c',     core: true, accent: '#a8b9cc',
    snippet: `#include <stdio.h>
#include <stdint.h>

uint64_t fib(int n) {
    uint64_t a = 0, b = 1;
    while (n-- > 0) { uint64_t t = b; b = a + b; a = t; }
    return a;
}

int main(void) {
    for (int i = 0; i < 10; i++) printf("fib(%d) = %llu\\n", i, fib(i));
    return 0;
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.009, memory: 1.1, exit: 0 }
  },
  { id: 54,  name: 'C++',        version: 'gcc 14',    ext: 'cpp', family: 'c',     core: true, accent: '#9c6eb8',
    snippet: `#include <bits/stdc++.h>
using namespace std;

uint64_t fib(int n) {
    uint64_t a = 0, b = 1;
    while (n-- > 0) tie(a, b) = make_tuple(b, a + b);
    return a;
}

int main() {
    for (int i = 0; i < 10; ++i) cout << "fib(" << i << ") = " << fib(i) << '\\n';
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.012, memory: 2.4, exit: 0 }
  },
  { id: 91,  name: 'Java',       version: 'jdk 21',    ext: 'java',family: 'c',     core: true, accent: '#d97757',
    snippet: `public class Main {
    static long fib(int n) {
        long a = 0, b = 1;
        for (int i = 0; i < n; i++) { long t = b; b = a + b; a = t; }
        return a;
    }
    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) System.out.println("fib(" + i + ") = " + fib(i));
    }
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.087, memory: 38.2, exit: 0 }
  },

  // ── Compact snippet for the rest ────────────────────────────────────
  ...[
    [101, 'TypeScript',   '5.6.3',         'ts',     'c',  `console.log("hello, ts " + (1+1));`],
    [46,  'Bash',         '5.2',           'sh',     'sh', `echo "hello, $USER"\nfor i in 1 2 3; do echo "i=$i"; done`],
    [72,  'Ruby',         '3.3.4',         'rb',     'rb', `5.times { |i| puts "i=#{i}" }`],
    [68,  'PHP',          '8.3.10',        'php',    'c',  `<?php\nfor ($i = 0; $i < 5; $i++) echo "i=$i\\n";\n?>`],
    [78,  'Kotlin',       '2.0.20',        'kt',     'c',  `fun main() { (0..4).forEach { println("i=$it") } }`],
    [83,  'Swift',        '5.10',          'swift',  'c',  `for i in 0..<5 { print("i=\\(i)") }`],
    [81,  'Scala',        '3.5.0',         'scala',  'c',  `@main def hello() = (0 until 5).foreach(i => println(s"i=$i"))`],
    [57,  'Elixir',       '1.17.2',        'ex',     'rb', `0..4 |> Enum.each(fn i -> IO.puts("i=#{i}") end)`],
    [58,  'Erlang/OTP',   '27.0',          'erl',    'rb', `-module(main).\n-export([main/0]).\nmain() -> lists:foreach(fun(I) -> io:format("i=~p~n",[I]) end, lists:seq(0,4)).`],
    [61,  'Haskell',      'ghc 9.10',      'hs',     'hs', `main = mapM_ (\\i -> putStrLn ("i=" ++ show i)) [0..4]`],
    [65,  'OCaml',        '5.2.0',         'ml',     'hs', `let () = for i = 0 to 4 do Printf.printf "i=%d\\n" i done`],
    [86,  'Clojure',      '1.12',          'clj',    'rb', `(dotimes [i 5] (println "i=" i))`],
    [85,  'Perl',         '5.40',          'pl',     'sh', `for my $i (0..4) { print "i=$i\\n" }`],
    [64,  'Lua',          '5.4.7',         'lua',    'rb', `for i = 0, 4 do print("i=" .. i) end`],
    [80,  'R',            '4.4.1',         'R',      'rb', `for (i in 0:4) cat(sprintf("i=%d\\n", i))`],
    [87,  'Julia',        '1.10.4',        'jl',     'rb', `for i in 0:4; println("i=", i); end`],
    [51,  'C#',           '.net 8',        'cs',     'c',  `for (int i = 0; i < 5; i++) System.Console.WriteLine($"i={i}");`],
    [82,  'F#',           '8.0',           'fs',     'hs', `for i in 0..4 do printfn $"i={i}"`],
    [90,  'Dart',         '3.5.0',         'dart',   'c',  `void main() { for (var i = 0; i < 5; i++) print('i=$i'); }`],
    [88,  'Crystal',      '1.14',          'cr',     'rb', `5.times { |i| puts "i=#{i}" }`],
    [96,  'Nim',          '2.2.0',         'nim',    'rb', `for i in 0..4: echo "i=", i`],
    [97,  'Zig',          '0.13.0',        'zig',    'c',  `const std = @import("std");\npub fn main() !void {\n  var i: u32 = 0;\n  while (i < 5) : (i += 1) try std.io.getStdOut().writer().print("i={d}\\n", .{i});\n}`],
    [56,  'D',            'dmd 2.110',     'd',      'c',  `import std.stdio; void main() { foreach (i; 0..5) writeln("i=", i); }`],
    [67,  'Pascal',       'fpc 3.2',       'pas',    'rb', `program Hello;\nvar i: Integer;\nbegin\n  for i := 0 to 4 do writeln('i=', i);\nend.`],
    [59,  'Fortran',      'gfortran 14',   'f90',    'rb', `program hello\n  integer :: i\n  do i = 0, 4\n    print *, 'i=', i\n  end do\nend program`],
    [77,  'COBOL',        'gnucobol 3.2',  'cob',    'rb', `IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO.\nPROCEDURE DIVISION.\n  PERFORM VARYING I FROM 0 BY 1 UNTIL I = 5\n    DISPLAY "i=" I\n  END-PERFORM.\n  STOP RUN.`],
    [69,  'Prolog',       'swi 9.2',       'pl',     'rb', `:- forall(member(I, [0,1,2,3,4]), format("i=~w~n", [I])).`],
    [55,  'Common Lisp',  'sbcl 2.4',      'lisp',   'rb', `(dotimes (i 5) (format t "i=~a~%" i))`],
    [89,  'Scheme',       'chez 10',       'scm',    'rb', `(do ((i 0 (+ i 1))) ((= i 5)) (display "i=") (display i) (newline))`],
    [92,  'Racket',       '8.14',          'rkt',    'rb', `#lang racket\n(for ([i 5]) (printf "i=~a\\n" i))`],
    [70,  'Groovy',       '4.0.23',        'groovy', 'c',  `(0..4).each { println "i=$it" }`],
    [99,  'V',            '0.4.8',         'v',      'c',  `fn main() { for i in 0..5 { println('i=$i') } }`],
    [48,  'AWK',          'gawk 5.3',      'awk',    'c',  `BEGIN { for (i = 0; i < 5; i++) print "i=" i }`],
    [49,  'NASM',         '2.16',          'asm',    'sh', `; nasm -felf64 main.asm && ld -o main main.o\nsection .data\n  msg db "hello, nasm",10\n  len equ $-msg\nsection .text\nglobal _start\n_start:\n  mov rax, 1\n  mov rdi, 1\n  mov rsi, msg\n  mov rdx, len\n  syscall\n  mov rax, 60\n  xor rdi, rdi\n  syscall`],
  ].map(([id, name, version, ext, family, snippet]) => ({
    id, name, version, ext, family, snippet,
    output: name === 'Bash'
      ? ['hello, runner', 'i=1', 'i=2', 'i=3']
      : ['i=0','i=1','i=2','i=3','i=4'],
    metrics: { time: 0.020 + Math.random() * 0.03, memory: 2 + Math.random() * 6, exit: 0 }
  }))
];

/* ────── tiny per-family syntax highlighter ──────────────────────────── */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Keyword lists per family
const KW = {
  py:  new Set(['def','return','for','in','if','elif','else','while','class','import','from','as','with','try','except','finally','raise','lambda','yield','None','True','False','self','pass','break','continue','global','nonlocal','and','or','not','is','async','await','print']),
  c:   new Set(['int','long','short','char','void','float','double','unsigned','signed','const','static','extern','return','if','else','for','while','do','switch','case','break','continue','struct','typedef','enum','sizeof','fn','let','mut','pub','use','mod','impl','trait','where','self','Self','None','Some','Ok','Err','true','false','null','nullptr','new','class','public','private','protected','package','interface','import','export','async','await','var','val','fun','func','main','defer','go','chan','range','select','map','type','namespace','using','include','template','typename','virtual','override']),
  rb:  new Set(['def','end','do','module','class','if','elsif','else','unless','while','until','case','when','then','return','yield','begin','rescue','ensure','raise','require','puts','print','nil','true','false','self','new','fn','val','let','var']),
  hs:  new Set(['let','in','do','where','case','of','if','then','else','module','import','class','instance','data','type','newtype','deriving','main']),
  sh:  new Set(['if','then','elif','else','fi','for','do','done','while','case','esac','function','return','echo','export','local','in','until']),
};

// Single-pass tokenizer — never re-scans its own output
function highlight(code, family) {
  const kwSet = KW[family] || KW.c;
  const isC = family === 'c';
  const isPyRbSh = family === 'py' || family === 'rb' || family === 'sh';
  const isHs = family === 'hs';

  // Composite regex that tries: comment | string | preproc | number | identifier
  // Each match goes through tokenizer; everything else is escaped raw text.
  const re = new RegExp([
    isC      ? '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)'        : '(\\u0000a)', // c comments
    isPyRbSh ? '(#[^\\n]*)'                                     : '(\\u0000b)', // py/rb/sh comments
    isHs     ? '(--[^\\n]*)'                                    : '(\\u0000c)', // hs comments
    '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\')',                   // strings
    '(^[ \\t]*(?:#include|#define|#pragma|#ifdef|#ifndef|#endif|#if|#else|#elif|@[A-Za-z_][A-Za-z0-9_]*)[^\\n]*)', // preproc + decorators
    '(\\b\\d+(?:\\.\\d+)?(?:[uif]\\d+|n|L|u32|u64|i32|i64|f32|f64)?\\b)',       // numbers
    '([A-Za-z_][A-Za-z0-9_]*)(?=\\s*\\()',                                       // function call (id before "(")
    '([A-Za-z_][A-Za-z0-9_]*)',                                                  // identifiers
  ].join('|'), 'gm');

  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m.index > lastIdx) {
      out += escapeHtml(code.slice(lastIdx, m.index));
    }
    const [_, cComment, pyComment, hsComment, str, preproc, num, fnCall, ident] = m;
    if (cComment || pyComment || hsComment) {
      out += `<span class="hl-com">${escapeHtml(cComment || pyComment || hsComment)}</span>`;
    } else if (str) {
      out += `<span class="hl-str">${escapeHtml(str)}</span>`;
    } else if (preproc) {
      out += `<span class="hl-pre">${escapeHtml(preproc)}</span>`;
    } else if (num) {
      out += `<span class="hl-num">${escapeHtml(num)}</span>`;
    } else if (fnCall) {
      if (kwSet.has(fnCall)) {
        out += `<span class="hl-kw">${escapeHtml(fnCall)}</span>`;
      } else {
        out += `<span class="hl-fn">${escapeHtml(fnCall)}</span>`;
      }
    } else if (ident) {
      if (kwSet.has(ident)) {
        out += `<span class="hl-kw">${escapeHtml(ident)}</span>`;
      } else {
        out += escapeHtml(ident);
      }
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < code.length) out += escapeHtml(code.slice(lastIdx));
  return out;
}

Object.assign(window, { LANGS, highlight });
