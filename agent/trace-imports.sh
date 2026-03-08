#!/usr/bin/env bash
# trace-imports.sh — Reverse dependency search (who imports X?)
# Usage: bash agent/trace-imports.sh <file-or-symbol>
# If arg looks like a file path: search for imports from that file
# If arg looks like a symbol: search for imports containing that symbol

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

if [ $# -lt 1 ]; then
  err "Usage: trace-imports.sh <file-path-or-symbol>"
  exit 1
fi

ARG="$1"
MAX_L1=15
MAX_L2=5

# Determine if arg is a file path or a symbol
if [[ "$ARG" == */* || "$ARG" == *.ts || "$ARG" == *.tsx || "$ARG" == *.js ]]; then
  MODE="file"
  # Extract basename without extension for matching
  BASENAME=$(basename "$ARG" | sed 's/\.\(ts\|tsx\|js\|jsx\)$//')
  SEARCH_PATTERN="from ['\"].*[/]${BASENAME}['\"]"
  header "Who imports file: $ARG (basename: $BASENAME)"
else
  MODE="symbol"
  SEARCH_PATTERN="import.*\{[^}]*${ARG}[^}]*\}"
  header "Who imports symbol: $ARG"
fi

# Level 1: Direct importers
subheader "Level 1 — Direct importers"

mapfile -t l1_files < <(
  grep -rlE "$SEARCH_PATTERN" . \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    $GREP_EXCLUDE 2>/dev/null | head -$MAX_L1
)

if [ ${#l1_files[@]} -eq 0 ]; then
  dim "  No importers found"
  exit 0
fi

total_l1=$(grep -rlE "$SEARCH_PATTERN" . \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  $GREP_EXCLUDE 2>/dev/null | wc -l)

echo "Found $total_l1 direct importers (showing ${#l1_files[@]})"

for file in "${l1_files[@]}"; do
  rel="${file#./}"
  echo -e "  ${CYAN}$rel${RESET}"
  grep -nE "$SEARCH_PATTERN" "$file" 2>/dev/null | head -3 | while IFS= read -r line; do
    echo "    $line"
  done
done

# Level 2: Who imports the importers
subheader "Level 2 — Who imports the importers (max $MAX_L2 per L1)"

for file in "${l1_files[@]}"; do
  l1_basename=$(basename "$file" | sed 's/\.\(ts\|tsx\|js\|jsx\)$//')
  l2_pattern="from ['\"].*[/]${l1_basename}['\"]"

  mapfile -t l2_files < <(
    grep -rlE "$l2_pattern" . \
      --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
      $GREP_EXCLUDE 2>/dev/null | head -$MAX_L2
  )

  if [ ${#l2_files[@]} -gt 0 ]; then
    rel="${file#./}"
    echo -e "  ${GREEN}$rel${RESET} is imported by:"
    for l2 in "${l2_files[@]}"; do
      l2_rel="${l2#./}"
      echo "    → $l2_rel"
    done
  fi
done

echo ""
dim "Trace complete"
