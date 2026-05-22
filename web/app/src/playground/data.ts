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

export type Family = 'py' | 'c' | 'rb' | 'hs' | 'sh';
// Monaco highlight mode (registered in Editor.tsx). Languages without a native
// Monaco grammar map to the closest family (e.g. Crystal→ruby, Nim→python,
// D→cpp, OCaml→fsharp, Common Lisp→scheme) or 'plaintext'.
export type CmLang =
  | 'python' | 'javascript' | 'typescript' | 'rust' | 'go' | 'cpp' | 'c' | 'java'
  | 'shell' | 'lua' | 'perl' | 'ruby' | 'r' | 'php' | 'pascal' | 'objective-c'
  | 'kotlin' | 'scala' | 'clojure' | 'elixir' | 'scheme' | 'csharp' | 'fsharp'
  | 'swift' | 'sql' | 'dart' | 'julia'
  // Custom Monarch grammars registered in Editor.tsx (no Monaco basic-language).
  | 'asm' | 'ada' | 'erlang' | 'fortran' | 'haskell'
  | 'cobol' | 'prolog' | 'octave' | 'plaintext';

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
    id: 110, name: 'Fortran', version: 'gfortran-14', ext: 'f90', family: 'c', core: false,
    accent: '#734F96', cm: 'fortran',
    snippet: `program square
  integer :: n
  read(*,*) n
  print '(I0,A,I0)', n, ' squared = ', n * n
end program square
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.008, memory: 1.4, exit: 0 },
  },
  {
    id: 111, name: 'Pascal', version: 'fpc', ext: 'pas', family: 'c', core: false,
    accent: '#1A6FB5', cm: 'pascal',
    snippet: `var n: int64;
begin
  readln(n);
  writeln(n, ' squared = ', n * n);
