#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass() {
  printf '[repo-hygiene][PASS] %s\n' "$*"
}

fail() {
  printf '[repo-hygiene][FAIL] %s\n' "$*" >&2
  exit 1
}

require_text() {
  local file="$1" pattern="$2" label="$3"
  grep -Eq -- "$pattern" "$ROOT_DIR/$file" && pass "$label" || fail "$label"
}

tracked_artifacts() {
  git -C "$ROOT_DIR" ls-files |
    grep -E '(^|/)(node_modules|node_modules[.][^/]+)/|[.](zip|tar[.]gz)$' || true
}

require_no_tracked_artifacts() {
  local artifacts
  artifacts="$(tracked_artifacts)"

  if [[ -z "$artifacts" ]]; then
    pass "No vendored dependency or local archive artifacts are tracked"
    return
  fi

  printf '%s\n' "$artifacts" >&2
  fail "Tracked dependency/archive artifacts must be removed from Git"
}

require_text ".gitignore" '^\*\.zip$' "Git ignores local ZIP archives"
require_text ".gitignore" '^\*\.tar\.gz$' "Git ignores local tarball archives"
require_text ".gitignore" 'node_modules\.dataless-\*' "Git ignores dataless dependency snapshots"
require_text ".dockerignore" '\*\*/node_modules\.\*' "Docker context excludes dependency snapshots"
require_text ".dockerignore" '\*\*/\*\.zip' "Docker context excludes local ZIP archives"
require_text ".dockerignore" '\*\*/\*\.tar\.gz' "Docker context excludes local tarball archives"
require_no_tracked_artifacts
