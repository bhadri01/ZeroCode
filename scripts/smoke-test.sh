#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# ZeroCode end-to-end smoke test
#
# Boots the full stack via docker compose, runs a battery of API tests against
# the live service, prints a pass/fail summary, and tears the stack down.
#
# Prerequisites: docker, curl, jq in PATH.
# Usage:        ./scripts/smoke-test.sh
###############################################################################

# -- colours (no-op when stdout is not a tty) --------------------------------
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' BOLD='' RESET=''
fi

# -- constants ---------------------------------------------------------------
COMPOSE_FILE="deploy/docker-compose.yml"
API_BASE="http://localhost:8080"
AUTH_HEADER="Authorization: Bearer dev-only-replace-me"
HEALTH_URL="${API_BASE}/v1/health"
HEALTH_TIMEOUT=30          # seconds

PASSED=0
FAILED=0
TESTS=()
RESULTS=()

# -- helpers -----------------------------------------------------------------
log()  { printf "${BOLD}==> %s${RESET}\n" "$*"; }
pass() { PASSED=$((PASSED + 1)); TESTS+=("$1"); RESULTS+=("pass"); printf "  ${GREEN}PASS${RESET}  %s\n" "$1"; }
fail() { FAILED=$((FAILED + 1)); TESTS+=("$1"); RESULTS+=("fail"); printf "  ${RED}FAIL${RESET}  %s\n" "$1"; if [[ -n "${2:-}" ]]; then printf "        %s\n" "$2"; fi; }

# Resolve repo root so the script works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

###############################################################################
# 0. Header
###############################################################################
printf "\n${BOLD}ZeroCode Smoke Test${RESET}\n"
printf "Stack compose file : %s\n" "${REPO_ROOT}/${COMPOSE_FILE}"
printf "API base           : %s\n" "${API_BASE}"
printf "\n"

###############################################################################
# 1. Prerequisite checks
###############################################################################
log "Checking prerequisites"
for cmd in docker curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    printf "  ${RED}ERROR${RESET}  '%s' not found in PATH\n" "$cmd"
    exit 1
  fi
  printf "  %-8s %s\n" "$cmd" "$(command -v "$cmd")"
done
printf "\n"

###############################################################################
# 2. Start the stack
###############################################################################
log "Ensuring runner rootfs image exists"
if docker image inspect zerocode-runner:dev >/dev/null 2>&1; then
  printf "  zerocode-runner:dev already present\n"
else
  docker build \
    -f "${REPO_ROOT}/runners/Dockerfile.slim" \
    --target full \
    -t zerocode-runner:dev \
    "${REPO_ROOT}"
fi
printf "\n"

log "Starting docker compose stack"
docker compose -f "${REPO_ROOT}/${COMPOSE_FILE}" up -d --build
printf "\n"

# Ensure we always tear down, even on unexpected exit.
cleanup() {
  log "Tearing down stack"
  docker compose -f "${REPO_ROOT}/${COMPOSE_FILE}" down -v 2>/dev/null || true
}
trap cleanup EXIT

###############################################################################
# 3. Wait for health
###############################################################################
log "Waiting for API health (timeout ${HEALTH_TIMEOUT}s)"
elapsed=0
until curl -sf "${HEALTH_URL}" >/dev/null 2>&1; do
  if (( elapsed >= HEALTH_TIMEOUT )); then
    printf "  ${RED}ERROR${RESET}  API did not become healthy within %ds\n" "${HEALTH_TIMEOUT}"
    printf "\n  Recent API logs:\n"
    docker compose -f "${REPO_ROOT}/${COMPOSE_FILE}" logs --tail=40 api 2>&1 | sed 's/^/    /'
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
printf "  API healthy after %ds\n\n" "${elapsed}"

###############################################################################
# 4. Test cases
###############################################################################
log "Running tests"

# ---- 4a. Python hello world ------------------------------------------------
test_name="Python hello world (language_id=71, ?wait=true)"
response=$(curl -sf -w "\n%{http_code}" \
  -X POST "${API_BASE}/v1/submissions?wait=true" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"language_id":71,"source_code":"print(\"hello zerocode\")"}' 2>&1) || true

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" == "200" ]]; then
  status=$(echo "$body" | jq -r '.status.id // .status // empty' 2>/dev/null)
  stdout_val=$(echo "$body" | jq -r '.stdout // empty' 2>/dev/null)
  # status.id == 3 means "Accepted" in Judge0-style status enums
  if [[ "$stdout_val" == *"hello zerocode"* ]]; then
    pass "$test_name"
  else
    fail "$test_name" "stdout did not contain 'hello zerocode': ${stdout_val}"
  fi