end.
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.008, memory: 1.2, exit: 0 },
  },
  {
    id: 112, name: 'D', version: 'ldc', ext: 'd', family: 'c', core: false,
    accent: '#B03931', cm: 'cpp',
    snippet: `import std.stdio;

void main() {
    long n;
    readf(" %d", &n);
    writeln(n, " squared = ", n * n);
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.02, memory: 3.0, exit: 0 },
  },
  {
    id: 113, name: 'Objective-C', version: 'clang', ext: 'm', family: 'c', core: false,
    accent: '#438EFF', cm: 'objective-c',
    snippet: `#import <stdio.h>

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1) return 1;
    printf("%lld squared = %lld\\n", n, n * n);
    return 0;
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.009, memory: 1.6, exit: 0 },
  },
  {
    id: 114, name: 'Assembly', version: 'nasm', ext: 'asm', family: 'c', core: false,
    accent: '#6E4C13', cm: 'asm',
    snippet: `; Read an integer N from stdin, print "N squared = N*N" (x86-64 Linux).
section .bss
inbuf   resb 32
numbuf  resb 24
outbuf  resb 64
section .data
mid     db " squared = "
midlen  equ $ - mid
section .text
global _start
_start:
    xor eax, eax            ; sys_read
    xor edi, edi            ; fd 0 (stdin)
    mov rsi, inbuf
    mov rdx, 32
    syscall
    xor r12, r12            ; N
    mov rsi, inbuf
.parse:
    movzx rax, byte [rsi]
    cmp al, '0'
    jb .squared
    cmp al, '9'
    ja .squared
    imul r12, r12, 10
    sub al, '0'
    movzx rax, al
    add r12, rax
    inc rsi
    jmp .parse
.squared:
    mov rax, r12
    imul rax, r12
    mov r13, rax            ; N*N
    mov r14, outbuf
    mov rax, r12
    call emit               ; append N
    mov rsi, mid            ; append " squared = "
    mov rcx, midlen
.cpmid:
    mov al, [rsi]
    mov [r14], al
    inc rsi
    inc r14
    dec rcx
    jnz .cpmid
    mov rax, r13
    call emit               ; append N*N
    mov byte [r14], 10      ; newline
    inc r14
    mov rax, 1              ; sys_write
    mov rdi, 1
    mov rsi, outbuf
    mov rdx, r14
    sub rdx, outbuf
    syscall
    mov rax, 60             ; exit
    xor rdi, rdi
    syscall
emit:                       ; rax = number, append decimal digits at [r14]
    mov rbx, 10
    mov rcx, numbuf
    test rax, rax
    jnz .div
    mov byte [rcx], '0'
    inc rcx
    jmp .rev
.div:
    xor rdx, rdx
    div rbx
    add dl, '0'
    mov [rcx], dl
    inc rcx
    test rax, rax
    jnz .div
.rev:
    dec rcx
.copy:
    mov al, [rcx]
    mov [r14], al
    inc r14
    cmp rcx, numbuf
    je .ret
    dec rcx
    jmp .copy
.ret:
    ret
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.004, memory: 0.5, exit: 0 },
  },
  {
    id: 115, name: 'Ada', version: 'gnat', ext: 'adb', family: 'c', core: false,
    accent: '#0CA14A', cm: 'ada',
    snippet: `with Ada.Text_IO; use Ada.Text_IO;
with Ada.Integer_Text_IO; use Ada.Integer_Text_IO;

procedure Main is
   N : Integer;
begin
   Get (N);
   Put (N, Width => 0);
   Put (" squared = ");
   Put (N * N, Width => 0);
   New_Line;
end Main;
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 1.6, exit: 0 },
  },

  // ── v1.5 Batch C — JVM ──────────────────────────────────────────────
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
    id: 122, name: 'Groovy', version: '4.x', ext: 'groovy', family: 'c', core: false,
    accent: '#4298B8', cm: 'java',
    snippet: `def n = System.in.text.trim() as long
println(n.toString() + " squared = " + (n * n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.5, memory: 60.0, exit: 0 },
  },
  {
    id: 123, name: 'Clojure', version: '1.x', ext: 'clj', family: 'hs', core: false,
    accent: '#5881D8', cm: 'clojure',
    snippet: `(let [n (Long/parseLong (clojure.string/trim (read-line)))]
  (println (str n " squared = " (* n n))))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.62, memory: 66.0, exit: 0 },
  },

  // ── v1.5 Batch D — functional / ML ──────────────────────────────────
  {
    id: 130, name: 'Haskell', version: 'ghc', ext: 'hs', family: 'hs', core: false,
    accent: '#5E5086', cm: 'haskell',
    snippet: `main :: IO ()
main = do
  n <- readLn :: IO Integer
  putStrLn (show n ++ " squared = " ++ show (n * n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 3.2, exit: 0 },
  },
  {
    id: 131, name: 'OCaml', version: '5.x', ext: 'ml', family: 'hs', core: false,
    accent: '#EC6813', cm: 'fsharp',
    snippet: `let () =
  let n = int_of_string (String.trim (input_line stdin)) in
  Printf.printf "%d squared = %d\\n" n (n * n)
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 2.2, exit: 0 },
  },
  {
    id: 132, name: 'Erlang', version: 'otp-27', ext: 'erl', family: 'hs', core: false,
    accent: '#A90533', cm: 'erlang',
    snippet: `-module(main).
-export([main/0]).

main() ->
    {ok, [N]} = io:fread("", "~d"),
    io:format("~w squared = ~w~n", [N, N * N]).
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.1, memory: 16.0, exit: 0 },
  },
  {
    id: 133, name: 'Elixir', version: '1.x', ext: 'exs', family: 'hs', core: false,
    accent: '#4B275F', cm: 'elixir',
    snippet: `n = IO.read(:stdio, :line) |> String.trim() |> String.to_integer()
IO.puts("#{n} squared = #{n * n}")
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.6, memory: 58.0, exit: 0 },
  },
  {
    id: 134, name: 'Common Lisp', version: 'sbcl', ext: 'lisp', family: 'hs', core: false,
    accent: '#3FB68B', cm: 'scheme',
    snippet: `(let ((n (read)))
  (format t "~a squared = ~a~%" n (* n n)))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 26.0, exit: 0 },
  },

  // ── v1.5 Batch E — .NET ─────────────────────────────────────────────
  {
    id: 140, name: 'C#', version: '.NET 9', ext: 'cs', family: 'c', core: false,
    accent: '#239120', cm: 'csharp',
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
    id: 141, name: 'F#', version: '.NET 9', ext: 'fsx', family: 'hs', core: false,
    accent: '#378BBA', cm: 'fsharp',
    snippet: `let n = stdin.ReadToEnd().Trim() |> int64
printfn "%d squared = %d" n (n * n)
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.35, memory: 36.0, exit: 0 },
  },

  // ── v1.5 Batch F — niche ────────────────────────────────────────────
  {
    id: 150, name: 'COBOL', version: 'gnucobol', ext: 'cob', family: 'c', core: false,
    accent: '#005CA5', cm: 'cobol',
    snippet: `       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
           DISPLAY "hello from COBOL".
           STOP RUN.
`,
    sampleStdin: '', output: ['hello from COBOL'],
    metrics: { time: 0.01, memory: 1.6, exit: 0 },
  },
  {
    id: 151, name: 'Prolog', version: 'swipl', ext: 'pl', family: 'hs', core: false,
    accent: '#74283C', cm: 'prolog',
    snippet: `:- initialization(main).
main :-
    N = 7,
    S is N * N,
    format("~w squared = ~w~n", [N, S]),
    halt.
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 6.0, exit: 0 },
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
    id: 153, name: 'Octave', version: '9.x', ext: 'm', family: 'py', core: false,
    accent: '#0790C0', cm: 'octave',
    snippet: `n = str2double(fgetl(stdin));
printf("%d squared = %d\\n", n, n * n);
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 28.0, exit: 0 },
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
    id: 161, name: 'Nim', version: '2.x', ext: 'nim', family: 'py', core: false,
    accent: '#FFC200', cm: 'python',
    snippet: `import strutils

let n = stdin.readLine().strip().parseInt()
echo n, " squared = ", n * n
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.02, memory: 1.8, exit: 0 },
  },
  {
    id: 162, name: 'Crystal', version: '1.x', ext: 'cr', family: 'rb', core: false,
    accent: '#999999', cm: 'ruby',
    snippet: `# Read an integer from stdin and print its square.
