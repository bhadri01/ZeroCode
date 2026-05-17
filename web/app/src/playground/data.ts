/*
 * Playground language catalog — Core 7 with sample snippets, accent colors,
 * and offline-demo expected output. Language IDs must match
 * runners/languages.toml so submissions resolve server-side. The API probe
 * replaces `version` with what the server actually reports.
 */

export type Family = 'py' | 'c' | 'rb' | 'hs' | 'sh';
export type CmLang = 'python' | 'javascript' | 'rust' | 'go' | 'cpp' | 'c' | 'java' | 'plaintext';

export interface Lang {
  id: number;
  name: string;
  version: string;
  ext: string;
  family: Family;
  core: boolean;
  accent: string;
  cm: CmLang;
  snippet: string;
  output: string[];
  metrics: { time: number; memory: number; exit: number };
}

// Source-of-truth catalog. Kept in author-friendly order (most-used first)
// for diffs; the picker consumes the sorted `LANGS` export below.
const LANG_CATALOG: Lang[] = [
  {
    id: 71, name: 'Python', version: '3.13', ext: 'py', family: 'py', core: true,
    accent: '#3776ab', cm: 'python',
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
    id: 63, name: 'Node.js', version: '22', ext: 'js', family: 'c', core: true,
    accent: '#3c873a', cm: 'javascript',
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
    id: 73, name: 'Rust', version: 'stable', ext: 'rs', family: 'c', core: true,
    accent: '#D17B49', cm: 'rust',
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
    id: 60, name: 'Go', version: '1.x', ext: 'go', family: 'c', core: true,
    accent: '#00add8', cm: 'go',
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
    id: 48, name: 'C', version: 'gcc-14', ext: 'c', family: 'c', core: true,
    accent: '#a8b9cc', cm: 'c',
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
    id: 52, name: 'C++', version: 'g++-14', ext: 'cpp', family: 'c', core: true,
    accent: '#9c6eb8', cm: 'cpp',
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
    id: 62, name: 'Java', version: '21', ext: 'java', family: 'c', core: true,
    accent: '#d97757', cm: 'java',
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

// Picker shows languages alphabetically (C, C++, Go, Java, Node.js, Python, Rust).
export const LANGS: Lang[] = [...LANG_CATALOG].sort((a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
);

export type Verdict =
  | 'idle' | 'queued' | 'processing' | 'accepted'
  | 'tle' | 'mle' | 'ole' | 'ce' | 're' | 'nze' | 'se'
  | 'cancelled' | 'expired';

export const VERDICT_COLOR: Record<Verdict, string> = {
  idle:       'var(--fg-3)',
  queued:     'var(--st-queued)',
  processing: 'var(--st-processing)',
  accepted:   'var(--st-accepted)',
  tle:        'var(--st-tle)',
  mle:        'var(--st-mle)',
  ole:        'var(--st-tle)',
  ce:         'var(--st-ce)',
  re:         'var(--st-re)',
  nze:        'var(--st-re)',
  se:         'var(--st-se)',
  cancelled:  'var(--fg-3)',
  expired:    'var(--fg-3)',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  idle: 'idle',
  queued: 'queued',
  processing: 'processing',
  accepted: 'accepted',
  tle: 'time limit',
  mle: 'memory limit',
  ole: 'output limit',
  ce: 'compile error',
  re: 'runtime error',
  nze: 'non-zero exit',
  se: 'sandbox error',
  cancelled: 'cancelled',
  expired: 'expired',
};
