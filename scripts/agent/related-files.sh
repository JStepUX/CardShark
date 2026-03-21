#!/usr/bin/env bash
# related-files.sh — Search for a term, show context per matching file
# Usage: bash scripts/agent/related-files.sh <search-term> [directory]

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

if [ $# -lt 1 ]; then
  err "Usage: related-files.sh <search-term> [directory]"
  exit 1
fi

TERM="$1"
SEARCH_DIR="${2:-.}"
MAX_FILES=15

header "Related Files: '$TERM'"

# Find matching files (TS/JS + Python)
mapfile -t files < <(
  grep -rlE "$TERM" "$SEARCH_DIR" \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' \
    $GREP_EXCLUDE 2>/dev/null | head -$MAX_FILES
)

if [ ${#files[@]} -eq 0 ]; then
  dim "  No files found matching '$TERM'"
  exit 0
fi

total=$(grep -rlE "$TERM" "$SEARCH_DIR" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' \
  $GREP_EXCLUDE 2>/dev/null | wc -l)

echo "Showing ${#files[@]} of $total matching files"

for file in "${files[@]}"; do
  rel="${file#$PROJECT_ROOT/}"
  rel="${rel#./}"
  subheader "$rel"

  # Show imports block based on file type
  echo -e "${DIM}Imports:${RESET}"
  case "$file" in
    *.py)
      # Python imports: import X / from X import Y
      awk '
        /^import / || /^from .* import / { print "  " $0 }
        /^[^#if ]/ && !/^import / && !/^from / && NR > 1 { exit }
      ' "$file" 2>/dev/null | head -20
      ;;
    *)
      # TS/JS imports
      awk '
        /^import / || /^import\t/ { printing = 1 }
        printing { print "  " $0 }
        printing && /;$/ && !/from/ { }
        printing && (/;$/ || (/from / && /;$/)) { }
        /^$/ && printing { printing = 0 }
        !/^import/ && !/^  / && !/^\t/ && !/^}/ && !/^export .* from/ && printing { printing = 0 }
      ' "$file" 2>/dev/null | head -20
      ;;
  esac

  # Show matching lines with context
  echo -e "${DIM}Matches:${RESET}"
  grep -nE "$TERM" "$file" 2>/dev/null | head -10 | while IFS= read -r line; do
    echo "  $line"
  done

  echo ""
done

dim "Search complete: ${#files[@]} files shown, $total total matches"