else
  fail "$test_name" "expected HTTP 200, got ${http_code}"
fi

# ---- 4b. Unknown language --------------------------------------------------
test_name="Unknown language (language_id=9999) returns 422"
response=$(curl -sf -w "\n%{http_code}" \
  -X POST "${API_BASE}/v1/submissions" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"language_id":9999,"source_code":"x"}' 2>&1) || true

http_code=$(echo "$response" | tail -1)

if [[ "$http_code" == "422" ]]; then
  pass "$test_name"
else
  fail "$test_name" "expected HTTP 422, got ${http_code}"
fi

# ---- 4c. Empty source code -------------------------------------------------
test_name="Empty source_code returns 422"
response=$(curl -sf -w "\n%{http_code}" \
  -X POST "${API_BASE}/v1/submissions" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"language_id":71,"source_code":""}' 2>&1) || true

http_code=$(echo "$response" | tail -1)

if [[ "$http_code" == "422" ]]; then
  pass "$test_name"
else
  fail "$test_name" "expected HTTP 422, got ${http_code}"
fi

# ---- 4d. Languages endpoint ------------------------------------------------
test_name="GET /v1/languages returns 41+ entries"
response=$(curl -sf -w "\n%{http_code}" \
  -X GET "${API_BASE}/v1/languages" \
  -H "${AUTH_HEADER}" 2>&1) || true

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" == "200" ]]; then
  count=$(echo "$body" | jq 'length' 2>/dev/null)
  if [[ -n "$count" ]] && (( count >= 41 )); then
    pass "$test_name (got ${count})"
  else
    fail "$test_name" "expected >= 41 entries, got ${count:-null}"
  fi
else
  fail "$test_name" "expected HTTP 200, got ${http_code}"
fi

# ---- 4e. About endpoint ----------------------------------------------------
test_name="GET /v1/about returns version field"
response=$(curl -sf -w "\n%{http_code}" \
  -X GET "${API_BASE}/v1/about" 2>&1) || true

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" == "200" ]]; then
  version=$(echo "$body" | jq -r '.version // empty' 2>/dev/null)
  if [[ -n "$version" ]]; then
    pass "$test_name (version=${version})"
  else
    fail "$test_name" "response missing 'version' field"
  fi
else
  fail "$test_name" "expected HTTP 200, got ${http_code}"
fi

# ---- 4f. Base64 mode -------------------------------------------------------
test_name="Base64-encoded submission accepted"
# "print('hello zerocode')" -> base64
b64_source=$(printf 'print("hello zerocode")' | base64)
response=$(curl -sf -w "\n%{http_code}" \
  -X POST "${API_BASE}/v1/submissions?wait=true" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d "{\"language_id\":71,\"source_code\":\"${b64_source}\",\"base64_encoded\":true}" 2>&1) || true

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" == "200" ]]; then
  # Could be a fresh result or a cache hit (identical source as test 4a).
  # Either way, a 200 with a status field means it was accepted and ran.
  has_status=$(echo "$body" | jq 'has("status")' 2>/dev/null)
  if [[ "$has_status" == "true" ]]; then
    pass "$test_name"
  else
    fail "$test_name" "response missing 'status' field"
  fi
elif [[ "$http_code" == "201" ]]; then
  # 201 Created with a token is also acceptable (means it was queued).
  token=$(echo "$body" | jq -r '.token // empty' 2>/dev/null)
  if [[ -n "$token" ]]; then
    pass "$test_name (queued: ${token})"
  else
    fail "$test_name" "HTTP 201 but response missing 'token' field"
  fi
else
  fail "$test_name" "expected HTTP 200 or 201, got ${http_code}"
fi

###############################################################################
# 5. Summary
###############################################################################
printf "\n"
log "Summary"
total=$((PASSED + FAILED))
for i in "${!TESTS[@]}"; do
  if [[ "${RESULTS[$i]}" == "pass" ]]; then
    printf "  ${GREEN}PASS${RESET}  %s\n" "${TESTS[$i]}"
  else
    printf "  ${RED}FAIL${RESET}  %s\n" "${TESTS[$i]}"
  fi
done

printf "\n  ${BOLD}%d passed${RESET}, " "$PASSED"
if (( FAILED > 0 )); then
  printf "${RED}%d failed${RESET}" "$FAILED"
else
  printf "${GREEN}%d failed${RESET}" "$FAILED"
fi
printf " (out of %d)\n\n" "$total"

###############################################################################
# 6. Exit code
###############################################################################
# The EXIT trap handles teardown (docker compose down -v).
if (( FAILED > 0 )); then
  exit 1
fi
exit 0
