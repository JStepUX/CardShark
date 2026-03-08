#!/usr/bin/env bash
# codebase-snapshot.sh — Project orientation in one call
# Usage: bash agent/codebase-snapshot.sh

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

header "Project Structure"
# Tree view excluding noise directories, max depth 3
find . -maxdepth 3 \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/.git' \
  -not -path '*/dist/*' \
  -not -path '*/.vite/*' \
  -not -path '*/build/*' \
  -not -path '*/coverage/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/.pytest_cache/*' \
  -not -path '*/*.egg-info/*' \
  -not -name '*.lock' \
  -not -name 'package-lock.json' \
  \( -type f -o -type d \) | sort | head -120

header "File Counts by Type"
echo "TypeScript (.ts/.tsx):"
find . -name '*.ts' -o -name '*.tsx' | grep -vE "$EXCLUDE_DIRS" | wc -l
echo "Python (.py):"
find . -name '*.py' | grep -vE "$EXCLUDE_DIRS|__pycache__" | wc -l
echo "JavaScript (.js/.jsx):"
find . -name '*.js' -o -name '*.jsx' | grep -vE "$EXCLUDE_DIRS" | wc -l
echo "CSS/SCSS:"
find . -name '*.css' -o -name '*.scss' | grep -vE "$EXCLUDE_DIRS" | wc -l
echo "JSON (config):"
find . -maxdepth 2 -name '*.json' | grep -vE "$EXCLUDE_DIRS" | wc -l

header "Recent Git History (last 15 commits)"
git log --oneline -15 2>/dev/null || dim "(not a git repo)"

header "Package Scripts (Frontend)"
if [ -f "frontend/package.json" ]; then
  # Use node to extract scripts if available, else python, else raw grep
  if command -v node &>/dev/null; then
    node -e "
      const pkg = require('./frontend/package.json');
      if (pkg.scripts) {
        Object.entries(pkg.scripts).forEach(([k,v]) => console.log('  ' + k + ': ' + v));
      } else {
        console.log('  (no scripts)');
      }
    " 2>/dev/null || dim "  (could not parse)"
  elif command -v python &>/dev/null; then
    python -c "
import json
with open('frontend/package.json') as f:
    pkg = json.load(f)
for k, v in pkg.get('scripts', {}).items():
    print(f'  {k}: {v}')
" 2>/dev/null || dim "  (could not parse)"
  else
    dim "  (no node or python available to parse JSON)"
  fi
else
  dim "  (no frontend/package.json)"
fi

header "Backend Entry Points"
if [ -f "backend/main.py" ]; then
  echo "  backend/main.py (FastAPI)"
fi
if [ -f "backend/requirements.txt" ]; then
  dep_count=$(wc -l < backend/requirements.txt)
  echo "  backend/requirements.txt ($dep_count dependencies)"
fi
if [ -f "start.py" ]; then
  echo "  start.py (combined launcher)"
fi
if [ -f "build.py" ]; then
  echo "  build.py (PyInstaller build)"
fi

header "Key Config Files"
for f in tsconfig.json vite.config.ts tailwind.config.js jest.config.cjs; do
  if [ -f "$f" ] || [ -f "frontend/$f" ]; then
    echo "  ✓ $f"
  fi
done
for f in requirements.txt pyproject.toml pytest.ini; do
  if [ -f "$f" ] || [ -f "backend/$f" ]; then
    echo "  ✓ $f"
  fi
done
if [ -f ".env.example" ]; then
  echo "  ✓ .env.example"
fi

header "Database Schema Tables"
if [ -f "backend/sql_models.py" ]; then
  grep -oP "__tablename__\s*=\s*[\"']\K[^\"']+" backend/sql_models.py 2>/dev/null | while read -r table; do
    echo "  • $table"
  done
else
  dim "  (sql_models.py not found)"
fi

echo ""
dim "Snapshot generated from $PROJECT_ROOT"
