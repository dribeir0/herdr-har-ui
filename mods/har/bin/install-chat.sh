#!/usr/bin/env bash
# Installs herdr-claude-chat (https://github.com/adamentwistle/herdr-claude-chat, MIT, by Adam Entwistle): a chat view
# of a live Claude Code session, swapped with its terminal by ctrl-shift-j or the toggle at the right of the tab row.
# Used by install.sh and by Settings → Chat view.
#   install-chat.sh            install or update to the pinned version
#   HERDR_CONFIG=/path         herdr-app's config folder (~/.config/herdr-app)
#   HERDR_CHAT_SRC=/path       where the repo is cloned (~/.local/src/herdr-claude-chat)
# Upstream is macOS-only. patches/claude-chat-linux.patch makes it run on Linux: bash when there's no zsh, and
# wl-paste/xclip for pasted images. On macOS the patch changes nothing (it only adds fallbacks).
set -euo pipefail
mod=$(cd "$(dirname "$0")/.." && pwd)                  # mods/har
dest=${HERDR_CONFIG:-$HOME/.config/herdr-app}
src=${HERDR_CHAT_SRC:-$HOME/.local/src/herdr-claude-chat}
pin=824654a                                            # upstream commit this patch is made for
url=https://github.com/adamentwistle/herdr-claude-chat

command -v git >/dev/null || { echo "✗ herdr-claude-chat needs git"; exit 1; }
command -v python3 >/dev/null || { echo "✗ herdr-claude-chat needs python3 (it reads transcripts with it)"; exit 1; }
[ -d "$src/.git" ] || { mkdir -p "$(dirname "$src")"; git clone -q "$url" "$src"; }
git -C "$src" cat-file -e "$pin^{commit}" 2>/dev/null || git -C "$src" fetch -q origin

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git -C "$src" archive "$pin" mods/claude-chat LICENSE | tar -x -C "$tmp"
(cd "$tmp" && git apply "$mod/patches/claude-chat-linux.patch")
cp "$tmp/LICENSE" "$tmp/mods/claude-chat/LICENSE"

target="$dest/mods/claude-chat"
if [ -L "$target" ]; then
  echo "✓ $target is a symlink — leaving it alone"
else
  if [ -d "$target" ] && ! diff -rq "$tmp/mods/claude-chat" "$target" >/dev/null 2>&1; then
    mkdir -p "$dest/backups"; b="$dest/backups/claude-chat.$(date +%s)"; mv "$target" "$b"; echo "backed up existing $target to $b"
  fi
  mkdir -p "$dest/mods"; rm -rf "$target"; cp -R "$tmp/mods/claude-chat" "$target"
fi

# ctrl-shift-j swaps terminal ↔ chat. Added only when the key is free.
python3 - "$dest/keys.json" <<'PY'
import json, os, sys
path = sys.argv[1]
keys = json.load(open(path)) if os.path.exists(path) else {}
g = keys.setdefault("global", {})
if g.get("ctrl-shift-j") not in (None, "claude-chat.swap"):
    print(f"→ ctrl-shift-j is already bound to {g['ctrl-shift-j']}: use the toggle at the right of the tab row instead")
elif "ctrl-shift-j" not in g:
    g["ctrl-shift-j"] = "claude-chat.swap"
    json.dump(keys, open(path, "w"), indent=2); print("✓ ctrl-shift-j swaps a Claude Code terminal and its chat")
PY

echo "✓ herdr-claude-chat installed (upstream $pin + Linux patch)"
echo "  It reads Claude Code transcripts under ~/.claude, and the first / in a folder runs a headless"
echo "  'claude -p' with /usage there (trusted folders only, no turn used). See its RECIPE.md."
