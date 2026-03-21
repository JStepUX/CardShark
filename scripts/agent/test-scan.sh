#!/usr/bin/env bash
# test-scan.sh — Test gap analysis for backend (Python) and frontend (TypeScript)
# Usage: bash scripts/agent/test-scan.sh [--scope backend|frontend|all]

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

# ── Parse arguments ──
SCOPE="all"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    *) err "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ "$SCOPE" != "all" && "$SCOPE" != "backend" && "$SCOPE" != "frontend" ]]; then
  err "Invalid scope: $SCOPE (must be backend|frontend|all)"
  exit 1
fi

header "Test Gap Analysis (scope: $SCOPE)"

# ── Helpers ──
count_in_file() {
  local file="$1"
  local pattern="$2"
  local count
  count=$(grep -cE "$pattern" "$file" 2>/dev/null) || true
  echo "${count:-0}"
}

# ── Backend Scan (Python/pytest) ──
run_backend_scan() {
  subheader "Backend: Source ↔ Test Coverage"

  local src_dir="backend"
  local test_dir="backend/tests"
  local smoke_dir="backend/tests/smoke"
  local untested=()
  local tested=()

  # Scan endpoint files
  for src_file in "$src_dir"/*_endpoints.py "$src_dir"/endpoints/*.py; do
    [ -f "$src_file" ] || continue
    [[ "$(basename "$src_file")" == "__init__.py" ]] && continue
    local base=$(basename "$src_file" .py)
    local has_test=false
    # Check for test file variants
    for tdir in "$test_dir" "$smoke_dir"; do
      if compgen -G "$tdir/test_${base}*.py" > /dev/null 2>&1 || compgen -G "$tdir/${base}_test.py" > /dev/null 2>&1 || compgen -G "$tdir/${base}_adversarial_test.py" > /dev/null 2>&1; then
        has_test=true
        break
      fi
    done
    local rel="${src_file#backend/}"
    if $has_test; then tested+=("$rel"); else untested+=("$rel"); fi
  done

  # Scan services
  if [ -d "$src_dir/services" ]; then
    for src_file in "$src_dir"/services/*.py; do
      [ -f "$src_file" ] || continue
      [[ "$(basename "$src_file")" == "__init__.py" ]] && continue
      local base=$(basename "$src_file" .py)
      local has_test=false
      for tdir in "$test_dir" "$smoke_dir"; do
        if compgen -G "$tdir/test_${base}*.py" > /dev/null 2>&1 || compgen -G "$tdir/${base}_test.py" > /dev/null 2>&1; then
          has_test=true
          break
        fi
      done
      local rel="${src_file#backend/}"
      if $has_test; then tested+=("$rel"); else untested+=("$rel"); fi
    done
  fi

  # Scan handlers
  if [ -d "$src_dir/handlers" ]; then
    for src_file in "$src_dir"/handlers/*.py; do
      [ -f "$src_file" ] || continue
      [[ "$(basename "$src_file")" == "__init__.py" ]] && continue
      local base=$(basename "$src_file" .py)
      local has_test=false
      for tdir in "$test_dir" "$smoke_dir"; do
        if compgen -G "$tdir/test_${base}*.py" > /dev/null 2>&1 || compgen -G "$tdir/${base}_test.py" > /dev/null 2>&1; then
          has_test=true
          break
        fi
      done
      local rel="${src_file#backend/}"
      if $has_test; then tested+=("$rel"); else untested+=("$rel"); fi
    done
  fi

  local total=$(( ${#tested[@]} + ${#untested[@]} ))
  echo "  Modules with tests:    ${#tested[@]} / $total"
  if [ ${#untested[@]} -gt 0 ]; then
    echo -e "  ${RED}Untested modules:${RESET}"
    for m in "${untested[@]}"; do
      echo "    - $m"
    done
  else
    echo -e "  ${GREEN}All modules have test files${RESET}"
  fi

  # ── Mock Density (Python) ──
  subheader "Backend: Mock Density"
  if [ -d "$test_dir" ]; then
    for test_file in "$test_dir"/test_*.py "$test_dir"/*_test.py "$smoke_dir"/test_*.py; do
      [ -f "$test_file" ] || continue
      local base=$(basename "$test_file")
      local mock_count=$(count_in_file "$test_file" "@patch|MagicMock|Mock\(|mock\.|monkeypatch")
      local test_count=$(count_in_file "$test_file" "^\s*def test_|^\s*async def test_")
      if [ "$test_count" -eq 0 ]; then test_count=1; fi
      local ratio=$(awk "BEGIN { printf \"%.2f\", $mock_count / $test_count }")
      local flag=""
      if awk "BEGIN { exit !($ratio > 2.0) }"; then
        flag=" ${RED}← high mock ratio${RESET}"
      fi
      printf "  %-40s mocks: %-3s tests: %-3s ratio: %s%b\n" "$base" "$mock_count" "$test_count" "$ratio" "$flag"
    done
  fi

  # ── Assertion Quality (Python) ──
  subheader "Backend: Assertion Quality"
  local weak_total=0
  local strong_total=0
  if [ -d "$test_dir" ]; then
    for test_file in "$test_dir"/test_*.py "$test_dir"/*_test.py "$smoke_dir"/test_*.py; do
      [ -f "$test_file" ] || continue
      local weak=$(count_in_file "$test_file" "assert .*is not None|assert .*is True|assert .*is False|assert result")
      local strong=$(count_in_file "$test_file" "assert .* ==|assert .* in |assert .* not in |pytest\.raises|assertEqual|assertIn|assertContains|\.status_code ==")
      weak_total=$((weak_total + weak))
      strong_total=$((strong_total + strong))
    done
    echo "  Strong assertions: $strong_total"
    echo "  Weak assertions:   $weak_total"
    if [ "$weak_total" -gt 0 ] && [ "$strong_total" -gt 0 ]; then
      local pct=$(awk "BEGIN { printf \"%.0f\", ($weak_total / ($weak_total + $strong_total)) * 100 }")
      if [ "$pct" -gt 20 ]; then
        echo -e "  ${YELLOW}Weak assertion ratio: ${pct}% (target: <20%)${RESET}"
      else
        echo -e "  ${GREEN}Weak assertion ratio: ${pct}%${RESET}"
      fi
    fi
  fi

  # ── Error Path Coverage (Python) ──
  subheader "Backend: Error Path Coverage"
  local src_throws=0
  local test_throws=0
  src_throws=$(grep -rE "raise |HTTPException|raise_" "$src_dir" --include='*.py' \
    --exclude-dir=tests --exclude='*test*' 2>/dev/null | wc -l)
  if [ -d "$test_dir" ]; then
    test_throws=$(grep -rE "pytest\.raises|\.status_code.*4[0-9]{2}|\.status_code.*5[0-9]{2}" "$test_dir" --include='*.py' 2>/dev/null | wc -l)
  fi
  echo "  Error raises in source:   $src_throws"
  echo "  Error assertions in tests: $test_throws"
  if [ "$src_throws" -gt 0 ] && [ "$test_throws" -eq 0 ]; then
    echo -e "  ${RED}No error path testing detected${RESET}"
  elif [ "$src_throws" -gt 0 ]; then
    local coverage=$(awk "BEGIN { printf \"%.0f\", ($test_throws / $src_throws) * 100 }")
    echo -e "  Approximate error coverage: ${coverage}%"
  fi
}

# ── Frontend Scan (TypeScript/Jest) ──
run_frontend_scan() {
  subheader "Frontend: Source ↔ Test Coverage"

  local src_dir="frontend/src"
  local untested=()
  local tested=()

  while IFS= read -r src_file; do
    local dir=$(dirname "$src_file")
    local base=$(basename "$src_file")
    local name="${base%.*}"

    local has_test=false
    for test_pattern in "${dir}/${name}.test.ts" "${dir}/${name}.test.tsx" "${dir}/__tests__/${name}.test.ts" "${dir}/__tests__/${name}.test.tsx"; do
      if [ -f "$test_pattern" ]; then
        has_test=true
        break
      fi
    done

    # Also check project-level __tests__
    if ! $has_test; then
      for test_pattern in "$src_dir/__tests__/${name}.test.ts" "$src_dir/__tests__/${name}.test.tsx"; do
        if [ -f "$test_pattern" ]; then
          has_test=true
          break
        fi
      done
    fi

    local rel="${src_file#frontend/src/}"
    if $has_test; then tested+=("$rel"); else untested+=("$rel"); fi
  done < <(find "$src_dir" -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.*' ! -name '*.spec.*' ! -path '*/__tests__/*' \
    ! -path '*/node_modules/*' ! -name 'vite-env.d.ts' ! -name '*.d.ts' 2>/dev/null | sort)

  local total=$(( ${#tested[@]} + ${#untested[@]} ))
  echo "  Files with tests:    ${#tested[@]} / $total"
  if [ ${#untested[@]} -gt 0 ]; then
    echo -e "  ${YELLOW}Untested files (showing first 20):${RESET}"
    local count=0
    for f in "${untested[@]}"; do
      echo "    - $f"
      count=$((count + 1))
      [ $count -ge 20 ] && echo "    ... and $((${#untested[@]} - 20)) more" && break
    done
  fi

  # ── Frontend Mock Density (Jest) ──
  subheader "Frontend: Mock Density"
  local fe_test_count=0
  while IFS= read -r test_file; do
    [ -f "$test_file" ] || continue
    fe_test_count=$((fe_test_count + 1))
    local base=$(basename "$test_file")
    local mock_count=$(count_in_file "$test_file" "jest\.(mock|fn|spyOn)")
    local test_count=$(count_in_file "$test_file" "^\s*(it|test)\(")
    if [ "$test_count" -eq 0 ]; then test_count=1; fi
    local ratio=$(awk "BEGIN { printf \"%.2f\", $mock_count / $test_count }")
    local flag=""
    if awk "BEGIN { exit !($ratio > 2.0) }"; then
      flag=" ${RED}← high mock ratio${RESET}"
    fi
    printf "  %-40s mocks: %-3s tests: %-3s ratio: %s%b\n" "$base" "$mock_count" "$test_count" "$ratio" "$flag"
  done < <(find "$src_dir" -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) \
    ! -path '*/node_modules/*' 2>/dev/null | sort)
  if [ "$fe_test_count" -eq 0 ]; then
    dim "  No frontend test files found"
  fi
}

# ── Run scans ──
if [[ "$SCOPE" == "all" || "$SCOPE" == "backend" ]]; then
  run_backend_scan
fi

if [[ "$SCOPE" == "all" || "$SCOPE" == "frontend" ]]; then
  run_frontend_scan
fi

echo ""
dim "Test scan complete"
