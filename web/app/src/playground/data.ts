/*
 * Playground language catalog — the Core 7 plus every batch language
 * (A–I), each with a sample snippet, accent color, and offline-demo
 * expected output. Language IDs must match runners/languages.toml so
 * submissions resolve server-side. The API probe replaces `version` with
 * what the server actually reports.
 *
 * raw-wasm (id 200) is intentionally absent — it takes a pre-compiled
 * `.wasm` blob, not editable source, so it has no playground starter.
 */

export type Family = 'py' | 'c' | 'rb' | 'sh';
// Monaco highlight mode (registered in Editor.tsx). Every value is a Monaco
// language id wired up in Editor.tsx — the stock basic-language grammars plus a
// hand-written Bash/`shell` grammar. ('c' reuses Monaco's cpp grammar.)
export type CmLang =
  | 'python' | 'javascript' | 'typescript' | 'rust' | 'go' | 'cpp' | 'c' | 'java'
  | 'shell' | 'lua' | 'perl' | 'ruby' | 'r' | 'php'
  | 'kotlin' | 'scala' | 'csharp' | 'swift' | 'sql' | 'dart';

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

  // ── v1.5 Batch A — interpreted ──────────────────────────────────────
  {
    id: 100, name: 'Bash', version: '5.x', ext: 'sh', family: 'sh', core: false,
    accent: '#4EAA25', cm: 'shell',
    snippet: `# Read an integer from stdin and print its square.
read n
echo "$n squared = $((n * n))"
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.011, memory: 2.0, exit: 0 },
  },
  {
    id: 101, name: 'Lua', version: '5.4', ext: 'lua', family: 'py', core: false,
    accent: '#2C2D72', cm: 'lua',
    snippet: `-- Read an integer from stdin and print its square.
local n = tonumber(io.read("*l"))
print(n .. " squared = " .. (n * n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.009, memory: 1.6, exit: 0 },
  },
  {
    id: 102, name: 'Perl', version: '5.x', ext: 'pl', family: 'rb', core: false,
    accent: '#39457E', cm: 'perl',
    snippet: `# Read an integer from stdin and print its square.
my $n = <STDIN>;
chomp $n;
print "$n squared = ", $n * $n, "\\n";
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.013, memory: 2.6, exit: 0 },
  },
  {
    id: 103, name: 'Ruby', version: '3.x', ext: 'rb', family: 'rb', core: false,
    accent: '#CC342D', cm: 'ruby',
    snippet: `# Read an integer from stdin and print its square.
n = STDIN.read.to_i
puts "#{n} squared = #{n * n}"
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.061, memory: 8.2, exit: 0 },
  },
  {
    id: 104, name: 'R', version: '4.x', ext: 'r', family: 'py', core: false,
    accent: '#276DC3', cm: 'r',
    snippet: `# Read an integer from stdin and print its square.
n <- as.integer(readLines("stdin", n = 1))
cat(sprintf("%d squared = %d\\n", n, n * n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.18, memory: 32.0, exit: 0 },
  },
  {
    id: 105, name: 'PHP', version: '8.x', ext: 'php', family: 'c', core: false,
    accent: '#777BB4', cm: 'php',
    snippet: `<?php
// Read an integer from stdin and print its square.
$n = (int) trim(fgets(STDIN));
echo "$n squared = " . ($n * $n) . "\\n";
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.03, memory: 12.0, exit: 0 },
  },
  {
    id: 106, name: 'TypeScript', version: 'tsx', ext: 'ts', family: 'c', core: false,
    accent: '#3178C6', cm: 'typescript',
    snippet: `// Read an integer from stdin and print its square.
import * as fs from 'fs';

const n: number = parseInt(fs.readFileSync(0, 'utf8').trim(), 10);
console.log(n + " squared = " + n * n);
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.09, memory: 22.0, exit: 0 },
  },

  // ── v1.5 Batch B — compiled (GCC family) ────────────────────────────
  {
    id: 120, name: 'Kotlin', version: '2.x', ext: 'kt', family: 'c', core: false,
    accent: '#7F52FF', cm: 'kotlin',
    snippet: `fun main() {
    val n = readLine()!!.trim().toLong()
    println(n.toString() + " squared = " + (n * n))
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.28, memory: 55.0, exit: 0 },
  },
  {
    id: 121, name: 'Scala', version: '3.x', ext: 'scala', family: 'c', core: false,
    accent: '#DC322F', cm: 'scala',
    snippet: `object main {
  def main(args: Array[String]): Unit = {
    val n = scala.io.StdIn.readLine().trim.toLong
    println(n.toString + " squared = " + (n * n))
  }
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.42, memory: 72.0, exit: 0 },
  },
  {
    id: 140, name: 'C#', version: '.NET 9', ext: 'cs', family: 'c', core: false,
    accent: '#9B4F96', cm: 'csharp',
    snippet: `using System;

class Program {
    static void Main() {
        long n = long.Parse(Console.In.ReadToEnd().Trim());
        Console.WriteLine(n + " squared = " + (n * n));
    }
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
  },
  {
    id: 152, name: 'Swift', version: '6.x', ext: 'swift', family: 'c', core: false,
    accent: '#F05138', cm: 'swift',
    snippet: `// readLine() strips the trailing newline; no Foundation needed.
let n = Int(readLine()!)!
print(String(n) + " squared = " + String(n * n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 10.0, exit: 0 },
  },
  {
    id: 154, name: 'SQL', version: 'sqlite3', ext: 'sql', family: 'py', core: false,
    accent: '#003B57', cm: 'sql',
    snippet: `-- SQLite reads statements from this file.
SELECT 7 || ' squared = ' || (7 * 7);
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 1.6, exit: 0 },
  },

  // ── v1.5 Batch G — modern ───────────────────────────────────────────
  // (Zig id 160 removed — its compiler can't run in the sandbox; see data note.)
  {
    id: 163, name: 'Dart', version: '3.x', ext: 'dart', family: 'c', core: false,
    accent: '#0175C2', cm: 'dart',
    snippet: `import 'dart:io';

void main() {
  final n = int.parse(stdin.readLineSync()!.trim());
  print(n.toString() + " squared = " + (n * n).toString());
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 8.0, exit: 0 },
  },
];

// Picker shows the supported languages alphabetically (Bash, C, C++, …).
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
