#!/usr/bin/env bash
# schema-dump.sh — DB schema + API route map for FastAPI + SQLAlchemy
# Usage: bash agent/schema-dump.sh

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

MODELS_FILE="backend/sql_models.py"
ENDPOINTS_DIR="backend/endpoints"
MAIN_FILE="backend/main.py"

# ── Database Schema ──
header "Database Schema"

if [ -f "$MODELS_FILE" ]; then
  # Extract SQLAlchemy model classes with their columns
  awk '
    /^class [A-Za-z_]+\(Base\):/ {
      if (printing) print ""
      printing = 1
      print $0
      next
    }
    printing && /^class / && !/\(Base\)/ {
      printing = 0
      print ""
    }
    printing && /^[^ \t#]/ && !/^class / {
      printing = 0
      print ""
    }
    printing {
      print $0
    }
    END { if (printing) print "" }
  ' "$MODELS_FILE" 2>/dev/null
else
  err "Models file not found: $MODELS_FILE"
fi

# ── API Routes ──
header "API Routes"

if [ -d "$ENDPOINTS_DIR" ]; then
  subheader "Router Mounting (main.py)"
  if [ -f "$MAIN_FILE" ]; then
    grep -E "include_router|ALL_ROUTERS" "$MAIN_FILE" 2>/dev/null | while IFS= read -r line; do
      echo "  $line"
    done
  fi

  subheader "Route Definitions"
  for api_file in "$ENDPOINTS_DIR"/*.py; do
    [ -f "$api_file" ] || continue
    [ "$(basename "$api_file")" = "__init__.py" ] && continue
    rel="${api_file#$PROJECT_ROOT/}"
    rel="${rel#./}"

    # Extract router prefix
    prefix=$(awk '
      /router = APIRouter\(/ { in_router = 1 }
      in_router && /prefix=/ {
        match($0, /prefix=["\047]([^"\047]*)["\047]/, m)
        if (m[1]) print m[1]
        in_router = 0
      }
      in_router && /\)/ { in_router = 0 }
    ' "$api_file" 2>/dev/null)

    # Extract @router.method("/path") decorators
    routes=$(awk -v prefix="$prefix" '
      /@router\.(get|post|put|delete|patch)\(/ {
        line = $0
        # Extract method
        match(line, /@router\.(get|post|put|delete|patch)\(/, m)
        method = toupper(m[1])
        # Extract path from same line
        match(line, /\(["'\''"]([^"'\''"]*)["'\''"]/, p)
        path = p[1]
        if (method && path != "") {
          printf "  %-7s %s%s\n", method, prefix, path
        }
      }
    ' "$api_file" 2>/dev/null)

    if [ -n "$routes" ]; then
      echo -e "\n  ${CYAN}$rel${RESET}"
      echo "$routes"
    fi
  done
else
  err "Endpoints directory not found: $ENDPOINTS_DIR"
fi

echo ""
dim "Schema dump complete"
