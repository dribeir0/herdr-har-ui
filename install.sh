#!/usr/bin/env bash
# Installs the HAR layout and mod into herdr-app's config folder.
#   ./install.sh            copy the files
#   ./install.sh --link     symlink them (edit here, herdr reloads)
#   HERDR_CONFIG=/path ./install.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dest=${HERDR_CONFIG:-$HOME/.config/herdr-app}
mode=copy; [ "${1:-}" = "--link" ] && mode=link

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
place "$here/layouts/har.json" "$dest/layouts/har.json"
place "$here/layouts/har.svg" "$dest/layouts/har.svg"
chmod +x "$dest/mods/har/bin/launch-agent.sh"

if command -v herdr-app >/dev/null; then
  herdr-app check "$dest/mods/har" >/dev/null && echo "✓ mod check passed"
  herdr-app do layout.switch --name har >/dev/null 2>&1 && echo "✓ switched herdr to the HAR layout" || echo "→ in herdr: ctrl-shift-l, pick HAR"
fi
echo "installed ($mode) into $dest"
