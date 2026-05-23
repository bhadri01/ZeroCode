#!/usr/bin/env bash
#
# benchmark.sh — resource + traffic datasheet generator for ZeroCode.
#
# Two independent measurements, both against a running API ($API_BASE):
#
#   bench   Per-language complexity profile. Submits one deterministic
#           hash-loop program per language at three workload tiers and records
#           CPU time, wall time, and peak memory the sandbox reports.
#             easy   N=1          (≈ startup + compile + I/O overhead only)
#             medium N=1,000,000  (runtime/JIT compute)
#             hard   N=10,000,000 (sustained CPU; slow interpreters may TLE)
#           The workload is  s = (s*1000003 + i) mod 4294967291  for i in 1..N.
#           It fits in signed 64-bit (so every language prints the SAME value —
#           used as a correctness check) and is a modular hash, so optimizers
#           can't fold the loop into a closed form. Programs live in
#           benchmarks/programs/{compute,const}/<language_id>.<ext>.
#           Languages with only a const/ program (esoteric/golf + a few niche)
#           are profiled at the easy tier only; medium/hard are reported N/A.
#           -> benchmarks/data/languages.csv
#
#   sweep   Saturation sweep. Drives a fixed batch of submissions at rising
#           concurrency (1,2,4,8,16,32,64) and records throughput (req/s) and
#           client-side latency p50/p95/p99 + error rate at each level, so the
#           knee where the worker pool / sandbox-setup rate saturates is
#           visible. Run twice: a light interpreted payload (pure dispatch +
#           sandbox throughput) and a compiled payload (compile-bound).
#           -> benchmarks/data/throughput.csv
#
# Usage:
#   ./scripts/benchmark.sh bench           # per-language profile
#   ./scripts/benchmark.sh sweep           # saturation sweep
#   ./scripts/benchmark.sh all             # both
#   API_BASE=http://host:8080 ./scripts/benchmark.sh all
#
# Prereqs: a reachable API at $API_BASE, plus curl + jq + awk in PATH.

set -uo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROG_DIR="$ROOT/benchmarks/programs"
DATA_DIR="$ROOT/benchmarks/data"
mkdir -p "$DATA_DIR"

# Per-submission ceilings (the API caps cpu<=30, wall<=60, mem<=1024). Generous
# so heavy runs measure real cost rather than tripping the small global default.
CPU_LIMIT=30
WALL_LIMIT=60
MEM_LIMIT=1024

