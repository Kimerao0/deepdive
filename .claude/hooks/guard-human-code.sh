#!/usr/bin/env bash
# deepdive: Alessandro writes every line of source. Claude writes docs/ and .claude/ only.
# This hook is the mechanical half of that rule; the judgment half lives in
# .claude/skills/guided-build/SKILL.md.
set -euo pipefail

payload="$(cat)"
target="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"

# Nothing path-shaped in the payload: not ours to police.
[ -z "$target" ] && exit 0

repo_root="${CLAUDE_PROJECT_DIR:-$PWD}"

case "$target" in
  "$repo_root"/*) rel="${target#"$repo_root"/}" ;;
  /*)             exit 0 ;;   # absolute path outside this repo
  *)              rel="$target" ;;
esac

case "$rel" in
  docs/*|.claude/*) exit 0 ;;
esac

read -r -d '' reason <<EOF || true
BLOCKED by the deepdive guided-build rule: Alessandro writes every line of source himself.
Claude may only write docs/** and .claude/**. Attempted: ${rel}

This is not a permissions glitch — it is the point of the repo. Do not route around it
(no /tmp staging, no heredoc via Bash, no "paste this in"). Instead, do the phase-3 thing:
name the concept, point at the doc, or describe the shape in words, and let him type it.
EOF

jq -nc --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
