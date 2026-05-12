#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# build-runner-tags.sh
#
# Builds every per-language Docker tag from runners/Dockerfile.slim and then
# the combined "full" tag.  Prints a size summary table at the end.
#
# Usage:
#   ./scripts/build-runner-tags.sh              # build all targets
#   ./scripts/build-runner-tags.sh python go    # build only these targets
#
# Environment variables:
#   REGISTRY   Image registry prefix (default: zerocode-runner)
#   PROGRESS   Docker build progress mode (default: auto)
###############################################################################

# -- colours (no-op when stdout is not a tty) ---------------------------------
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  GREEN='' RED='' BOLD='' DIM='' RESET=''
fi

# -- resolve paths ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE="${REPO_ROOT}/runners/Dockerfile.slim"

REGISTRY="${REGISTRY:-zerocode-runner}"
PROGRESS="${PROGRESS:-auto}"

# All available slim targets (order: cheapest first for fast feedback).
ALL_TARGETS=(python node c-cpp go rust java full)

# -- select targets -----------------------------------------------------------
if (( $# > 0 )); then
  TARGETS=("$@")
else
  TARGETS=("${ALL_TARGETS[@]}")
fi

# -- validate targets ---------------------------------------------------------
for target in "${TARGETS[@]}"; do
  found=0
  for valid in "${ALL_TARGETS[@]}"; do
    if [[ "$target" == "$valid" ]]; then found=1; break; fi
  done
  if (( found == 0 )); then
    printf "${RED}Error:${RESET} unknown target '%s'\n" "$target"
    printf "Valid targets: %s\n" "${ALL_TARGETS[*]}"
    exit 1
  fi
done

# -- build each target --------------------------------------------------------
printf "\n${BOLD}Building %d target(s) from Dockerfile.slim${RESET}\n" "${#TARGETS[@]}"
printf "Registry prefix: %s\n" "${REGISTRY}"
printf "Dockerfile:      %s\n\n" "${DOCKERFILE}"

FAILED=()

for target in "${TARGETS[@]}"; do
  # The full stage gets the :latest tag as well.
  if [[ "$target" == "full" ]]; then
    tag="${REGISTRY}:latest"
  else
    tag="${REGISTRY}:${target}"
  fi

  printf "${BOLD}[%s]${RESET} building %s ...\n" "$target" "$tag"

  if docker build \
       -f "$DOCKERFILE" \
       --target "$target" \
       --progress "$PROGRESS" \
       -t "$tag" \
       "$REPO_ROOT" ; then
    printf "  ${GREEN}OK${RESET}  %s\n" "$tag"
  else
    printf "  ${RED}FAIL${RESET}  %s\n" "$tag"
    FAILED+=("$target")
  fi
  printf "\n"
done

# -- size summary -------------------------------------------------------------
printf "${BOLD}Image sizes:${RESET}\n"
printf "  %-24s %s\n" "IMAGE" "SIZE"
printf "  %-24s %s\n" "------------------------" "----------"

for target in "${TARGETS[@]}"; do
  if [[ "$target" == "full" ]]; then
    tag="${REGISTRY}:latest"
  else
    tag="${REGISTRY}:${target}"
  fi

  # docker images --format may not exist on very old Docker versions, but
  # anything recent (20.10+) supports it.
  size=$(docker images --format '{{.Size}}' "$tag" 2>/dev/null | head -1)
  if [[ -n "$size" ]]; then
    printf "  %-24s %s\n" "$tag" "$size"
  else
    printf "  %-24s ${DIM}(not found)${RESET}\n" "$tag"
  fi
done

# -- summary ------------------------------------------------------------------
printf "\n"
if (( ${#FAILED[@]} > 0 )); then
  printf "${RED}%d target(s) failed:${RESET} %s\n" "${#FAILED[@]}" "${FAILED[*]}"
  exit 1
else
  printf "${GREEN}All %d target(s) built successfully.${RESET}\n" "${#TARGETS[@]}"
fi
