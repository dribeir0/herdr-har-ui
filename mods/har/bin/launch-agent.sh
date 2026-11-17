#!/usr/bin/env bash
# Frees a slot (optional), launches it, then starts the coding agent inside the new worktree.
#   launch-agent.sh <repo> <slot> <free: ""|complete|teardown> <work-id> <work-title> -- <agent argv...>
set -u
repo=$1 id=$2 free=$3 workid=$4 worktitle=$5; shift 5; [ "${1:-}" = "--" ] && shift
cd "$repo" || exit 1
hold() { printf '\n\033[31m✗ %s\033[0m — fix it here, then rerun.\n' "$1"; exec "${SHELL:-bash}" -l; }
if [ -n "$free" ]; then
  printf '\033[2m→ har env %s %s\033[0m\n' "$free" "$id"
  har env "$free" "$id" --repo "$repo" || hold "har env $free $id failed"
fi
args=(env launch "$id" --repo "$repo")
[ -n "$workid" ] && args+=(--work-id "$workid")
[ -n "$worktitle" ] && args+=(--work-title "$worktitle")
printf '\033[2m→ har %s\033[0m\n' "${args[*]}"
har "${args[@]}" || hold "har env launch $id failed"
wd=$(har env status --json --repo "$repo" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const x = JSON.parse(s).slots.find((s) => String(s.agentId) === process.argv[1] && s.active);
    process.stdout.write(x?.workDir ?? "");
  });' "$id")
[ -n "$wd" ] && [ -d "$wd" ] || hold "slot $id has no work dir after launch"
cd "$wd" || exit 1
printf '\n\033[32m✓ slot %s ready\033[0m · %s\n\033[2m→ %s\033[0m\n\n' "$id" "$wd" "$*"
if [ $# -gt 0 ]; then
  "$@"; code=$?
  # the agent ended (quit or crashed): stay in the slot's worktree instead of the main checkout
  printf '\n\033[2m%s exited (%s) — shell in slot %s worktree; rerun: %s\033[0m\n' "$1" "$code" "$id" "$*"
fi
cd "$wd" && exec "${SHELL:-bash}" -l
