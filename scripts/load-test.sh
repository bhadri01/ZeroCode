#!/usr/bin/env bash
set -euo pipefail

# ─── Load Test for ZeroCode API ─────────────────────────────────────────────
# Runs a sustained load test against a running ZeroCode instance using oha.
# Requires: oha (https://github.com/hatoo/oha) — install via cargo install oha
# ─────────────────────────────────────────────────────────────────────────────

# Defaults
DURATION=60
CONCURRENCY=50
RPS=100
API_BASE="${API_BASE:-http://localhost:8080}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [-d DURATION] [-c CONCURRENCY] [-r RPS] [-h]

Options:
  -d DURATION      Test duration in seconds (default: 60)
  -c CONCURRENCY   Number of concurrent connections (default: 50)
  -r RPS           Requests per second target (default: 100)
  -h               Show this help message

Environment:
  API_BASE         Base URL of the ZeroCode API (default: http://localhost:8080)

Latency targets (from performance plan):
  p50 < 60ms   p99 < 300ms (cold submission)
  p50 < 10ms   (cache hit)
EOF
  exit 0
}

while getopts "d:c:r:h" opt; do
  case "$opt" in
    d) DURATION="$OPTARG" ;;
    c) CONCURRENCY="$OPTARG" ;;
    r) RPS="$OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

# ─── Preflight ───────────────────────────────────────────────────────────────

if ! command -v oha &>/dev/null; then
  echo "ERROR: oha is not installed."
  echo "Install it with:  cargo install oha"
  echo "Or via Homebrew:  brew install oha"
  exit 1
fi

SUBMIT_URL="${API_BASE}/submissions?wait=true"
PAYLOAD='{"language_id":71,"source_code":"print('\''hello'\'')","stdin":""}'

echo "=============================================="
echo " ZeroCode Load Test"
echo "=============================================="
echo " Target:       ${API_BASE}"
echo " Duration:     ${DURATION}s"
echo " Concurrency:  ${CONCURRENCY}"
echo " Target RPS:   ${RPS}"
echo " Endpoint:     ${SUBMIT_URL}"
echo "=============================================="
echo ""

# ─── Phase 1: Warm-up ───────────────────────────────────────────────────────

echo "──────────────────────────────────────────────"
echo " Phase 1: Warm-up (10s at 10 RPS)"
echo "──────────────────────────────────────────────"

oha -z 10s \
  --rate 10 \
  -c 10 \
  -m POST \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" \
  "${SUBMIT_URL}"

echo ""

# ─── Phase 2: Sustained Load ────────────────────────────────────────────────

echo "──────────────────────────────────────────────"
echo " Phase 2: Sustained Load (${DURATION}s at ${RPS} RPS)"
echo "──────────────────────────────────────────────"

oha -z "${DURATION}s" \
  --rate "${RPS}" \
  -c "${CONCURRENCY}" \
  -m POST \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" \
  "${SUBMIT_URL}"

echo ""

# ─── Phase 3: Cache-Hit Verification ────────────────────────────────────────
# Re-submits the exact same code to exercise the result cache.

echo "──────────────────────────────────────────────"
echo " Phase 3: Cache-Hit Verification (30s, same payload)"
echo "──────────────────────────────────────────────"

oha -z 30s \
  --rate "${RPS}" \
  -c "${CONCURRENCY}" \
  -m POST \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" \
  "${SUBMIT_URL}"

echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────

echo "=============================================="
echo " Load Test Complete"
echo "=============================================="
echo ""
echo " Performance Targets:"
echo "   Cold submission:  p50 < 60ms,  p99 < 300ms"
echo "   Cache hit:        p50 < 10ms"
echo ""
echo " Compare the p50/p99 latencies reported above"
echo " against these targets to evaluate performance."
echo "=============================================="
