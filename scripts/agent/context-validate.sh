#!/usr/bin/env bash
# context-validate.sh — Validate CONTEXT.md claims against the live codebase
# Reads file paths from CONTEXT.md and checks they exist. Flags staleness.
# Usage: context-validate.sh [--fix]

source "$(dirname "$0")/_common.sh"

CONTEXT_FILE="$PROJECT_ROOT/CONTEXT.md"
STALE=0
CHECKED=0

if [ ! -f "$CONTEXT_FILE" ]; then
  echo -e "${RED}CONTEXT.md not found at $CONTEXT_FILE${RESET}"
  exit 1
fi

header "CONTEXT.md Validation"

# ── 1. Extract and check file paths ──
# Matches patterns like: frontend/src/..., backend/..., templates/, etc.
echo -e "\n${BOLD}File path references:${RESET}"
grep -oE '(frontend/src|backend|templates)/[a-zA-Z0-9_./-]+\.(tsx?|py|json)' "$CONTEXT_FILE" \
  | sort -u \
  | while read -r fpath; do
    full="$PROJECT_ROOT/$fpath"
    if [ -f "$full" ]; then
      echo -e "  ${GREEN}OK${RESET}  $fpath"
    else
      echo -e "  ${RED}MISSING${RESET}  $fpath"
      # Signal staleness to parent (subshell workaround below)
      echo "$fpath" >> "$PROJECT_ROOT/.context-validate-missing.tmp"
    fi
  done

# Count missing (subshell pipe workaround)
if [ -f "$PROJECT_ROOT/.context-validate-missing.tmp" ]; then
  MISSING_COUNT=$(wc -l < "$PROJECT_ROOT/.context-validate-missing.tmp")
  rm -f "$PROJECT_ROOT/.context-validate-missing.tmp"
  STALE=$((STALE + MISSING_COUNT))
else
  MISSING_COUNT=0
fi

CHECKED_PATHS=$(grep -coE '(frontend/src|backend|templates)/[a-zA-Z0-9_./-]+\.(tsx?|py|json)' "$CONTEXT_FILE" 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo 0)

# ── 2. Check API route prefixes against live routes ──
echo -e "\n${BOLD}API route prefixes:${RESET}"
# Extract path: lines from API_CONTRACTS
grep -oE 'path: /api/[a-zA-Z0-9_/{}-]+' "$CONTEXT_FILE" \
  | sed 's/path: //' \
  | sort -u \
  | while read -r route; do
    # Try matching the full path, the path without /api prefix, or just the last segment
    stripped=$(echo "$route" | sed 's|^/api||; s/{[^}]*}//g; s|/\+$||; s|/\+|/|g')
    last_segment=$(echo "$route" | sed 's|^.*/||; s/{[^}]*}//g')
    if grep -rq "$stripped\|/$last_segment" "$PROJECT_ROOT/backend/endpoints/" "$PROJECT_ROOT/backend/main.py" 2>/dev/null; then
      echo -e "  ${GREEN}OK${RESET}  $route"
    else
      echo -e "  ${YELLOW}UNVERIFIED${RESET}  $route (not found in backend/)"
      echo "route" >> "$PROJECT_ROOT/.context-validate-routes.tmp"
    fi
  done

if [ -f "$PROJECT_ROOT/.context-validate-routes.tmp" ]; then
  ROUTE_WARNS=$(wc -l < "$PROJECT_ROOT/.context-validate-routes.tmp")
  rm -f "$PROJECT_ROOT/.context-validate-routes.tmp"
else
  ROUTE_WARNS=0
fi

# ── 3. Check for ACTIVE_DEVELOPMENT with all-null values (dead section) ──
if grep -q "ACTIVE_DEVELOPMENT" "$CONTEXT_FILE"; then
  if grep -A5 "ACTIVE_DEVELOPMENT" "$CONTEXT_FILE" | grep -q "current_focus: null"; then
    echo -e "\n${YELLOW}WARNING${RESET}: ACTIVE_DEVELOPMENT section has null values — consider removing"
    STALE=$((STALE + 1))
  fi
fi

# ── 4. Summary ──
header "Summary"
if [ "$STALE" -eq 0 ] && [ "$ROUTE_WARNS" -eq 0 ]; then
  echo -e "${GREEN}All CONTEXT.md claims verified.${RESET}"
  exit 0
else
  [ "$MISSING_COUNT" -gt 0 ] && echo -e "${RED}$MISSING_COUNT file path(s) reference files that don't exist${RESET}"
  [ "$ROUTE_WARNS" -gt 0 ] && echo -e "${YELLOW}$ROUTE_WARNS API route(s) could not be verified${RESET}"
  echo -e "\nCONTEXT.md may be stale. Review and update the flagged sections."
  exit 1
fi
