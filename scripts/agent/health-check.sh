#!/usr/bin/env bash
# health-check.sh — tsc + vitest + pytest + git status + TODO counts
# Usage: bash scripts/agent/health-check.sh

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

# Create temp dir for parallel output
tmp_dir=$(mktemp -d)
trap "rm -rf $tmp_dir" EXIT

header "Health Check"

# ── Run checks in parallel ──

# Frontend tsc
(
  echo "=== Frontend TypeScript ===" > "$tmp_dir/fe_tsc.txt"
  if [ -f "frontend/tsconfig.json" ]; then
    cd frontend
    npx tsc --noEmit 2>&1 | tail -30 >> "$tmp_dir/fe_tsc.txt"
    echo "EXIT:${PIPESTATUS[0]}" >> "$tmp_dir/fe_tsc.txt"
  else
    echo "  (no tsconfig.json found)" >> "$tmp_dir/fe_tsc.txt"
    echo "EXIT:0" >> "$tmp_dir/fe_tsc.txt"
  fi
) &
pid_fe_tsc=$!

# Frontend vitest
(
  echo "=== Frontend Tests (Vitest) ===" > "$tmp_dir/fe_test.txt"
  if [ -f "frontend/package.json" ] && grep -q '"vitest"' frontend/package.json 2>/dev/null; then
    cd frontend
    npx vitest run 2>&1 | tail -40 >> "$tmp_dir/fe_test.txt"
    echo "EXIT:${PIPESTATUS[0]}" >> "$tmp_dir/fe_test.txt"
  else
    echo "  (vitest not configured)" >> "$tmp_dir/fe_test.txt"
    echo "EXIT:0" >> "$tmp_dir/fe_test.txt"
  fi
) &
pid_fe_test=$!

# Backend pytest
(
  echo "=== Backend Tests (pytest) ===" > "$tmp_dir/be_test.txt"
  if [ -d "backend" ]; then
    python -m pytest backend/ 2>&1 | tail -40 >> "$tmp_dir/be_test.txt"
    echo "EXIT:${PIPESTATUS[0]}" >> "$tmp_dir/be_test.txt"
  else
    echo "  (no backend/ directory)" >> "$tmp_dir/be_test.txt"
    echo "EXIT:0" >> "$tmp_dir/be_test.txt"
  fi
) &
pid_be_test=$!

# Backend mypy (optional)
(
  echo "=== Backend Type Check (mypy) ===" > "$tmp_dir/be_mypy.txt"
  if command -v mypy &>/dev/null && [ -d "backend" ]; then
    mypy backend/ --ignore-missing-imports 2>&1 | tail -30 >> "$tmp_dir/be_mypy.txt"
    echo "EXIT:${PIPESTATUS[0]}" >> "$tmp_dir/be_mypy.txt"
  else
    echo "  (mypy not installed, skipping)" >> "$tmp_dir/be_mypy.txt"
    echo "EXIT:0" >> "$tmp_dir/be_mypy.txt"
  fi
) &
pid_be_mypy=$!

# Wait for all parallel jobs
wait $pid_fe_tsc $pid_fe_test $pid_be_test $pid_be_mypy 2>/dev/null

# ── Print results sequentially ──
subheader "TypeScript Compilation"
for f in "$tmp_dir/fe_tsc.txt"; do
  if [ -f "$f" ]; then
    exit_code=$(grep -oP 'EXIT:\K\d+' "$f" | tail -1)
    content=$(grep -v '^EXIT:' "$f")
    echo "$content"
    if [ "${exit_code:-1}" = "0" ]; then
      echo -e "  ${GREEN}✓ Passed${RESET}"
    else
      echo -e "  ${RED}✗ Failed (exit $exit_code)${RESET}"
    fi
    echo ""
  fi
done

subheader "Tests"
for f in "$tmp_dir/fe_test.txt" "$tmp_dir/be_test.txt"; do
  if [ -f "$f" ]; then
    exit_code=$(grep -oP 'EXIT:\K\d+' "$f" | tail -1)
    content=$(grep -v '^EXIT:' "$f")
    echo "$content"
    if [ "${exit_code:-1}" = "0" ]; then
      echo -e "  ${GREEN}✓ Passed${RESET}"
    else
      echo -e "  ${RED}✗ Failed (exit $exit_code)${RESET}"
    fi
    echo ""
  fi
done

subheader "Type Checking"
for f in "$tmp_dir/be_mypy.txt"; do
  if [ -f "$f" ]; then
    exit_code=$(grep -oP 'EXIT:\K\d+' "$f" | tail -1)
    content=$(grep -v '^EXIT:' "$f")
    echo "$content"
    if [ "${exit_code:-1}" = "0" ]; then
      echo -e "  ${GREEN}✓ Passed${RESET}"
    else
      echo -e "  ${RED}✗ Failed (exit $exit_code)${RESET}"
    fi
    echo ""
  fi
done

# ── Git Status ──
subheader "Git Status"
git status --short 2>/dev/null || dim "  (not a git repo)"

# ── TODO/FIXME/HACK counts ──
subheader "Code Markers"
for marker in TODO FIXME HACK XXX; do
  count=$(grep -rE "\b${marker}\b" . \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.py' \
    $GREP_EXCLUDE 2>/dev/null | wc -l)
  printf "  %-8s %d\n" "$marker" "$count"
done

echo ""
dim "Health check complete"
