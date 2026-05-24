#!/usr/bin/env bash
#
# coldstart-core.sh — cold wall-time + RUN-phase memory for the 11 supported
# languages, both caches bypassed. Companion to coldstart-report.sh, scoped to
# the trimmed registry and used to verify the compile→run memory.peak reset:
# the reported `actual` should now be the program's run footprint (<30 MB for
# the core langs), not the compiler's transient RSS.
#
# Cold forcing: unique stdin (result-cache miss) + a unique // nonce comment in
# compiled-language source (compile-cache miss → real cold compile). The 5
# compiled langs here (C, C++, Go, Java, Rust) all take // comments.
#
# Usage: [API_BASE=http://host:8080] ./scripts/coldstart-core.sh

set -uo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
NONCE_BASE="coldcore-$(date +%s)-$$"
CPU_LIMIT=30; WALL_LIMIT=60
for c in curl jq; do command -v "$c" >/dev/null || { echo "missing $c" >&2; exit 1; }; done

declare -A SLASH=( [48]=1 [52]=1 [60]=1 [62]=1 [73]=1 )  # compiled → bust compile cache
declare -a ROWS=()

run() {  # run <id> <name>   source on stdin
  local id="$1" name="$2" src; src="$(cat)"
  local nonce="${NONCE_BASE}-${id}-${RANDOM}"
  local dsrc="$src"
  [[ -n "${SLASH[$id]:-}" ]] && dsrc="// $nonce"$'\n'"$src"
  local body resp http
  body=$(jq -n --argjson id "$id" --arg s "$dsrc" --arg in "$nonce" \
    --argjson cpu "$CPU_LIMIT" --argjson wall "$WALL_LIMIT" \
    '{language_id:$id, source_code:$s, stdin:$in, cpu_time_limit:$cpu, wall_time_limit:$wall}')
  resp=$(curl -s -m 90 -w $'\n%{http_code}' -X POST "${API_BASE}/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null)
  http=$(printf '%s' "$resp" | tail -1); resp=$(printf '%s' "$resp" | sed '$d')
  if [[ "$http" != "200" ]]; then ROWS+=("$id|$name|HTTP$http|0|0|0|-"); return; fi
  local status mem reserved wall out
  status=$(printf '%s' "$resp" | jq -r '(.status.kind // .status.description // .status)')
  mem=$(printf '%s' "$resp"   | jq -r '.memory // 0')
  reserved=$(printf '%s' "$resp" | jq -r '.limits.memory_mb // 0')
  wall=$(printf '%s' "$resp"  | jq -r '.wall_time // 0')
  out=$(printf '%s' "$resp"   | jq -r 'def s:.stdout;(if (s|type)=="array" then (s|implode) else (s//"") end)|split("\n")[0]|gsub("^\\s+|\\s+$";"")')
  local ok="yes"; [[ "$out" == *hello* ]] || ok="OUT:$out"
  ROWS+=("$id|$name|$status|$mem|$reserved|$wall|$ok")
}

run 48  C        <<'SRC'
#include <stdio.h>
int main(void){ puts("hello"); return 0; }
SRC
run 52  C++      <<'SRC'
#include <iostream>
int main(){ std::cout << "hello\n"; }
SRC
run 60  Go       <<'SRC'
package main
import "fmt"
func main(){ fmt.Println("hello") }
SRC
run 62  Java     <<'SRC'
public class Main { public static void main(String[] a){ System.out.println("hello"); } }
SRC
run 63  Node.js  <<'SRC'
console.log("hello")
SRC
run 71  Python   <<'SRC'
print("hello")
SRC
run 73  Rust     <<'SRC'
fn main(){ println!("hello"); }
SRC
run 100 Bash     <<'SRC'
echo hello
SRC
run 103 Ruby     <<'SRC'
puts "hello"
SRC
run 105 PHP      <<'SRC'
<?php echo "hello\n";
SRC
run 106 TypeScript <<'SRC'
const m: string = "hello"; console.log(m);
SRC

printf '%s\n' "${ROWS[@]}" | awk -F'|' '
BEGIN{
  print "| ID | Language | Status | Wall s | Actual MB | Reserved MB | <30? | OK |";
  print "|---:|----------|--------|-------:|----------:|------------:|:----:|----|";
}
{
  id=$1;name=$2;st=$3;mem=$4+0;res=$5+0;wall=$6+0;ok=$7;
  act=mem/1024.0; tag=(act<30)?"\342\234\223":"\342\234\227";
  printf "| %s | %s | %s | %.3f | %.1f | %d | %s | %s |\n",id,name,st,wall,act,res,tag,ok;
  n++; if(act>=30 && st=="accepted") over=over (over?", ":"") name;
}
END{
  print "";
  printf "%d languages. ", n;
  if(over!="") printf "Run-phase actual >=30 MB: %s.\n", over; else print "All run-phase actuals <30 MB.";
}
'
