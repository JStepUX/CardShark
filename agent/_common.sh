#!/usr/bin/env bash
# _common.sh — Shared utilities for agent scripts
# Source this file: source "$(dirname "$0")/_common.sh"

set -euo pipefail
export MSYS_NO_PATHCONV=1

# ── Project root (one level up from agent/) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Exclude patterns for find/grep ──
EXCLUDE_DIRS="node_modules|\.git|dist|\.vite|build|\.next|coverage|__pycache__|\.pytest_cache"
GREP_EXCLUDE="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.vite --exclude-dir=build --exclude-dir=coverage --exclude-dir=__pycache__ --exclude-dir=.pytest_cache"

# ── Colors (disabled when piped) ──
if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  CYAN='\033[36m'
  GREEN='\033[32m'
  YELLOW='\033[33m'
  RED='\033[31m'
  RESET='\033[0m'
else
  BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' RED='' RESET=''
fi

header() {
  echo -e "\n${BOLD}${CYAN}═══ $1 ═══${RESET}"
}

subheader() {
  echo -e "\n${GREEN}── $1 ──${RESET}"
}

dim() {
  echo -e "${DIM}$1${RESET}"
}

warn() {
  echo -e "${YELLOW}⚠ $1${RESET}" >&2
}

err() {
  echo -e "${RED}✗ $1${RESET}" >&2
}

# ── resolve_import(from_dir, import_path) ──
# Resolves a TypeScript/JS import path to an absolute file path.
# Handles: relative paths, @/ alias, .js→.ts, barrel imports (index.ts/tsx)
# Echoes the resolved path or returns 1 if not found.
resolve_import() {
  local from_dir="$1"
  local import_path="$2"
  local base=""

  # Handle @/ alias → frontend/src/
  if [[ "$import_path" == @/* ]]; then
    base="$PROJECT_ROOT/frontend/src/${import_path#@/}"
  elif [[ "$import_path" == ./* || "$import_path" == ../* ]]; then
    base="$(cd "$from_dir" && cd "$(dirname "$import_path")" 2>/dev/null && pwd)/$(basename "$import_path")"
  else
    # Node module or bare specifier — skip
    return 1
  fi

  # Strip .js extension (TS source uses .js in imports but files are .ts)
  if [[ "$base" == *.js ]]; then
    base="${base%.js}"
  fi

  # Resolution order: exact → .ts → .tsx → .js → /index.ts → /index.tsx
  local candidates=(
    "$base"
    "${base}.ts"
    "${base}.tsx"
    "${base}.js"
    "${base}/index.ts"
    "${base}/index.tsx"
  )

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

# ── extract_imports(file_path) ──
# Parses import statements and outputs raw import paths (one per line).
extract_imports() {
  local file="$1"
  awk '
    /^import / || /^import\t/ { in_import = 1 }
    /^export .* from / { in_import = 1 }
    in_import {
      if (match($0, /from ["\047]([^"\047]+)["\047]/, m)) {
        print m[1]
        in_import = 0
        next
      }
      if (match($0, /import ["\047]([^"\047]+)["\047]/, m)) {
        print m[1]
        in_import = 0
        next
      }
      if (/;/) { in_import = 0 }
    }
  ' "$file" 2>/dev/null
}
