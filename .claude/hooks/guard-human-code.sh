#!/usr/bin/env bash
# deepdive: Alessandro writes every line that carries a decision. Claude writes the
# scaffolding — config, CI, docs, root layouts. This hook is the mechanical half of that
# rule; the judgment half (boilerplate vs logic) lives in
# .claude/skills/guided-build/SKILL.md and cannot be expressed as a path.
#
# Revised 2026-08-04: originally docs/ and .claude/ only. Widened after 0.1 showed the
# strict rule bought friction on declarative config rather than understanding.
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

# Claude's own territory: no source lives here.
case "$rel" in
  docs/*|.claude/*) exit 0 ;;
esac

# Order matters. Source directories are his whatever the extension — room templates at
# 1.4 are .json but they are authored content, not config. So the src/app test runs
# BEFORE the config-extension test, and falls through to the deny below.
case "$rel" in
  apps/*/app/layout.tsx)                 exit 0 ;;   # required shape, no design content
  src/*|*/src/*|app/*|*/app/*)           ;;          # his — fall through to deny
  *.json|*.jsonc|*.yaml|*.yml)           exit 0 ;;
  *.config.ts|*.config.mts|*.config.js|*.config.mjs|*.config.cjs) exit 0 ;;
  .github/*)                             exit 0 ;;
  .*ignore|.npmrc|.nvmrc|.env.example|Dockerfile) exit 0 ;;
esac

read -r -d '' reason <<EOF || true
BLOCKED by the deepdive guided-build rule: Alessandro writes every line that carries a
decision. Claude writes scaffolding only — config, CI, docs, root layouts. Attempted: ${rel}

This is not a permissions glitch — it is the point of the repo. Do not route around it
(no /tmp staging, no heredoc via Bash, no "paste this in"). Instead, do the phase-3 thing:
name the concept, point at the doc, or describe the shape in words, and let him type it.

If you are about to argue that this file is "just boilerplate": boilerplate is what would
look identical in any project. A decision about THIS game makes it his. When unsure, his.
EOF

jq -nc --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
