#!/usr/bin/env bash
#
# smoke-languages.sh — submit a hello-world for every runnable language in the
# registry and print a PASS/FAIL matrix. Use after building the full runner
# image (runners/Dockerfile) and bringing the stack up, to see which of the
# v1.5 batch languages actually compile + run inside the sandbox.
#
# Prereqs: the API reachable at $API_BASE (default http://localhost:8080),
#          plus curl + jq in PATH.
#
# Usage:
#   ./scripts/smoke-languages.sh                 # test all languages
#   API_BASE=http://host:8080 ./scripts/smoke-languages.sh
#
# Each language prints "hello"; a language passes when status is Accepted and
# stdout contains "hello". raw-wasm (id 200) is skipped — it needs a compiled
# .wasm blob, not source. On FAIL the script prints the status + compile_output
# so you can see why (toolchain missing, compile error, timeout, …).

set -uo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
PASS=0
FAIL=0
FAILED_IDS=()

if [[ -t 1 ]]; then GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else GREEN=''; RED=''; DIM=''; RESET=''; fi

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "missing dependency: $cmd"; exit 1; }
done

# check <id> <name> [expected]   — source is read from stdin (heredoc)
check() {
  local id="$1" name="$2" expect="${3:-hello}" src
  src="$(cat)"
  local body resp http status out cout
  body=$(jq -n --argjson id "$id" --arg src "$src" '{language_id:$id, source_code:$src}')
  resp=$(curl -s -m 120 -w $'\n%{http_code}' \
    -X POST "${API_BASE}/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>&1)
  http=$(printf '%s' "$resp" | tail -1)
  resp=$(printf '%s' "$resp" | sed '$d')

  if [[ "$http" != "200" ]]; then
    FAIL=$((FAIL+1)); FAILED_IDS+=("$id")
    printf "  ${RED}FAIL${RESET} %-14s (id %3s)  HTTP %s\n" "$name" "$id" "$http"
    return
  fi
  status=$(printf '%s' "$resp" | jq -r '(.status.description // .status.id // .status) | tostring' 2>/dev/null)
  out=$(printf '%s' "$resp" | jq -r '.stdout // empty' 2>/dev/null)
  cout=$(printf '%s' "$resp" | jq -r '.compile_output // empty' 2>/dev/null)

  if [[ "$out" == *"$expect"* ]]; then
    PASS=$((PASS+1))
    printf "  ${GREEN}PASS${RESET} %-14s (id %3s)\n" "$name" "$id"
  else
    FAIL=$((FAIL+1)); FAILED_IDS+=("$id")
    printf "  ${RED}FAIL${RESET} %-14s (id %3s)  status=%s\n" "$name" "$id" "$status"
    [[ -n "$out"  ]] && printf "       ${DIM}stdout: %s${RESET}\n" "$(printf '%s' "$out" | head -3 | tr '\n' ' ')"
    [[ -n "$cout" ]] && printf "       ${DIM}compile: %s${RESET}\n" "$(printf '%s' "$cout" | head -3 | tr '\n' ' ')"
  fi
}

printf "ZeroCode language smoke test → %s\n\n" "$API_BASE"
printf "Core 7\n"

check 71 Python   <<'SRC'
print("hello")
SRC
check 63 Node.js  <<'SRC'
console.log("hello")
SRC
check 73 Rust     <<'SRC'
fn main() { println!("hello"); }
SRC
check 60 Go       <<'SRC'
package main
import "fmt"
func main() { fmt.Println("hello") }
SRC
check 48 C        <<'SRC'
#include <stdio.h>
int main(void){ puts("hello"); return 0; }
SRC
check 52 C++      <<'SRC'
#include <iostream>
int main(){ std::cout << "hello\n"; }
SRC
check 62 Java     <<'SRC'
public class Main { public static void main(String[] a){ System.out.println("hello"); } }
SRC

printf "\nBatch A — interpreted\n"
check 100 Bash       <<'SRC'
echo hello
SRC
check 101 Lua        <<'SRC'
print("hello")
SRC
check 102 Perl       <<'SRC'
print "hello\n";
SRC
check 103 Ruby       <<'SRC'
puts "hello"
SRC
check 104 R          <<'SRC'
cat("hello\n")
SRC
check 105 PHP        <<'SRC'
<?php echo "hello\n";
SRC
check 106 TypeScript <<'SRC'
const m: string = "hello";
console.log(m);
SRC

printf "\nBatch B — GCC-family compiled\n"
check 110 Fortran     <<'SRC'
program p
  print *, "hello"
end program p
SRC
check 111 Pascal      <<'SRC'
begin
  writeln('hello');
end.
SRC
check 112 D           <<'SRC'
import std.stdio;
void main() { writeln("hello"); }
SRC
check 113 Objective-C <<'SRC'
#import <stdio.h>
int main(){ printf("hello\n"); return 0; }
SRC
check 114 Assembly    <<'SRC'
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
check 115 Ada         <<'SRC'
with Ada.Text_IO;
procedure Main is
begin
  Ada.Text_IO.Put_Line("hello");
end Main;
SRC

printf "\nBatch C — JVM\n"
check 120 Kotlin  <<'SRC'
fun main() { println("hello") }
SRC
check 121 Scala   <<'SRC'
object main {
  def main(args: Array[String]): Unit = println("hello")
}
SRC
check 122 Groovy  <<'SRC'
println "hello"
SRC
check 123 Clojure <<'SRC'
(println "hello")
SRC

printf "\nBatch D — functional / ML\n"
check 130 Haskell     <<'SRC'
main = putStrLn "hello"
SRC
check 131 OCaml       <<'SRC'
let () = print_endline "hello"
SRC
check 132 Erlang      <<'SRC'
-module(main).
-export([main/0]).
main() -> io:format("hello~n").
SRC
check 133 Elixir      <<'SRC'
IO.puts("hello")
SRC
check 134 "Common Lisp" <<'SRC'
(format t "hello~%")
SRC

printf "\nBatch E — .NET\n"
check 140 "C#" <<'SRC'
using System;
class Program { static void Main(){ Console.WriteLine("hello"); } }
SRC
check 141 "F#" <<'SRC'
printfn "hello"
SRC

printf "\nBatch F — niche\n"
check 150 COBOL  <<'SRC'
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
       PROCEDURE DIVISION.
           DISPLAY "hello".
           STOP RUN.
SRC
check 151 Prolog <<'SRC'
:- initialization(main).
main :- write('hello'), nl, halt.
SRC
check 152 Swift  <<'SRC'
print("hello")
SRC
check 153 Octave <<'SRC'
disp("hello")
SRC
check 154 SQL    <<'SRC'
SELECT 'hello';
SRC

printf "\nBatch G — modern\n"
# Zig (160) removed — compiler can't run in the sandbox (tmpfs cross-dir rename).
check 161 Nim     <<'SRC'
echo "hello"
SRC
check 162 Crystal <<'SRC'
puts "hello"
SRC
check 163 Dart    <<'SRC'
void main() { print("hello"); }
SRC
check 164 Julia   <<'SRC'
println("hello")
SRC

printf "\n%s===================================%s\n" "$DIM" "$RESET"
printf "PASS: ${GREEN}%d${RESET}   FAIL: ${RED}%d${RESET}\n" "$PASS" "$FAIL"
if (( FAIL > 0 )); then
  printf "Failed ids: %s\n" "${FAILED_IDS[*]}"
  exit 1
fi
