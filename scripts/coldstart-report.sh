#!/usr/bin/env bash
#
# coldstart-report.sh — COLD wall-time + memory datasheet per language, with
# BOTH caches bypassed (no result cache, no compile cache).
#
# Two caches sit in front of a real sandboxed run:
#   • result cache (moka)  keyed on blake3(language_id, source, stdin, limits)
#   • compile cache (PG)   keyed on blake3(language_id, source, compile_options),
#                          consulted only for languages with a non-empty compile_cmd.
#
# To force a real cold run for every language WITHOUT touching the database:
#   • unique stdin nonce per request                  → result-cache miss (all langs)
#   • unique nonce baked into the SOURCE as a comment  → compile-cache miss (the 26
#     compiled langs). Output is unchanged ("hello"), only the cache key moves.
#
# Limits: cpu/wall overridden generously (cpu<=30, wall<=60) so a heavy cold
# compile (Rust/Scala/Kotlin/Swift/Dart/...) measures real cost instead of
# tripping a TLE. memory_limit_mb is left UNSET so the response reports each
# language's real default reserved budget — and memory.peak then reflects the
# cold compiler RSS, the honest "first-ever submission" footprint.
#
# Usage:
#   ./scripts/coldstart-report.sh                     # table to stdout
#   API_BASE=http://host:8080 ./scripts/coldstart-report.sh > docs/COLDSTART-REPORT.md
#
# Prereqs: API reachable at $API_BASE, plus curl + jq.

set -uo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
NONCE_BASE="cold-$(date +%s)-$$"
CPU_LIMIT=30
WALL_LIMIT=60

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "missing dependency: $cmd" >&2; exit 1; }
done

# ── per-language comment style for the 26 compiled languages ─────────────────
# Baking "<pre> NONCE <suf>" as the first line busts the compile cache while
# leaving program output identical. Interpreted langs need no source change.
declare -A CMTPRE CMTSUF
for id in 48 52 60 62 73 120 121 140 152 163; do CMTPRE[$id]='//'; done

decorate() {  # decorate <id> <nonce>   — source on stdin, decorated source on stdout
  local id="$1" nonce="$2" src; src="$(cat)"
  local pre="${CMTPRE[$id]:-}"
  if [[ -n "$pre" ]]; then
    if [[ -n "${CMTSUF[$id]:-}" ]]; then printf '%s %s %s\n%s' "$pre" "$nonce" "${CMTSUF[$id]}" "$src"
    else printf '%s %s\n%s' "$pre" "$nonce" "$src"; fi
    return
  fi
  printf '%s' "$src"
}

declare -a ROWS=()

run() {  # run <id> <name>   — source on stdin
  local id="$1" name="$2" src; src="$(cat)"
  local nonce="${NONCE_BASE}-${id}-${RANDOM}"
  local dsrc; dsrc="$(printf '%s' "$src" | decorate "$id" "$nonce")"
  local body resp http status mem reserved wall cpu out
  body=$(jq -n --argjson id "$id" --arg src "$dsrc" --arg stdin "$nonce" \
    --argjson cpu "$CPU_LIMIT" --argjson wall "$WALL_LIMIT" \
    '{language_id:$id, source_code:$src, stdin:$stdin, cpu_time_limit:$cpu, wall_time_limit:$wall}')
  resp=$(curl -s -m 90 -w $'\n%{http_code}' -X POST "${API_BASE}/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null)
  http=$(printf '%s' "$resp" | tail -1); resp=$(printf '%s' "$resp" | sed '$d')
  if [[ "$http" != "200" ]]; then ROWS+=("$id|$name|HTTP$http|0|0|0|0|-"); return; fi
  status=$(printf '%s' "$resp" | jq -r '(.status.kind // .status.description // .status)' 2>/dev/null)
  mem=$(printf '%s' "$resp"   | jq -r '.memory // 0' 2>/dev/null)             # KB peak
  reserved=$(printf '%s' "$resp" | jq -r '.limits.memory_mb // 0' 2>/dev/null) # MB default
  wall=$(printf '%s' "$resp"  | jq -r '.wall_time // 0' 2>/dev/null)
  cpu=$(printf '%s' "$resp"   | jq -r '.time // 0' 2>/dev/null)
  out=$(printf '%s' "$resp"   | jq -r 'def s:.stdout; (if (s|type)=="array" then (s|implode) else (s//"") end) | split("\n")[0] | gsub("^\\s+|\\s+$";"")' 2>/dev/null)
  local ok="yes"; [[ "$out" == *hello* ]] || ok="OUT:$out"
  ROWS+=("$id|$name|$status|$mem|$reserved|$wall|$cpu|$ok")
}

# ── trivial programs (same set as mem-report.sh) ─────────────────────────────
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
  print "# ZeroCode cold-start report — wall time + memory (both caches bypassed)";
  print "";
  print "Trivial \"hello\" per language, forced cold: unique stdin (result-cache";
  print "miss) + a unique nonce comment baked into compiled-language source";
  print "(compile-cache miss). `wall` = wall_time s (cold compile + spawn + run).";
  print "`cpu` = CPU s. `actual` = RUN-phase peak (memory.current sampled across";
  print "the run after the compiler is reaped; KB->MB) — NOT the compiler RSS.";
  print "`reserved` = default_limits.memory_mb held by the admission controller.";
  print "NOTE: a single cold run is page-cache noisy; min-of-N is more stable.";
  print "";
  print "| ID | Language | Status | Wall s | CPU s | Actual MB | Reserved MB | OK |";
  print "|---:|----------|--------|-------:|------:|----------:|------------:|----|";
}
{
  id=$1; name=$2; status=$3; memkb=$4+0; res=$5+0; wall=$6+0; cpu=$7+0; ok=$8;
  actmb=memkb/1024.0;
  printf "| %s | %s | %s | %.3f | %.3f | %.1f | %d | %s |\n", id,name,status,wall,cpu,actmb,res,ok;
  n++; sum_w+=wall; sum_a+=actmb; sum_r+=res;
  if(wall>max_w){max_w=wall; max_wn=name}
  if(actmb>max_a){max_a=actmb; max_an=name}
  if(status!="accepted"){fails=fails (fails?", ":"") name}
}
END {
  print "";
  printf "**%d languages, all forced cold.** ", n;
  printf "Mean cold wall **%.2f s**; slowest cold wall: **%s at %.2f s**.  ", sum_w/n, max_wn, max_w;
  printf "Mean actual peak **%.1f MB**; heaviest: **%s at %.1f MB**.\n\n", sum_a/n, max_an, max_a;
  printf "- Total reserved if all ran concurrently: **%.0f MB**; total actual if run serially: **%.0f MB** (**%.1fx** over-reservation).\n", sum_r, sum_a, sum_r/sum_a;
  if(fails!="") printf "- Non-accepted: %s\n", fails; else print "- All accepted.";
}
'
