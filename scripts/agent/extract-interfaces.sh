#!/usr/bin/env bash
# extract-interfaces.sh — Extract type signatures for agent consumption
# Usage: bash scripts/agent/extract-interfaces.sh <file-or-dir> [--awk]
# Auto-detects: Python (.py) uses extract_python_signatures, TypeScript uses AWK

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

# ── Parse arguments ──
FORCE_AWK=false
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --awk) FORCE_AWK=true; shift ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [ -z "$TARGET" ]; then
  err "Usage: extract-interfaces.sh <file-or-dir> [--awk]"
  exit 1
fi

# Resolve target relative to project root
if [ ! -e "$TARGET" ]; then
  if [ -e "$PROJECT_ROOT/$TARGET" ]; then
    TARGET="$PROJECT_ROOT/$TARGET"
  else
    err "Not found: $TARGET"
    exit 1
  fi
fi

TARGET="$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")"

header "Interface Extraction"

# ── Extract via AWK for TypeScript ──
extract_awk() {
  local file="$1"
  local rel_path="${file#$PROJECT_ROOT/}"

  echo "=== Interfaces: $rel_path ==="
  echo "(via AWK signature extraction)"
  echo ""

  local sigs
  sigs=$(extract_signatures "$file")
  if [ -n "$sigs" ]; then
    echo "$sigs"
  else
    dim "  (no exported signatures found)"
  fi
  echo ""
}

# ── Extract via AWK for Python ──
extract_python() {
  local file="$1"
  local rel_path="${file#$PROJECT_ROOT/}"

  echo "=== Signatures: $rel_path ==="
  echo "(via Python signature extraction)"
  echo ""

  local sigs
  sigs=$(extract_python_signatures "$file")
  if [ -n "$sigs" ]; then
    echo "$sigs"
  else
    dim "  (no signatures found)"
  fi
  echo ""
}

# ── Process a single file ──
process_file() {
  local file="$1"
  # Skip test files
  if [[ "$file" == *test* ]] && [[ "$file" == *.py ]]; then
    return
  fi
  if [[ "$file" == *.test.* ]] || [[ "$file" == *.spec.* ]] || [[ "$file" == */__tests__/* ]]; then
    return
  fi
  # Skip __init__.py
  if [[ "$(basename "$file")" == "__init__.py" ]]; then
    return
  fi

  if [[ "$file" == *.py ]]; then
    extract_python "$file"
  elif [[ "$file" == *.ts ]] || [[ "$file" == *.tsx ]]; then
    extract_awk "$file"
  fi
}

# ── Process target(s) ──
if [ -f "$TARGET" ]; then
  process_file "$TARGET"
elif [ -d "$TARGET" ]; then
  local_count=0
  while IFS= read -r file; do
    process_file "$file"
    local_count=$((local_count + 1))
  done < <(find "$TARGET" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) \
    ! -name '*.test.*' ! -name '*.spec.*' ! -path '*/__tests__/*' \
    ! -path '*/node_modules/*' ! -path '*/dist/*' ! -path '*__pycache__*' \
    ! -name 'test_*' ! -name '*_test.py' 2>/dev/null | sort)

  if [ "$local_count" -eq 0 ]; then
    dim "No source files found in $(basename "$TARGET")"
  else
    dim "Processed $local_count files"
  fi
else
  err "Target is neither file nor directory: $TARGET"
  exit 1
fi

echo ""
dim "Interface extraction complete"
