// playground/data.jsx
// Core 7 languages with sample snippets + per-family syntax highlighters.
// Language IDs must match runners/languages.toml so submissions resolve
// server-side. The api probe replaces `version` with the value the server
// actually reports (see app.jsx → langWithServerVersion).

const LANGS = [
  {
    id: 71,  name: 'Python',  version: '3.13',     ext: 'py',  family: 'py', core: true, accent: '#3776ab',
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
    metrics: { time: 0.018, memory: 3.7, exit: 0 },
  },
  {
    id: 63,  name: 'Node.js', version: '22',       ext: 'js',  family: 'c',  core: true, accent: '#3c873a',
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
    metrics: { time: 0.042, memory: 12.4, exit: 0 },
  },
  {
    id: 73,  name: 'Rust',    version: 'stable',   ext: 'rs',  family: 'c',  core: true, accent: '#D17B49',
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
    metrics: { time: 0.014, memory: 3.2, exit: 0 },
  },
  {
    id: 60,  name: 'Go',      version: '1.x',      ext: 'go',  family: 'c',  core: true, accent: '#00add8',
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
    metrics: { time: 0.021, memory: 5.4, exit: 0 },
  },
  {
    id: 48,  name: 'C',       version: 'gcc-14',   ext: 'c',   family: 'c',  core: true, accent: '#a8b9cc',
    snippet: `#include <stdio.h>
#include <stdint.h>

uint64_t fib(int n) {
    uint64_t a = 0, b = 1;
    while (n-- > 0) { uint64_t t = b; b = a + b; a = t; }
    return a;
}

int main(void) {
    for (int i = 0; i < 10; i++) printf("fib(%d) = %llu\\n", i, (unsigned long long)fib(i));
    return 0;
}
`,
    output: ['fib(0) = 0','fib(1) = 1','fib(2) = 1','fib(3) = 2','fib(4) = 3','fib(5) = 5','fib(6) = 8','fib(7) = 13','fib(8) = 21','fib(9) = 34'],
    metrics: { time: 0.009, memory: 1.1, exit: 0 },
  },
  {
    id: 52,  name: 'C++',     version: 'g++-14',   ext: 'cpp', family: 'c',  core: true, accent: '#9c6eb8',
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
    metrics: { time: 0.012, memory: 2.4, exit: 0 },
  },
  {
    id: 62,  name: 'Java',    version: '21',       ext: 'java', family: 'c', core: true, accent: '#d97757',
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
    metrics: { time: 0.087, memory: 38.2, exit: 0 },
  },
];

/* ────── tiny per-family syntax highlighter ──────────────────────────── */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Keyword lists per family.
const KW = {
  py:  new Set(['def','return','for','in','if','elif','else','while','class','import','from','as','with','try','except','finally','raise','lambda','yield','None','True','False','self','pass','break','continue','global','nonlocal','and','or','not','is','async','await','print']),
  c:   new Set(['int','long','short','char','void','float','double','unsigned','signed','const','static','extern','return','if','else','for','while','do','switch','case','break','continue','struct','typedef','enum','sizeof','fn','let','mut','pub','use','mod','impl','trait','where','self','Self','None','Some','Ok','Err','true','false','null','nullptr','new','class','public','private','protected','package','interface','import','export','async','await','var','val','fun','func','main','defer','go','chan','range','select','map','type','namespace','using','include','template','typename','virtual','override']),
  rb:  new Set(['def','end','do','module','class','if','elsif','else','unless','while','until','case','when','then','return','yield','begin','rescue','ensure','raise','require','puts','print','nil','true','false','self','new','fn','val','let','var']),
  hs:  new Set(['let','in','do','where','case','of','if','then','else','module','import','class','instance','data','type','newtype','deriving','main']),
  sh:  new Set(['if','then','elif','else','fi','for','do','done','while','case','esac','function','return','echo','export','local','in','until']),
};

// Single-pass tokenizer — never re-scans its own output.
function highlight(code, family) {
  const kwSet = KW[family] || KW.c;
  const isC = family === 'c';
  const isPyRbSh = family === 'py' || family === 'rb' || family === 'sh';
  const isHs = family === 'hs';

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
