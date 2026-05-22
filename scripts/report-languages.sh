#!/usr/bin/env bash
#
# report-languages.sh — run a representative program for every runnable language
# and print a per-language report of stdout, CPU time, wall time and memory.
#
# It reuses the same known-good sources as smoke-languages.sh, but instead of a
# PASS/FAIL matrix it reports the full metrics the API returns for each run
# (.status, .exit_code, .time, .wall_time, .memory). A machine-readable TSV is
# also written to $TSV for further processing.
#
# Prereqs: API reachable at $API_BASE (default http://localhost:8080); curl, jq,
#          awk in PATH. raw-wasm (id 200) is skipped (needs a .wasm blob).
#
# Usage:
#   ./scripts/report-languages.sh
#   API_BASE=http://host:8080 TSV=/tmp/report.tsv ./scripts/report-languages.sh

set -uo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
TSV="${TSV:-/tmp/zerocode-language-report.tsv}"

for cmd in curl jq awk; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "missing dependency: $cmd"; exit 1; }
done

if [[ -t 1 ]]; then GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else GREEN=''; RED=''; DIM=''; BOLD=''; RESET=''; fi

PASS=0; FAIL=0; FAILED=()
TOTAL_CPU=0

printf 'id\tname\tstatus\texit\tcpu_s\twall_s\tmem_mb\tstdout\n' > "$TSV"

hr() { printf '%s\n' "-------------------------------------------------------------------------------------------"; }
header() {
  printf "${BOLD}%-4s %-13s %-10s %-4s %8s %8s %9s  %s${RESET}\n" \
    ID Language Status Exit "CPU(s)" "Wall(s)" "Mem(MB)" "stdout"
  hr
}

