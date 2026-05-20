#!/bin/bash

root_dir="${1:-.}"

total=0
annotated=0

is_comment_line() {
  [[ "$1" =~ ^[[:space:]]*// ]]
}

is_string_only_line() {
  local trimmed
  trimmed="$(sed 's/^[[:space:]]*//' <<<"$1")"
  [[ "$trimmed" == \"*\" ]] || [[ "$trimmed" == \'*\' ]]
}

is_key_remapping() {
  local trimmed
  trimmed="$(sed 's/^[[:space:]]*//' <<<"$1")"
  [[ "$trimmed" == \[* ]] && [[ "$trimmed" == *" in "* ]] && [[ "$trimmed" == *" as "* ]]
}

while IFS= read -r -d '' file; do
  prev_line=""
  line_num=0
  while IFS= read -r line; do
    ((line_num++))
    if [[ "$line" == *" as "* ]] &&
       [[ "$line" != *"as const"* ]] &&
       [[ "$line" != *"import "* ]] &&
       ! is_comment_line "$line" &&
       ! is_string_only_line "$line" &&
       ! is_key_remapping "$line"; then
      ((total++))
      if [[ "$prev_line" == *"// TSAS:"* ]]; then
        ((annotated++))
      else
        echo "  MISSING: ${file#./}:$line_num"
      fi
    fi
    prev_line="$line"
  done < "$file"
done < <(find "$root_dir" \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -name "*.d.ts" -print0)

echo ""
echo "Score: $annotated/$total annotated with TSAS"