if [[ -t 1 ]]; then G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[0;33m'; D=$'\033[2m'; B=$'\033[1m'; X=$'\033[0m'
else G=''; R=''; Y=''; D=''; B=''; X=''; fi

for c in curl jq awk; do command -v "$c" >/dev/null || { echo "missing dependency: $c"; exit 1; }; done

# id -> name map from the live registry.
declare -A NAME
load_names() {
  local json; json=$(curl -s -m 10 "$API_BASE/v1/languages") || { echo "API unreachable at $API_BASE"; exit 1; }
  while IFS=$'\t' read -r id nm; do NAME[$id]="$nm"; done < <(printf '%s' "$json" | jq -r '.[] | "\(.id)\t\(.name)"')
}

# submit <language_id> <stdin> <source>  -> echoes "status<TAB>cpu<TAB>wall<TAB>memMB<TAB>stdout1"
submit() {
  local id="$1" in="$2" src="$3" body resp http
  body=$(jq -n --argjson id "$id" --arg s "$src" --arg in "$in" \
    --argjson cpu "$CPU_LIMIT" --argjson wall "$WALL_LIMIT" --argjson mem "$MEM_LIMIT" \
    '{language_id:$id, source_code:$s, stdin:$in, cpu_time_limit:$cpu, wall_time_limit:$wall, memory_limit_mb:$mem}')
  resp=$(curl -s -m 90 -w $'\n%{http_code}' -X POST "$API_BASE/v1/submissions?wait=true" \
    -H 'Content-Type: application/json' -d "$body" 2>&1)
  http=$(printf '%s' "$resp" | tail -1); resp=$(printf '%s' "$resp" | sed '$d')
  if [[ "$http" != "200" ]]; then printf 'http%s\t0\t0\t0\t\n' "$http"; return; fi
  # stdout may come back as a JSON string (cached path) or a byte array
  # (fresh path) — `implode` normalizes the array form to a string.
  printf '%s' "$resp" | jq -r '
    def s: .stdout; def txt: (if (s|type)=="array" then (s|implode) else (s // "") end);
    [ (.status.kind // .status.description // "?"),
      (.time // 0), (.wall_time // 0),
      ((.memory // 0) / 1024 | floor),
      (txt | split("\n")[0] | gsub("^\\s+|\\s+$";"")) ] | @tsv'
}

# ─── bench: per-language complexity profile ─────────────────────────────────
# Each compute language is warmed once (populates the compile cache) so the
# three timed tiers measure RUN cost with compile cached, comparable across
# compiled + interpreted. cold_wall_s = the warmup's wall (compile + spawn +
# tiny run) — what a brand-new unique submission pays; compile_est_s ≈
# cold_wall_s − easy_wall_s. Per-tier stdin differs, so no result-cache hits.
bench() {
  load_names
  local csv="$DATA_DIR/languages.csv"
  echo "language_id,language,tier,n,status,cpu_s,wall_s,mem_mb,output_ok,cold_wall_s,compile_est_s" > "$csv"
  printf "${B}ZeroCode per-language complexity profile${X} -> %s\n" "$API_BASE"
  printf "%-14s %-7s %10s %10s %9s %8s %8s  %s\n" "language" "tier" "cpu_s" "wall_s" "mem_mb" "cold_s" "verdict" "ok"

  declare -A EXP=( [1]=1 [1000000]=213617107 [10000000]=2580963055 )
  local tiers_n=(1 1000000 10000000); local tiers_t=(easy medium hard)

  for f in $(ls "$PROG_DIR/compute/" | sort -t. -k1 -n); do
    local id="${f%%.*}" src; src=$(cat "$PROG_DIR/compute/$f"); local nm="${NAME[$id]:-id$id}"
    [[ -z "${NAME[$id]:-}" ]] && continue
    # Warmup (unique stdin "3") → cold compile + cache populate.
    local wstatus wcpu wwall wmem wout cold_wall
    IFS=$'\t' read -r wstatus wcpu wwall wmem wout < <(submit "$id" $'3\n' "$src")
    cold_wall="$wwall"
    local easy_wall="0"
    local ti
    for ti in 0 1 2; do
      local N="${tiers_n[$ti]}" T="${tiers_t[$ti]}"
      IFS=$'\t' read -r status cpu wall mem out < <(submit "$id" "$N"$'\n' "$src")
      [[ "$ti" == 0 ]] && easy_wall="$wall"
      local ok="-"
      if [[ "$status" == "accepted" ]]; then
        [[ "$out" == "${EXP[$N]}" ]] && ok="yes" || ok="MISMATCH($out)"
      fi
      local comp; comp=$(awk -v c="$cold_wall" -v e="$easy_wall" 'BEGIN{d=c-e; printf "%.3f", (d>0?d:0)}')
      echo "$id,$nm,$T,$N,$status,$cpu,$wall,$mem,$ok,$cold_wall,$comp" >> "$csv"
      local col="$G"; [[ "$status" != "accepted" ]] && col="$R"; [[ "$ok" == MISMATCH* ]] && col="$Y"
      printf "%-14s %-7s %10.3f %10.3f %9s %8.3f ${col}%8s${X}  %s\n" "$nm" "$T" "$cpu" "$wall" "$mem" "$cold_wall" "$status" "$ok"
    done
  done

  # const/ programs: easy tier only (esoteric/niche; medium/hard N/A).
  if [[ -d "$PROG_DIR/const" ]]; then
    for f in $(ls "$PROG_DIR/const/" 2>/dev/null | sort -t. -k1 -n); do
      local id="${f%%.*}" src; src=$(cat "$PROG_DIR/const/$f"); local nm="${NAME[$id]:-id$id}"
      [[ -z "${NAME[$id]:-}" ]] && continue
      IFS=$'\t' read -r status cpu wall mem out < <(submit "$id" "" "$src")
      local ok="-"; [[ "$status" == "accepted" && -n "$out" ]] && ok="yes"
      echo "$id,$nm,easy,const,$status,$cpu,$wall,$mem,$ok,$wall," >> "$csv"
      echo "$id,$nm,medium,NA,na,,,,,," >> "$csv"
      echo "$id,$nm,hard,NA,na,,,,,," >> "$csv"
      local col="$G"; [[ "$status" != "accepted" ]] && col="$R"
      printf "%-14s %-7s %10.3f %10.3f %9s %8s ${col}%8s${X}  %s\n" "$nm" "easy*" "$cpu" "$wall" "$mem" "-" "$status" "$ok"
    done
  fi
  printf "\n${D}wrote %s${X}\n" "$csv"
}

# ─── sweep: saturation under concurrency ────────────────────────────────────
# Each request is GLOBALLY UNIQUE (a per-run nonce + the level + the index are
# baked into the source) so it misses both the result cache and the compile
# cache on every level — measuring real per-job sandbox execution capacity,
# which is the path that saturates under traffic.
# one_shot <nonce> <workload:py|cpp> <level> <index>  -> "<http> <time_total>"
one_shot() {
  local nonce="$1" w="$2" lvl="$3" i="$4" lid src body
  # NB: compute tag on its own line — a single `local a=.. b="$a"` evaluates all
  # RHS before assigning, so referencing nonce/lvl/i above would read empty.
  local tag="${nonce}_${lvl}_${i}"
  if [[ "$w" == cpp ]]; then
    lid=52; src=$(printf '// %s\n#include <iostream>\nint main(){std::cout<<"%s";}' "$tag" "$tag")
  else
    lid=71; src=$(printf 'print("%s")' "$tag")
  fi
  body=$(jq -n --argjson id "$lid" --arg s "$src" '{language_id:$id, source_code:$s, stdin:""}')
  curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -m 90 \
    -X POST "$API_BASE/v1/submissions?wait=true" -H 'Content-Type: application/json' \
    -d "$body" >> "$RESULTS"
}
export -f one_shot

run_level() {  # run_level <workload> <concurrency> <total>
  local w="$1" C="$2" TOTAL="$3"
  RESULTS=$(mktemp); export RESULTS API_BASE
  local nonce; nonce="$(date +%s)$$"
  local t0 t1; t0=$(date +%s.%N)
  seq 1 "$TOTAL" | xargs -P "$C" -I{} bash -c 'one_shot "$1" "$2" "$3" "$0"' "{}" "$nonce" "$w" "$C" >/dev/null 2>&1
  t1=$(date +%s.%N)
  awk -v C="$C" -v t0="$t0" -v t1="$t1" '
    function pct(p,   idx){ idx=int(p*n); if(idx<1)idx=1; if(idx>n)idx=n; return a[idx] }
    { lat[NR]=$2*1000; if($1!=200) err++ }
    END {
      n=NR; if(n==0){ printf "%d,0,0,0,0,0,0\n", C; exit }
      for(i=1;i<=n;i++) a[i]=lat[i];
      for(i=1;i<=n;i++) for(j=i+1;j<=n;j++) if(a[j]<a[i]){t=a[i];a[i]=a[j];a[j]=t}
      el=t1-t0; thr=(el>0)?n/el:0;
      printf "%d,%d,%.2f,%.1f,%.1f,%.1f,%d\n", C, n, thr, pct(0.50), pct(0.95), pct(0.99), err+0
    }' "$RESULTS"
  rm -f "$RESULTS"
}

sweep_one() {  # sweep_one <label> <workload> <total>
  local label="$1" w="$2" TOTAL="$3" C line
  printf "\n${B}saturation sweep: %s${X} (unique payloads, total=%s/level)\n" "$label" "$TOTAL"
  printf "%4s %6s %10s %9s %9s %9s %6s\n" "conc" "n" "req/s" "p50ms" "p95ms" "p99ms" "err"
  for C in 1 2 4 8 16 32 64; do
    line=$(run_level "$w" "$C" "$TOTAL")
    echo "$label,$line" >> "$DATA_DIR/throughput.csv"
    IFS=',' read -r cc n thr p50 p95 p99 err <<<"$line"
    local col="$G"; (( err > 0 )) && col="$Y"
    printf "%4s %6s %10s %9s %9s %9s ${col}%6s${X}\n" "$cc" "$n" "$thr" "$p50" "$p95" "$p99" "$err"
  done
}

sweep() {
  local csv="$DATA_DIR/throughput.csv"
  echo "workload,concurrency,n,throughput_rps,p50_ms,p95_ms,p99_ms,errors" > "$csv"
  printf "${B}host:${X} nproc=%s mem=%s\n" "$(nproc)" "$(free -h 2>/dev/null | awk '/Mem:/{print $2}')"
  # Light interpreted payload — measures dispatch + sandbox-setup + run capacity.
  sweep_one "python-light" "py" 80
  # Compiled payload — adds per-job compile cost (cache-missed each time).
  sweep_one "cpp-compile" "cpp" 40
  printf "\n${D}wrote %s${X}\n" "$csv"
}

case "${1:-all}" in
  bench) bench ;;
  sweep) sweep ;;
  all)   bench; sweep ;;
  *) echo "usage: $0 {bench|sweep|all}"; exit 1 ;;
esac
