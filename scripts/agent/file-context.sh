#!/usr/bin/env bash
# file-context.sh — File + imported signatures (the centerpiece utility)
# Usage: bash scripts/agent/file-context.sh <file-path> [--no-imports]
# Shows the file content, extracts imports, resolves them, and shows exported signatures.

source "$(dirname "$0")/_common.sh"
cd "$PROJECT_ROOT"

# ── extract_signatures(file_path) ──
# Single-pass awk: prints exported interfaces, types, enums (full blocks),
# function declarations (body replaced with {...}), const declarations,
# class declarations with method signatures. Skips non-exported code.
extract_signatures() {
  local file="$1"
  awk '
    BEGIN { brace_depth = 0; in_block = 0; block_lines = 0; max_block = 30 }

    # Re-exports: export { ... } from
    /^export \{.*\} from / { print; next }
    /^export \* from / { print; next }

    # export interface/type/enum — print full block
    /^export (interface|type|enum) / {
      in_block = 1
      block_type = "block"
      brace_depth = 0
      block_lines = 0
    }

    # export function — print declaration, skip body
    /^export (async )?function / {
      # Print just the signature line
      line = $0
      gsub(/\{[^}]*$/, "{...}", line)
      print line
      # If opening brace on this line, skip the body
      if ($0 ~ /\{/) {
        skip_depth = 0
        n = split($0, chars, "")
        for (i = 1; i <= n; i++) {
          if (chars[i] == "{") skip_depth++
          if (chars[i] == "}") skip_depth--
        }
        if (skip_depth > 0) {
          in_skip = 1
          skip_brace = skip_depth
        }
      }
      next
    }

    # Skip function bodies
    in_skip {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        if (chars[i] == "{") skip_brace++
        if (chars[i] == "}") skip_brace--
      }
      if (skip_brace <= 0) in_skip = 0
      next
    }

    # export const — start tracking
    /^export const / {
      # Single-line const (no opening brace or brace closes on same line)
      if ($0 !~ /\{/ || ($0 ~ /\{/ && $0 ~ /\}/)) {
        # Truncate long single-line values
        line = $0
        if (length(line) > 120) line = substr(line, 1, 117) "..."
        print line
        next
      }
      # Multi-line const with object/array
      in_block = 1
      block_type = "block"
      brace_depth = 0
      block_lines = 0
    }

    # export class — print class + method sigs
    /^export (abstract )?class / {
      in_block = 1
      block_type = "class"
      brace_depth = 0
      block_lines = 0
      class_brace = 0
    }

    # Handle block printing
    in_block {
      block_lines++
      if (block_lines > max_block) {
        if (block_lines == max_block + 1) print "  ... (truncated)"
        # Still track braces to know when block ends
        n = split($0, chars, "")
        for (i = 1; i <= n; i++) {
          if (chars[i] == "{") brace_depth++
          if (chars[i] == "}") brace_depth--
        }
        if (brace_depth <= 0) {
          in_block = 0
          print ""
        }
        next
      }

      if (block_type == "class") {
        # In class: print method signatures, skip method bodies
        if ($0 ~ /^\s+(public |private |protected |static |async |get |set )?[a-zA-Z_].*\(.*\).*\{/) {
          line = $0
          gsub(/\{[^}]*$/, "{...}", line)
          print line
        } else if ($0 ~ /^\s+(public |private |protected )?(readonly )?[a-zA-Z_].*[:;]/) {
          # Property declaration
          print
        } else if ($0 ~ /^export/ || $0 ~ /^\}/) {
          print
        }
      } else {
        print
      }

      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        if (chars[i] == "{") brace_depth++
        if (chars[i] == "}") brace_depth--
      }
      if (brace_depth <= 0 && block_lines > 1) {
        in_block = 0
        print ""
      }
    }
  ' "$file" 2>/dev/null
}

# ── Main ──

if [ $# -lt 1 ]; then
  err "Usage: file-context.sh <file-path> [--no-imports]"
  exit 1
fi

TARGET="$1"
SHOW_IMPORTS=true
[ "${2:-}" = "--no-imports" ] && SHOW_IMPORTS=false

# Resolve relative to project root
if [ ! -f "$TARGET" ]; then
  if [ -f "$PROJECT_ROOT/$TARGET" ]; then
    TARGET="$PROJECT_ROOT/$TARGET"
  else
    err "File not found: $TARGET"
    exit 1
  fi
fi

TARGET="$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")"
REL_PATH="${TARGET#$PROJECT_ROOT/}"

header "File: $REL_PATH"
line_count=$(wc -l < "$TARGET")
echo "Lines: $line_count"

# Show file content (cap at 300 lines)
subheader "Content"
if [ "$line_count" -le 300 ]; then
  cat -n "$TARGET"
else
  head -n 300 "$TARGET" | cat -n
  dim "  ... (truncated, showing 300 of $line_count lines)"
fi

if [ "$SHOW_IMPORTS" = false ]; then
  exit 0
fi

# ── Extract and resolve imports ──
header "Import Analysis"
import_paths=$(extract_imports "$TARGET")

if [ -z "$import_paths" ]; then
  dim "  No imports found"
  exit 0
fi

FROM_DIR="$(dirname "$TARGET")"
resolved_count=0
skipped_count=0

while IFS= read -r imp; do
  resolved=$(resolve_import "$FROM_DIR" "$imp" 2>/dev/null) || true

  if [ -n "$resolved" ]; then
    resolved_count=$((resolved_count + 1))
    rel_resolved="${resolved#$PROJECT_ROOT/}"
    subheader "Import: $imp → $rel_resolved"

    # Extract exported signatures from the resolved file
    sigs=$(extract_signatures "$resolved")
    if [ -n "$sigs" ]; then
      echo "$sigs"
    else
      dim "  (no exported signatures found)"
    fi
  else
    skipped_count=$((skipped_count + 1))
    dim "  ⊘ $imp (external/unresolved)"
  fi
done <<< "$import_paths"

echo ""
dim "Resolved: $resolved_count | Skipped (external): $skipped_count"