# run <id> <name> [expect]   — source is read from stdin (heredoc)
run() {
  local id="$1" name="$2" expect="${3:-hello}" src
  src="$(cat)"
  local body resp http status exitc t wt memkb out cout out1 memmb color
  body=$(jq -n --argjson id "$id" --arg src "$src" '{language_id:$id, source_code:$src}')
  resp=$(curl -s -m 180 -w $'\n%{http_code}' \
    -X POST "${API_BASE}/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>&1)
  http=$(printf '%s' "$resp" | tail -1)
  resp=$(printf '%s' "$resp" | sed '$d')

  if [[ "$http" != "200" ]]; then
    status="http$http"; exitc="-"; t=0; wt=0; memkb=0; out=""; cout=""
  else
    status=$(jq -r '(.status.kind // .status.description // .status) | tostring' <<<"$resp" 2>/dev/null)
    exitc=$(jq -r '.exit_code // "-"' <<<"$resp" 2>/dev/null)
    t=$(jq -r '.time // 0' <<<"$resp" 2>/dev/null)
    wt=$(jq -r '.wall_time // 0' <<<"$resp" 2>/dev/null)
    memkb=$(jq -r '.memory // 0' <<<"$resp" 2>/dev/null)
    out=$(jq -r '.stdout // ""' <<<"$resp" 2>/dev/null)
    cout=$(jq -r '.compile_output // ""' <<<"$resp" 2>/dev/null)
  fi

  memmb=$(awk -v k="$memkb" 'BEGIN{printf "%.1f", k/1024}')
  out1=$(printf '%s' "$out" | head -1 | tr -d '\r' | cut -c1-42)
  TOTAL_CPU=$(awk -v a="$TOTAL_CPU" -v b="$t" 'BEGIN{printf "%.3f", a+b}')

  if [[ "$status" == "accepted" && "$out" == *"$expect"* ]]; then
    PASS=$((PASS+1)); color="$GREEN"
  else
    FAIL=$((FAIL+1)); FAILED+=("$id:$name"); color="$RED"
  fi

  printf "${color}%-4s${RESET} %-13s ${color}%-10s${RESET} %-4s %8.3f %8.3f %9s  ${DIM}%s${RESET}\n" \
    "$id" "$name" "$status" "$exitc" "$t" "$wt" "$memmb" "$out1"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$id" "$name" "$status" "$exitc" "$t" "$wt" "$memmb" "$out1" >> "$TSV"

  if [[ "$color" == "$RED" && -n "$cout" ]]; then
    printf "       ${DIM}compile: %s${RESET}\n" "$(printf '%s' "$cout" | head -2 | tr '\n' ' ' | cut -c1-110)"
  fi
}

printf "${BOLD}ZeroCode language report${RESET} → %s   %s%s%s\n\n" \
  "$API_BASE" "$DIM" "$(date '+%Y-%m-%d %H:%M:%S')" "$RESET"
header

run 71  Python   <<'SRC'
print("hello")
SRC
run 63  Node.js  <<'SRC'
console.log("hello")
SRC
run 73  Rust     <<'SRC'
fn main() { println!("hello"); }
SRC
run 60  Go       <<'SRC'
package main
import "fmt"
func main() { fmt.Println("hello") }
SRC
run 48  C        <<'SRC'
#include <stdio.h>
int main(void){ puts("hello"); return 0; }
SRC
run 52  C++      <<'SRC'
#include <iostream>
int main(){ std::cout << "hello\n"; }
SRC
run 62  Java     <<'SRC'
public class Main { public static void main(String[] a){ System.out.println("hello"); } }
SRC
run 100 Bash       <<'SRC'
echo hello
SRC
run 101 Lua        <<'SRC'
print("hello")
SRC
run 102 Perl       <<'SRC'
print "hello\n";
SRC
run 103 Ruby       <<'SRC'
puts "hello"
SRC
run 104 R          <<'SRC'
cat("hello\n")
SRC
run 105 PHP        <<'SRC'
<?php echo "hello\n";
SRC
run 106 TypeScript <<'SRC'
const m: string = "hello";
console.log(m);
SRC
run 110 Fortran     <<'SRC'
program p
  print *, "hello"
end program p
SRC
run 111 Pascal      <<'SRC'
begin
  writeln('hello');
end.
SRC
run 112 D           <<'SRC'
import std.stdio;
void main() { writeln("hello"); }
SRC
run 113 Objective-C <<'SRC'
#import <stdio.h>
int main(){ printf("hello\n"); return 0; }
SRC
run 114 Assembly    <<'SRC'
section .data
msg db "hello", 10
len equ $ - msg
section .text
global _start
_start:
  mov rax, 1
  mov rdi, 1
  mov rsi, msg
  mov rdx, len
  syscall
  mov rax, 60
  xor rdi, rdi
  syscall
SRC
run 115 Ada         <<'SRC'
with Ada.Text_IO;
procedure Main is
begin
  Ada.Text_IO.Put_Line("hello");
end Main;
SRC
run 120 Kotlin  <<'SRC'
fun main() { println("hello") }
SRC
run 121 Scala   <<'SRC'
object main {
  def main(args: Array[String]): Unit = println("hello")
}
SRC
run 122 Groovy  <<'SRC'
println "hello"
SRC
run 123 Clojure <<'SRC'
(println "hello")
SRC
run 130 Haskell     <<'SRC'
main = putStrLn "hello"
SRC
run 131 OCaml       <<'SRC'
let () = print_endline "hello"
SRC
run 132 Erlang      <<'SRC'
-module(main).
-export([main/0]).
main() -> io:format("hello~n").
SRC
run 133 Elixir      <<'SRC'
IO.puts("hello")
SRC
run 134 "Common Lisp" <<'SRC'
(format t "hello~%")
SRC
run 140 "C#" <<'SRC'
using System;
class Program { static void Main(){ Console.WriteLine("hello"); } }
SRC
run 141 "F#" <<'SRC'
printfn "hello"
SRC
run 150 COBOL  <<'SRC'
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
           DISPLAY "hello".
           STOP RUN.
SRC
run 151 Prolog <<'SRC'
:- initialization(main).
main :- write('hello'), nl, halt.
SRC
run 152 Swift  <<'SRC'
print("hello")
SRC
run 153 Octave <<'SRC'
disp("hello")
SRC
run 154 SQL    <<'SRC'
SELECT 'hello';
SRC
run 161 Nim     <<'SRC'
echo "hello"
SRC
run 162 Crystal <<'SRC'
puts "hello"
SRC
run 163 Dart    <<'SRC'
void main() { print("hello"); }
SRC
run 164 Julia   <<'SRC'
println("hello")
SRC

run 170 Racket       <<'SRC'
#lang racket
(displayln "hello")
SRC
run 171 Raku         <<'SRC'
say "hello";
SRC
run 172 AWK          <<'SRC'
BEGIN { print "hello" }
SRC
run 173 CoffeeScript <<'SRC'
console.log "hello"
SRC
run 174 Forth        <<'SRC'
." hello" cr
SRC
run 176 "Emacs Lisp" <<'SRC'
(princ "hello\n")
SRC
run 177 Verilog      <<'SRC'
module main;
  initial $display("hello");
endmodule
SRC
run 178 "LLVM IR"    <<'SRC'
@.s = private unnamed_addr constant [6 x i8] c"hello\00"
declare i32 @puts(ptr)
define i32 @main() {
  call i32 @puts(ptr @.s)
  ret i32 0
}
SRC
run 179 V            <<'SRC'
fn main() {
	println('hello')
}
SRC
run 180 FreeBASIC    <<'SRC'
Print "hello"
SRC
run 181 PowerShell   <<'SRC'
Write-Output "hello"
SRC
run 182 Pony         <<'SRC'
actor Main
  new create(env: Env) =>
    env.out.print("hello")
SRC

run 300 Brainfuck "Hello World!" <<'SRC'
++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.
SRC
run 301 GolfScript <<'SRC'
"hello"
SRC
run 302 CJam       <<'SRC'
"hello"
SRC
run 303 Vyxal      <<'SRC'
`hello`
SRC
run 304 Jelly "49" <<'SRC'
7²
SRC
run 305 Samarium   <<'SRC'
=> * {
    "hello"!;
}
SRC
run 306 Paradoc    <<'SRC'
"hello"
SRC

hr
printf "${BOLD}PASS ${GREEN}%d${RESET}${BOLD}   FAIL ${RED}%d${RESET}${BOLD}   total CPU %ss${RESET}\n" \
  "$PASS" "$FAIL" "$TOTAL_CPU"
if (( FAIL > 0 )); then printf "${RED}failed:${RESET} %s\n" "${FAILED[*]}"; fi

printf "\n${BOLD}Top 5 by memory${RESET}\n"
tail -n +2 "$TSV" | sort -t$'\t' -k7 -rn | head -5 | awk -F'\t' '{printf "  %-13s %6s MB\n",$2,$7}'
printf "${BOLD}Top 5 by wall time${RESET}\n"
tail -n +2 "$TSV" | sort -t$'\t' -k6 -rn | head -5 | awk -F'\t' '{printf "  %-13s %7.3f s\n",$2,$6}'
printf "\n${DIM}TSV written to %s${RESET}\n" "$TSV"
