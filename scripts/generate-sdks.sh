#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# generate-sdks.sh
#
# Fetches the running API's OpenAPI 3.1 spec from /v1/openapi.json and runs
# `openapi-generator-cli` (Dockerised) to produce client SDKs.
#
# Default targets: python + typescript-axios (Node). Pass --generators to
# override, --languages full list at:
#   https://github.com/OpenAPITools/openapi-generator?tab=readme-ov-file#overview
#
# Usage:
#   ./scripts/generate-sdks.sh                     # python + typescript-axios
#   ./scripts/generate-sdks.sh --generators=go     # just Go
#   ./scripts/generate-sdks.sh \
#       --api-url=https://api.zerocode.dev \
#       --out=./sdks
#
# Requirements:
#   - A reachable ZeroCode API serving /v1/openapi.json
#   - docker (the generator runs inside openapitools/openapi-generator-cli)
#   - curl + jq
###############################################################################

API_URL="http://localhost:8080"
OUT_DIR="./sdks"
GENERATORS="python,typescript-axios"
PACKAGE_NAME="zerocode_sdk"

for arg in "$@"; do
  case "$arg" in
    --api-url=*)    API_URL="${arg#*=}" ;;
    --out=*)        OUT_DIR="${arg#*=}" ;;
    --generators=*) GENERATORS="${arg#*=}" ;;
    --package=*)    PACKAGE_NAME="${arg#*=}" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

GENERATOR_IMAGE="openapitools/openapi-generator-cli:v7.10.0"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT_DIR_ABS="$(cd "$REPO_ROOT" && mkdir -p "$OUT_DIR" && cd "$OUT_DIR" && pwd)"
SPEC_FILE="${OUT_DIR_ABS}/openapi.json"

echo "→ fetching spec from ${API_URL}/v1/openapi.json"
curl -fsS "${API_URL}/v1/openapi.json" -o "$SPEC_FILE"

# Spot-check the spec is valid before invoking the generator.
if ! jq -e '.openapi' "$SPEC_FILE" >/dev/null; then
  echo "spec missing top-level .openapi field — bad response?" >&2
  exit 1
fi
echo "   spec OK ($(jq '.paths | length' "$SPEC_FILE") paths)"

IFS=',' read -ra GEN_ARRAY <<< "$GENERATORS"
for gen in "${GEN_ARRAY[@]}"; do
  gen_out="${OUT_DIR_ABS}/${gen}"
  rm -rf "$gen_out"
  echo "→ generating ${gen} SDK → ${gen_out}"
  docker run --rm \
    -v "${OUT_DIR_ABS}:/local" \
    "${GENERATOR_IMAGE}" \
    generate \
      -i "/local/openapi.json" \
      -g "$gen" \
      -o "/local/${gen}" \
      --package-name "$PACKAGE_NAME" \
      --skip-validate-spec
done

echo
echo "SDKs generated under: ${OUT_DIR_ABS}"
echo "Listed targets: ${GENERATORS}"
