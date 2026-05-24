#!/usr/bin/env bash
#
# mem-report.sh — measure the ACTUAL peak memory a trivial ("hello") program
# uses per language, with the result cache BYPASSED, and compare it to the
# reserved `default_limits.memory_mb` that the worker's admission controller
# holds for the whole job.
#
# Why cache-bypassed: the result cache is keyed on
# blake3(language_id, source, stdin, limits). A hello-world ignores stdin, so we
# send a unique stdin nonce per request — same source, same output, but a fresh
# cache key every time, forcing a real sandboxed run that reports cgroup
# memory.peak (the `memory` field, in KB).
#
# The gap between "actual" and "reserved" is why simple runs feel heavy: a
# Kotlin "hello" actually touches ~40 MB but the admission controller reserves
# its full 1024 MB budget slice for the duration, so a burst admits very few.
#
# Usage:
#   ./scripts/mem-report.sh                       # all languages, table to stdout
#   API_BASE=http://host:8080 ./scripts/mem-report.sh
#   ./scripts/mem-report.sh > docs/MEMORY-REPORT.md   # capture as a report
#
# Prereqs: API reachable at $API_BASE, plus curl + jq.

set -uo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
NONCE_BASE="memrep-$(date +%s)-$$"

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "missing dependency: $cmd" >&2; exit 1; }
done

declare -a ROWS=()

# run <id> <name>   — source read from stdin (heredoc)
run() {
  local id="$1" name="$2" src; src="$(cat)"
  local nonce="${NONCE_BASE}-${id}-${RANDOM}"
  local body resp status mem reserved wall http
  body=$(jq -n --argjson id "$id" --arg src "$src" --arg stdin "$nonce" \
    '{language_id:$id, source_code:$src, stdin:$stdin}')
  resp=$(curl -s -m 120 -w $'\n%{http_code}' -X POST "${API_BASE}/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null)
  http=$(printf '%s' "$resp" | tail -1)
  resp=$(printf '%s' "$resp" | sed '$d')
  if [[ "$http" != "200" ]]; then
    ROWS+=("$id|$name|HTTP$http|0|0|0"); return
  fi
  status=$(printf '%s' "$resp" | jq -r '(.status.description // .status.kind // .status)' 2>/dev/null)
  mem=$(printf '%s' "$resp"   | jq -r '.memory // 0' 2>/dev/null)            # KB, actual peak
  reserved=$(printf '%s' "$resp" | jq -r '.limits.memory_mb // 0' 2>/dev/null) # MB, reserved
  wall=$(printf '%s' "$resp"  | jq -r '.wall_time // 0' 2>/dev/null)
  ROWS+=("$id|$name|$status|$mem|$reserved|$wall")
}

# ── trivial programs (same set as smoke-languages.sh; raw-wasm 200 skipped) ──
run 71  Python   <<'SRC'
print("hello")
SRC
run 63  Node.js  <<'SRC'
console.log("hello")
SRC
run 73  Rust     <<'SRC'
fn main(){ println!("hello"); }
SRC
run 60  Go       <<'SRC'
package main
import "fmt"
func main(){ fmt.Println("hello") }
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
run 100 Bash     <<'SRC'
echo hello
SRC
run 101 Lua      <<'SRC'
print("hello")
SRC
run 102 Perl     <<'SRC'
print "hello\n";
SRC
run 103 Ruby     <<'SRC'
puts "hello"
SRC
run 104 R        <<'SRC'
cat("hello\n")
SRC
run 105 PHP      <<'SRC'
<?php echo "hello\n";
SRC
run 106 TypeScript <<'SRC'
const m: string = "hello"; console.log(m);
SRC
run 120 Kotlin   <<'SRC'
fun main(){ println("hello") }
SRC
run 121 Scala    <<'SRC'
object main { def main(args: Array[String]): Unit = println("hello") }
SRC
run 140 "C#"     <<'SRC'
using System;
class Program { static void Main(){ Console.WriteLine("hello"); } }
SRC
run 152 Swift    <<'SRC'
print("hello")
SRC
run 154 SQL      <<'SRC'
SELECT 'hello';
SRC
run 163 Dart     <<'SRC'
void main(){ print("hello"); }
SRC

# ── render report ────────────────────────────────────────────────────────────
printf '%s\n' "${ROWS[@]}" | awk -F'|' '
BEGIN {
  print "# ZeroCode memory report — actual vs reserved (cache bypassed)";
  print "";
  print "Trivial \"hello\" program per language. `actual` = cgroup memory.peak";
  print "(the `memory` field, KB→MB). `reserved` = default_limits.memory_mb, the";
  print "amount the worker admission controller holds for the whole job.";
  print "";
  print "| ID | Language | Status | Actual MB | Reserved MB | Reserved/Actual |";
  print "|---:|----------|--------|----------:|------------:|----------------:|";
}
{
  id=$1; name=$2; status=$3; memkb=$4+0; res=$5+0;
  actmb = memkb/1024.0;
  ratio = (actmb>0) ? res/actmb : 0;
  printf "| %s | %s | %s | %.1f | %d | %.0f× |\n", id, name, status, actmb, res, ratio;
  sum_act += actmb; sum_res += res; n++;
  if (actmb>max_act){max_act=actmb; max_act_n=name}
}
END {
  print "";
  printf "**%d languages.** Total actual peak (if all ran once, serially): **%.0f MB**.  ", n, sum_act;
  printf "Total reserved (if all ran concurrently): **%.0f MB**.\n\n", sum_res;
  printf "- Mean actual per simple run: **%.1f MB**;  mean reserved: **%.0f MB**.\n", sum_act/n, sum_res/n;
  printf "- Heaviest actual: **%s** at **%.1f MB**.\n", max_act_n, max_act;
  printf "- Aggregate over-reservation: **%.1f×** (reserved %.0f MB vs actual %.0f MB).\n", sum_res/sum_act, sum_res, sum_act;
}
'
