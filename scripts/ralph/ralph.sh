#!/bin/bash
# Ralph - Long-running AI agent loop for Klick
# Usage: ./ralph.sh [--tool codex|claude|amp] [max_iterations]

set -e

# Parse arguments
TOOL="codex"
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" && "$TOOL" != "codex" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp', 'claude', or 'codex'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
LOG_DIR="$SCRIPT_DIR/logs"

RULES_CANDIDATES=(
  "$PROJECT_ROOT/CLAUDE.md"
  "$PROJECT_ROOT/.clinerules"
  "$PROJECT_ROOT/PROJECT.md"
  "$PROJECT_ROOT/docs/technical.md"
  "$PROJECT_ROOT/docs/README.md"
)

RULES_FILES=()
for candidate in "${RULES_CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    RULES_FILES+=("$candidate")
  fi
done

initialize_progress_file() {
  cat > "$PROGRESS_FILE" <<EOF
# Ralph Progress Log
Started: $(date)

## Codebase Patterns
- Document reusable codebase patterns found during iterations.

---
EOF
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    initialize_progress_file
  fi
fi

if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

if [ ! -f "$PROGRESS_FILE" ]; then
  initialize_progress_file
fi

echo "Starting Ralph (Klick) - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
mkdir -p "$LOG_DIR"

if jq -e '.userStories | all(.passes == true)' "$PRD_FILE" >/dev/null 2>&1; then
  echo "All user stories already marked as complete in $PRD_FILE."
  echo "Nothing to run."
  exit 0
fi

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  RULES=""
  if [ ${#RULES_FILES[@]} -gt 0 ]; then
    for rules_file in "${RULES_FILES[@]}"; do
      RULES="${RULES}

## Rules Source: ${rules_file#$PROJECT_ROOT/}

$(cat "$rules_file")
"
    done
  fi

  if [[ "$TOOL" == "amp" ]]; then
    if [ ! -f "$SCRIPT_DIR/prompt.md" ]; then
      echo "Error: $SCRIPT_DIR/prompt.md not found for amp mode."
      exit 1
    fi
    COMBINED=$(printf "%s\n\n---\n\n%s" "$RULES" "$(cat "$SCRIPT_DIR/prompt.md")")
    OUTPUT=$(echo "$COMBINED" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  elif [[ "$TOOL" == "claude" ]]; then
    if [ ! -f "$SCRIPT_DIR/CLAUDE.md" ]; then
      echo "Error: $SCRIPT_DIR/CLAUDE.md not found for claude mode."
      exit 1
    fi
    COMBINED=$(printf "%s\n\n---\n\n%s" "$RULES" "$(cat "$SCRIPT_DIR/CLAUDE.md")")
    OUTPUT=$(echo "$COMBINED" | claude --dangerously-skip-permissions --print 2>&1 | tee /dev/stderr) || true
  elif [[ "$TOOL" == "codex" ]]; then
    if [ ! -f "$SCRIPT_DIR/CODEX.md" ]; then
      echo "Error: $SCRIPT_DIR/CODEX.md not found for codex mode."
      exit 1
    fi

    COMBINED=$(printf "%s\n\n---\n\n%s" "$RULES" "$(cat "$SCRIPT_DIR/CODEX.md")")
    LAST_MESSAGE_FILE=$(mktemp)
    ITERATION_LOG="$LOG_DIR/codex-iteration-$i.log"

    codex exec --dangerously-bypass-approvals-and-sandbox \
      --output-last-message "$LAST_MESSAGE_FILE" \
      "$COMBINED" > "$ITERATION_LOG" 2>&1 || true

    OUTPUT=""
    if [ -f "$LAST_MESSAGE_FILE" ]; then
      OUTPUT=$(cat "$LAST_MESSAGE_FILE")
      rm -f "$LAST_MESSAGE_FILE"
    fi

    if [ -n "$OUTPUT" ]; then
      echo "$OUTPUT"
    else
      echo "Warning: Codex did not return a final message. See log: $ITERATION_LOG"
      tail -n 50 "$ITERATION_LOG" || true
    fi

    echo "Codex log saved to: $ITERATION_LOG"
  fi

  if jq -e '.userStories | all(.passes == true)' "$PRD_FILE" >/dev/null 2>&1; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
