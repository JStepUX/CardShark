#!/usr/bin/env bash
# read-docs.sh — RTFM tool for agents working with post-cutoff packages.
#
# Surfaces vendored docs, Context7 pointers, and training familiarity warnings.
#
# Usage:
#   read-docs.sh <package>        — "am I about to hallucinate?" check for a package
#   read-docs.sh --audit          — scan package.json + requirements.txt, flag post-cutoff
#   read-docs.sh --index          — list all available vendored docs
#   read-docs.sh --stale          — find post-cutoff packages with NO vendored docs
#
# Examples:
#   read-docs.sh fastapi          — before changing API patterns
#   read-docs.sh pydantic         — before modifying models
#   read-docs.sh pixijs           — before touching canvas code
#   read-docs.sh --audit          — "what am I exposed on right now?"

source "$(dirname "$0")/_common.sh"

VENDOR_DIR="$PROJECT_ROOT/docs/vendor"
REF_DIR="$VENDOR_DIR/reference"

# ── Training cutoff: May 2025 ──
# Packages where the INSTALLED version may exceed what the agent knows well.
# Format: package_name:threshold_version:familiarity:source
# source = npm or pip
# Update this list as the agent's training data evolves.
CUTOFF_REGISTRY=(
  # Frontend (npm)
  "vite:6.0.0:medium:npm"
  "@vitejs/plugin-react-swc:4.0.0:medium:npm"
  "pixi.js:8.0.0:low:npm"
  "react:19.0.0:medium:npm"
  "react-dom:19.0.0:medium:npm"
  "react-router-dom:7.0.0:medium:npm"
  "typescript:6.0.0:low:npm"
  # Backend (pip)
  "fastapi:0.120.0:medium:pip"
  "pydantic:3.0.0:low:pip"
  "sqlalchemy:2.1.0:medium:pip"
  "uvicorn:0.35.0:medium:pip"
)

# ── Context7 known library IDs ──
declare -A CONTEXT7_IDS=(
  ["pixi"]="resolve: pixi.js"
  ["pixi.js"]="resolve: pixi.js"
  ["pixijs"]="resolve: pixi.js"
  ["fastapi"]="resolve: fastapi"
  ["pydantic"]="resolve: pydantic"
  ["sqlalchemy"]="resolve: sqlalchemy"
  ["react-router"]="resolve: react-router"
  ["react-router-dom"]="resolve: react-router"
  ["vite"]="resolve: vite"
)

# ── Helpers ──

# Semver compare: returns 0 if $1 >= $2
version_gte() {
  local v1="$1" v2="$2"
  v1=$(echo "$v1" | sed 's/^[\^~>=]*//')
  v2=$(echo "$v2" | sed 's/^[\^~>=]*//')
  [ "$(printf '%s\n%s' "$v2" "$v1" | sort -V | head -1)" = "$v2" ]
}

# Get version from package.json
get_npm_version() {
  local pkg="$1" file="$2"
  { grep "\"$pkg\"" "$file" 2>/dev/null || true; } | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
}

# Get version from requirements.txt (handles ==, >=, ~= prefixes)
get_pip_version() {
  local pkg="$1" file="$2"
  { grep -i "^${pkg}[=~><]" "$file" 2>/dev/null || true; } | head -1 | sed 's/.*[=><]\([0-9][0-9.]*\).*/\1/'
}

