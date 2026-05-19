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
  /** Pre-filled stdin for the default snippet — paired with `output`
   * so a fresh visitor can hit Run and see something happen. Also seeds
   * the stdin textarea every time the user switches language. */
  sampleStdin: string;
  output: string[];
  metrics: { time: number; memory: number; exit: number };
}

// Source-of-truth catalog. Every snippet reads stdin and prints a derived
// output — pairs naturally with the test-cases feature (Tests tab in the
// workspace bar): switch to "tests" mode and feed the same program N
// different inputs at once.
//
// Convention used by every starter:
//   stdin :  one integer N
//   stdout:  "N squared = N²"
//
// Sample stdin is "7" → expected "7 squared = 49".
const LANG_CATALOG: Lang[] = [
  {
    id: 71, name: 'Python', version: '3.13', ext: 'py', family: 'py', core: true,
    accent: '#3776ab', cm: 'python',
    snippet: `# Read an integer from stdin and print its square.
# Try the Tests tab to feed several stdins at once.
import sys

n = int(sys.stdin.read().strip())
print(f"{n} squared = {n * n}")
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.018, memory: 3.7, exit: 0 },
  },
  {
    id: 63, name: 'Node.js', version: '22', ext: 'js', family: 'c', core: true,
    accent: '#3c873a', cm: 'javascript',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
const fs = require('fs');

const n = parseInt(fs.readFileSync(0, 'utf8').trim(), 10);
console.log(\`\${n} squared = \${n * n}\`);
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.042, memory: 12.4, exit: 0 },
  },
  {
    id: 73, name: 'Rust', version: 'stable', ext: 'rs', family: 'c', core: true,
    accent: '#D17B49', cm: 'rust',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
use std::io::Read;

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).unwrap();
    let n: i64 = s.trim().parse().unwrap();
    println!("{} squared = {}", n, n * n);
}
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.014, memory: 3.2, exit: 0 },
  },
  {
    id: 60, name: 'Go', version: '1.x', ext: 'go', family: 'c', core: true,
    accent: '#00add8', cm: 'go',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
package main

import "fmt"

func main() {
    var n int64
    fmt.Scan(&n)
    fmt.Printf("%d squared = %d\\n", n, n*n)
}
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.021, memory: 5.4, exit: 0 },
  },
  {
    id: 48, name: 'C', version: 'gcc-14', ext: 'c', family: 'c', core: true,
    accent: '#a8b9cc', cm: 'c',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
#include <stdio.h>

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1) return 1;
    printf("%lld squared = %lld\\n", n, n * n);
    return 0;
}
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.009, memory: 1.1, exit: 0 },
  },
  {
    id: 52, name: 'C++', version: 'g++-14', ext: 'cpp', family: 'c', core: true,
    accent: '#9c6eb8', cm: 'cpp',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
#include <iostream>

int main() {
    long long n;
    std::cin >> n;
    std::cout << n << " squared = " << n * n << "\\n";
}
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
    metrics: { time: 0.012, memory: 2.4, exit: 0 },
  },
  {
    id: 62, name: 'Java', version: '21', ext: 'java', family: 'c', core: true,
    accent: '#d97757', cm: 'java',
    snippet: `// Read an integer from stdin and print its square.
// Try the Tests tab to feed several stdins at once.
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner s = new Scanner(System.in);
        long n = s.nextLong();
        System.out.println(n + " squared = " + (n * n));
    }
}
`,
    sampleStdin: '7\n',
    output: ['7 squared = 49'],
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
