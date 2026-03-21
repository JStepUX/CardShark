#!/usr/bin/env bash
# _common.sh — Shared utilities for agent scripts
# Source this file: source "$(dirname "$0")/_common.sh"

set -euo pipefail
export MSYS_NO_PATHCONV=1

# ── Project root (two levels up from scripts/agent/) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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

# ── extract_signatures(file_path) ──
# Single-pass awk: prints exported interfaces, types, enums (full blocks),
# function declarations (body replaced with {...}), const declarations,
# class declarations with method signatures. Skips non-exported code.
extract_signatures() {
  local file="$1"
  awk '
    BEGIN { brace_depth = 0; in_block = 0; block_lines = 0; max_block = 30 }

    /^export \{.*\} from / { print; next }
    /^export \* from / { print; next }

    /^export (interface|type|enum) / {
      in_block = 1; block_type = "block"; brace_depth = 0; block_lines = 0
    }

    /^export (async )?function / {
      line = $0; gsub(/\{[^}]*$/, "{...}", line); print line
      if ($0 ~ /\{/) {
        skip_depth = 0; n = split($0, chars, "")
        for (i = 1; i <= n; i++) { if (chars[i] == "{") skip_depth++; if (chars[i] == "}") skip_depth-- }
        if (skip_depth > 0) { in_skip = 1; skip_brace = skip_depth }
      }
      next
    }

    in_skip {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) { if (chars[i] == "{") skip_brace++; if (chars[i] == "}") skip_brace-- }
      if (skip_brace <= 0) in_skip = 0
      next
    }

    /^export const / {
      if ($0 !~ /\{/ || ($0 ~ /\{/ && $0 ~ /\}/)) {
        line = $0; if (length(line) > 120) line = substr(line, 1, 117) "..."
        print line; next
      }
      in_block = 1; block_type = "block"; brace_depth = 0; block_lines = 0
    }

    /^export (abstract )?class / {
      in_block = 1; block_type = "class"; brace_depth = 0; block_lines = 0
    }

    in_block {
      block_lines++
      if (block_lines > max_block) {
        if (block_lines == max_block + 1) print "  ... (truncated)"
        n = split($0, chars, "")
        for (i = 1; i <= n; i++) { if (chars[i] == "{") brace_depth++; if (chars[i] == "}") brace_depth-- }
        if (brace_depth <= 0) { in_block = 0; print "" }
        next
      }
      if (block_type == "class") {
        if ($0 ~ /^\s+(public |private |protected |static |async |get |set )?[a-zA-Z_].*\(.*\).*\{/) {
          line = $0; gsub(/\{[^}]*$/, "{...}", line); print line
        } else if ($0 ~ /^\s+(public |private |protected )?(readonly )?[a-zA-Z_].*[:;]/) { print }
        else if ($0 ~ /^export/ || $0 ~ /^\}/) { print }
      } else { print }
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) { if (chars[i] == "{") brace_depth++; if (chars[i] == "}") brace_depth-- }
      if (brace_depth <= 0 && block_lines > 1) { in_block = 0; print "" }
    }
  ' "$file" 2>/dev/null
}

# ── extract_python_signatures(file_path) ──
# Extracts Python function, class, and method signatures with type hints.
extract_python_signatures() {
  local file="$1"
  awk '
    # Class definitions
    /^class [A-Z]/ { print; next }

    # Top-level function definitions
    /^def / || /^async def / { print; next }

    # Method definitions (indented)
    /^    def / || /^    async def / { print; next }

    # Pydantic model fields (indented, with type annotation)
    /^    [a-z_]+\s*:.*=/ || /^    [a-z_]+\s*:.*Field\(/ { print; next }

    # Module-level constants with type hints
    /^[A-Z_]+\s*:/ || /^[A-Z_]+\s*=/ { print; next }

    # Router definitions
    /^router\s*=/ { print; next }

    # Decorator lines for routes (preserve context)
    /^@(router|app)\.(get|post|put|delete|patch)/ { print; next }
  ' "$file" 2>/dev/null
}