n = STDIN.gets.not_nil!.strip.to_i64
puts "#{n} squared = #{n * n}"
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.03, memory: 3.2, exit: 0 },
  },
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
  {
    id: 164, name: 'Julia', version: '1.x', ext: 'jl', family: 'py', core: false,
    accent: '#9558B2', cm: 'julia',
    snippet: `n = parse(Int, strip(readline()))
println(n, " squared = ", n * n)
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 50.0, exit: 0 },
  },

  // ── Batch H — practical parity w/ Piston ─────────────────────────────
  {
    id: 170, name: 'Racket', version: '8.x', ext: 'rkt', family: 'hs', core: false,
    accent: '#3E5BA9', cm: 'scheme',
    snippet: `#lang racket
;; Read an integer from stdin and print its square.
(define n (string->number (string-trim (read-line))))
(printf "~a squared = ~a\\n" n (* n n))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.4, memory: 90.0, exit: 0 },
  },
  {
    id: 171, name: 'Raku', version: 'rakudo', ext: 'raku', family: 'rb', core: false,
    accent: '#C7407A', cm: 'perl',
    snippet: `# Read an integer from stdin and print its square.
my $n = get.Int;
say "$n squared = { $n * $n }";
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 70.0, exit: 0 },
  },
  {
    id: 172, name: 'AWK', version: 'gawk', ext: 'awk', family: 'sh', core: false,
    accent: '#1E8FA8', cm: 'shell',
    snippet: `# Read an integer from stdin and print its square.
{ print $1, "squared =", $1 * $1 }
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 2.0, exit: 0 },
  },
  {
    id: 173, name: 'CoffeeScript', version: '2.x', ext: 'coffee', family: 'c', core: false,
    accent: '#6F4E37', cm: 'plaintext',
    snippet: `# Read an integer from stdin and print its square.
fs = require 'fs'
n = parseInt fs.readFileSync(0, 'utf8').trim(), 10
console.log "#{n} squared = #{n * n}"
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.18, memory: 40.0, exit: 0 },
  },
  {
    id: 174, name: 'Forth', version: 'gforth', ext: 'fth', family: 'c', core: false,
    accent: '#C24A2B', cm: 'plaintext',
    snippet: `\\ Compute and print 7 squared.
: main  7 dup 0 .r ."  squared = " dup * 0 .r cr ;
main
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 2.0, exit: 0 },
  },
  {
    id: 176, name: 'Emacs Lisp', version: 'emacs', ext: 'el', family: 'hs', core: false,
    accent: '#7F5AB6', cm: 'scheme',
    snippet: `;; Read an integer from stdin and print its square.
(let ((n (string-to-number (read-from-minibuffer ""))))
  (princ (format "%d squared = %d\\n" n (* n n))))
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
  },
  {
    id: 177, name: 'Verilog', version: 'iverilog', ext: 'v', family: 'c', core: false,
    accent: '#1EA64A', cm: 'plaintext',
    snippet: `module main;
  integer n;
  initial begin
    n = 7;
    $display("%0d squared = %0d", n, n * n);
  end
endmodule
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 6.0, exit: 0 },
  },
  {
    id: 178, name: 'LLVM IR', version: 'lli', ext: 'll', family: 'c', core: false,
    accent: '#2C6FBB', cm: 'asm',
    snippet: `; Print "7 squared = 49" via libc printf.
@.s = private unnamed_addr constant [16 x i8] c"7 squared = %d\\0A\\00"
declare i32 @printf(ptr, ...)
define i32 @main() {
  %r = call i32 (ptr, ...) @printf(ptr @.s, i32 49)
  ret i32 0
}
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.05, memory: 8.0, exit: 0 },
  },
  {
    id: 179, name: 'V', version: '0.4.x', ext: 'v', family: 'c', core: false,
    accent: '#5D87BF', cm: 'go',
    snippet: `import os

fn main() {
	n := os.input('').int()
	println('\${n} squared = \${n * n}')
}
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.02, memory: 3.0, exit: 0 },
  },
  {
    id: 180, name: 'FreeBASIC', version: '1.x', ext: 'bas', family: 'c', core: false,
    accent: '#1D4E89', cm: 'plaintext',
    snippet: `Dim s As String
Line Input s
Dim n As Integer = Val(s)
Print n & " squared = " & (n * n)
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.01, memory: 2.0, exit: 0 },
  },
  {
    id: 181, name: 'PowerShell', version: '7.x', ext: 'ps1', family: 'sh', core: false,
    accent: '#5391FE', cm: 'shell',
    snippet: `# Read an integer from stdin and print its square.
$n = [int][Console]::In.ReadLine()
Write-Output "$n squared = $($n * $n)"
`,
    sampleStdin: '7\n', output: ['7 squared = 49'],
    metrics: { time: 0.5, memory: 70.0, exit: 0 },
  },
  {
    id: 182, name: 'Pony', version: 'ponyc', ext: 'pony', family: 'c', core: false,
    accent: '#B05CF0', cm: 'plaintext',
    snippet: `actor Main
  new create(env: Env) =>
    let n: I64 = 7
    env.out.print(n.string() + " squared = " + (n * n).string())
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.02, memory: 3.0, exit: 0 },
  },

  // ── Batch I — esoteric / code-golf (best-effort) ─────────────────────
  {
    id: 300, name: 'Brainfuck', version: 'bf', ext: 'bf', family: 'c', core: false,
    accent: '#6B5B95', cm: 'plaintext',
    snippet: `++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>
---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.
`,
    sampleStdin: '', output: ['Hello World!'],
    metrics: { time: 0.01, memory: 1.6, exit: 0 },
  },
  {
    id: 301, name: 'GolfScript', version: '1.0', ext: 'gs', family: 'rb', core: false,
    accent: '#4A8C4A', cm: 'plaintext',
    snippet: `# The stack is printed at exit.
"7 squared = "7 7*
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.06, memory: 8.0, exit: 0 },
  },
  {
    id: 302, name: 'CJam', version: '0.6.x', ext: 'cjam', family: 'c', core: false,
    accent: '#C0703A', cm: 'plaintext',
    snippet: `"7 squared = "7 7*
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 40.0, exit: 0 },
  },
  {
    id: 303, name: 'Vyxal', version: '2.x', ext: 'vy', family: 'py', core: false,
    accent: '#7D5BA6', cm: 'plaintext',
    snippet: `\`7 squared = 49\`
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
  },
  {
    id: 304, name: 'Jelly', version: '0.x', ext: 'jelly', family: 'py', core: false,
    accent: '#C13B8A', cm: 'plaintext',
    snippet: `7²
`,
    sampleStdin: '', output: ['49'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
  },
  {
    id: 305, name: 'Samarium', version: '0.x', ext: 'sm', family: 'py', core: false,
    accent: '#C0392B', cm: 'plaintext',
    snippet: `=> * {
    "Hello, World!"!;
}
`,
    sampleStdin: '', output: ['Hello, World!'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
  },
  {
    id: 306, name: 'Paradoc', version: '0.x', ext: 'prdc', family: 'py', core: false,
    accent: '#2C8C99', cm: 'plaintext',
    snippet: `"7 squared = 49"
`,
    sampleStdin: '', output: ['7 squared = 49'],
    metrics: { time: 0.3, memory: 30.0, exit: 0 },
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