# Check if vendored docs exist for a search term
find_vendor_docs() {
  local query="$1"
  local found=0
  for f in "$VENDOR_DIR"/*.md "$REF_DIR"/*.md; do
    [ -f "$f" ] || continue
    if grep -qil "$query" "$f" 2>/dev/null; then
      found=1
      echo "$f"
    fi
  done
  return $((1 - found))
}

# ── Commands ──

show_index() {
  header "Vendored Documentation"

  subheader "Migration Guides (docs/vendor/)"
  local guide_count=0
  if [ -d "$VENDOR_DIR" ]; then
    for f in "$VENDOR_DIR"/*.md; do
      [ -f "$f" ] || continue
      [[ "$(basename "$f")" == "README.md" ]] && continue
      guide_count=$((guide_count + 1))
      local name=$(basename "$f")
      local title=$(grep -m1 '^# ' "$f" | sed 's/^# //')
      local lines=$(wc -l < "$f")
      echo -e "  ${CYAN}$name${RESET} (${lines} lines)"
      echo -e "    $title"
    done
  fi
  if [ "$guide_count" -eq 0 ]; then
    dim "    (empty — add docs as packages are upgraded)"
  fi

  subheader "Durable API Reference (docs/vendor/reference/)"
  local ref_count=0
  if [ -d "$REF_DIR" ]; then
    for f in "$REF_DIR"/*.md; do
      [ -f "$f" ] || continue
      [[ "$(basename "$f")" == "README.md" ]] && continue
      ref_count=$((ref_count + 1))
      local name=$(basename "$f")
      local title=$(grep -m1 '^# ' "$f" | sed 's/^# //')
      echo -e "  ${CYAN}$name${RESET}"
      echo -e "    $title"
    done
  fi
  if [ "$ref_count" -eq 0 ]; then
    dim "    (empty — populated after upgrades complete)"
  fi

  subheader "Context7 MCP (live docs)"
  echo -e "  ${GREEN}Available:${RESET} pixi.js, fastapi, pydantic, sqlalchemy, react-router, vite"
}

audit_packages() {
  header "Post-Cutoff Package Audit"
  echo -e "${DIM}Scanning dependencies against training cutoff registry...${RESET}\n"

  local warnings=0
  local covered=0
  local exposed=0

  local npm_files=(
    "$PROJECT_ROOT/frontend/package.json"
  )
  local pip_files=(
    "$PROJECT_ROOT/backend/requirements.txt"
  )

  for entry in "${CUTOFF_REGISTRY[@]}"; do
    IFS=: read -r pkg threshold familiarity source <<< "$entry"

    local installed=""
    local location=""

    if [ "$source" = "npm" ]; then
      for pkg_file in "${npm_files[@]}"; do
        [ -f "$pkg_file" ] || continue
        installed=$(get_npm_version "$pkg" "$pkg_file")
        [ -n "$installed" ] && location="frontend" && break
      done
    elif [ "$source" = "pip" ]; then
      for pkg_file in "${pip_files[@]}"; do
        [ -f "$pkg_file" ] || continue
        installed=$(get_pip_version "$pkg" "$pkg_file")
        [ -n "$installed" ] && location="backend" && break
      done
    fi

    [ -z "$installed" ] && continue

    if version_gte "$installed" "$threshold"; then
      warnings=$((warnings + 1))

      local has_docs=0
      local doc_files=$(find_vendor_docs "$pkg" 2>/dev/null)
      [ -n "$doc_files" ] && has_docs=1

      if [ "$has_docs" -eq 1 ]; then
        covered=$((covered + 1))
        echo -e "  ${YELLOW}$pkg${RESET} $installed (${familiarity}) [$location]"
        echo -e "    ${GREEN}Docs:${RESET} $(echo "$doc_files" | head -1 | sed "s|$PROJECT_ROOT/||")"
      else
        exposed=$((exposed + 1))
        echo -e "  ${RED}$pkg${RESET} $installed (${familiarity}) [$location]"
        echo -e "    ${RED}NO VENDORED DOCS — agent is flying blind${RESET}"

        local c7="${CONTEXT7_IDS[$pkg]:-}"
        if [ -n "$c7" ]; then
          echo -e "    ${YELLOW}Context7 available:${RESET} $c7"
        fi
      fi
    fi
  done

  echo ""
  header "Summary"
  echo -e "  Post-cutoff packages: ${BOLD}$warnings${RESET}"
  echo -e "  With vendored docs:   ${GREEN}$covered${RESET}"
  echo -e "  ${RED}EXPOSED (no docs):     $exposed${RESET}"

  if [ "$exposed" -gt 0 ]; then
    echo ""
    warn "Agents working with exposed packages WILL produce outdated patterns."
    warn "Acquire docs: WebFetch → chunk → save to docs/vendor/ or docs/vendor/reference/"
    warn "Or use Context7 MCP if available for the package."
  fi

  return "$exposed"
}

show_stale() {
  header "Packages Without Documentation Coverage"
  audit_packages 2>&1 | grep -A2 "NO VENDORED DOCS"
}

search_package() {
  local query="$1"
  local query_lower=$(echo "$query" | tr '[:upper:]' '[:lower:]')

  header "readDocs: $query"

  # 1. Check training familiarity
  local familiarity=""
  for entry in "${CUTOFF_REGISTRY[@]}"; do
    IFS=: read -r pkg threshold fam source <<< "$entry"
    local pkg_lower=$(echo "$pkg" | tr '[:upper:]' '[:lower:]')
    if [[ "$pkg_lower" == *"$query_lower"* ]] || [[ "$query_lower" == *"$pkg_lower"* ]]; then
      familiarity="$fam"
      echo -e "  Training familiarity: ${BOLD}$fam${RESET} (source: $source)"
      case "$fam" in
        low)
          echo -e "  ${RED}⚠ EXTERNAL DOCS REQUIRED — agent will hallucinate without reference${RESET}"
          ;;
        medium)
          echo -e "  ${YELLOW}⚠ Proceed with caution — agent knows concepts but may miss new idioms${RESET}"
          ;;
        high)
          echo -e "  ${GREEN}✓ Well within training data${RESET}"
          ;;
      esac
      break
    fi
  done

  if [ -z "$familiarity" ]; then
    echo -e "  ${DIM}Not in cutoff registry — likely within training data${RESET}"
  fi

  # 2. Search vendored docs
  echo ""
  local doc_files=$(find_vendor_docs "$query" 2>/dev/null)
  if [ -n "$doc_files" ]; then
    subheader "Vendored Documentation"
    while IFS= read -r f; do
      local rel_path=$(echo "$f" | sed "s|$PROJECT_ROOT/||")
      local title=$(grep -m1 '^# ' "$f" | sed 's/^# //')
      echo -e "  ${CYAN}$rel_path${RESET}"
      echo -e "  $title"

      local notes_line=$(grep -n 'PROJECT-SPECIFIC NOTES' "$f" | head -1 | cut -d: -f1)
      if [ -n "$notes_line" ]; then
        echo -e "  ${GREEN}Project-specific notes:${RESET}"
        sed -n "$((notes_line+1)),$((notes_line+8))p" "$f" | sed 's/^/    /'
      fi
      echo ""
    done <<< "$doc_files"
  elif [ "$familiarity" = "low" ]; then
    echo -e "  ${RED}NO VENDORED DOCS for a low-familiarity package!${RESET}"
    echo -e "  ${RED}Acquire docs before writing code:${RESET}"
    echo -e "    1. WebFetch the relevant docs page"
    echo -e "    2. Chunk to essentials + project-specific notes"
    echo -e "    3. Save to docs/vendor/ (migration) or docs/vendor/reference/ (durable)"
  fi

  # 3. Check Context7
  local c7_id="${CONTEXT7_IDS[$query_lower]:-}"
  if [ -n "$c7_id" ]; then
    subheader "Context7 MCP"
    echo -e "  Library: ${GREEN}$c7_id${RESET}"
    echo -e "  Use: mcp resolve-library-id then query-docs"
  fi
}

# ── Main ──
case "${1:-}" in
  --index|-i)
    show_index
    ;;
  --audit|-a)
    audit_packages
    ;;
  --stale|-s)
    show_stale
    ;;
  --help|-h|"")
    echo "read-docs.sh — RTFM tool for agents working outside training data"
    echo ""
    echo "Usage:"
    echo "  read-docs.sh <package>   Check training familiarity + surface relevant docs"
    echo "  read-docs.sh --audit     Scan package.json + requirements.txt, flag post-cutoff"
    echo "  read-docs.sh --stale     Show post-cutoff packages with NO documentation"
    echo "  read-docs.sh --index     List all available vendored docs"
    echo ""
    echo "Examples:"
    echo "  read-docs.sh fastapi     # before changing API patterns"
    echo "  read-docs.sh pixijs      # before touching canvas rendering"
    echo "  read-docs.sh --audit     # 'what am I exposed on?'"
    ;;
  *)
    search_package "$1"
    ;;
esac
