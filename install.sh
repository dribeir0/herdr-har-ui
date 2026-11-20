#!/usr/bin/env bash
# Installs the HAR layout and mod into herdr-app's config folder, plus herdr-web-browser so links
# and previews open inside herdr, and herdr-claude-chat so a Claude Code terminal can be read as a chat.
#   ./install.sh                     copy the files, install herdr-web-browser if it's missing
#   ./install.sh --link              symlink them instead (edit here, herdr reloads)
#   ./install.sh --no-browser        skip herdr-web-browser
#   ./install.sh --no-chat           skip herdr-claude-chat (and its toggle in the tab row)
#   ./install.sh --browser-agents    also let herdr-web-browser add its section to Claude Code /
#                                    Codex / OpenCode / Pi global instructions (off by default)
#   HERDR_CONFIG=/path ./install.sh
#   HERDR_BROWSER_SRC=/path ./install.sh   where herdr-web-browser is cloned (~/.local/src/herdr-web-browser)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dest=${HERDR_CONFIG:-$HOME/.config/herdr-app}
mode=copy browser=yes browser_agents=no chat=yes
for a in "$@"; do
  case "$a" in
    --link) mode=link ;;
    --no-browser) browser=no ;;
    --no-chat) chat=no ;;
    --browser-agents) browser_agents=yes ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $a (see --help)"; exit 2 ;;
  esac
done

[ -d "$dest" ] || { echo "herdr config not found at $dest — install herdr (https://herdr.dev) and start it once"; exit 1; }
command -v har >/dev/null || echo "warning: \`har\` is not on your PATH — npm install -g @osfactory/har"
mkdir -p "$dest/mods" "$dest/layouts"

place() { # src dst
  if [ -e "$2" ] || [ -L "$2" ]; then
    if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then return; fi
    mv "$2" "$2.bak.$(date +%s)"; echo "backed up existing $2"
  fi
  if [ "$mode" = link ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
}
place "$here/mods/har" "$dest/mods/har"
place "$here/mods/har-tabs" "$dest/mods/har-tabs"
place "$here/layouts/har.json" "$dest/layouts/har.json"
place "$here/layouts/har.svg" "$dest/layouts/har.svg"
chmod +x "$dest/mods/har/bin/"*.sh

# ---- herdr-web-browser ------------------------------------------------------------------
# The panel opens previews, PRs and Mission Control in herdr-web-browser (a browser pane inside
# herdr). mods/har/bin/install-browser.sh builds it; Settings → Links runs the same script later.
if [ "$browser" = yes ]; then
  "$here/mods/har/bin/install-browser.sh" $([ "$browser_agents" = yes ] && echo --agents) \
    || echo "→ continuing without herdr-web-browser: links will open in your system browser"
fi

# ---- herdr-claude-chat -------------------------------------------------------------------
# A chat view of a live Claude Code session, swapped with its terminal by ctrl-shift-j or the toggle at
# the right of the tab row. mods/har/bin/install-chat.sh fetches it and applies the Linux patch.
if [ "$chat" = yes ]; then
  HERDR_CONFIG="$dest" "$here/mods/har/bin/install-chat.sh" || { echo "→ continuing without the chat view"; chat=no; }
fi
if [ "$chat" = no ] && [ ! -d "$dest/mods/claude-chat" ]; then
  # No chat mod: take its toggle out of the tab row, or the layout would point at a missing mod.
  if [ "$mode" = link ]; then echo "→ --link without the chat mod: the tab row's toggle stays empty"
  else python3 - "$dest/layouts/har.json" <<'PY'
import json, sys
path = sys.argv[1]; j = json.load(open(path))
def walk(n):
    for c in n.get("children") or []:
        if c.get("id") == "tabs-row":
            c["children"] = [k for k in c["children"] if k.get("id") != "chat-toggle"]
        walk(c)
walk(j.get("root", j)); json.dump(j, open(path, "w"), indent=2)
PY
  fi
fi

if command -v herdr-app >/dev/null; then
  herdr-app check "$dest/mods/har" >/dev/null && herdr-app check "$dest/mods/har-tabs" >/dev/null && echo "✓ mod check passed"
  herdr-app do layout.switch --name har >/dev/null 2>&1 && echo "✓ switched herdr to the HAR layout" || echo "→ in herdr: ctrl-shift-l, pick HAR"
fi
echo "installed ($mode) into $dest"
