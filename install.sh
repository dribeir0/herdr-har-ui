#!/usr/bin/env bash
# Installs the HAR layout and mod into herdr-app's config folder, plus herdr-web-browser so links
# and previews open inside herdr.
#   ./install.sh                     copy the files, install herdr-web-browser if it's missing
#   ./install.sh --link              symlink them instead (edit here, herdr reloads)
#   ./install.sh --no-browser        skip herdr-web-browser
#   ./install.sh --browser-agents    also let herdr-web-browser add its section to Claude Code /
#                                    Codex / OpenCode / Pi global instructions (off by default)
#   HERDR_CONFIG=/path ./install.sh
#   HERDR_BROWSER_SRC=/path ./install.sh   where herdr-web-browser is cloned (~/.local/src/herdr-web-browser)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dest=${HERDR_CONFIG:-$HOME/.config/herdr-app}
mode=copy browser=yes browser_agents=no
for a in "$@"; do
  case "$a" in
    --link) mode=link ;;
    --no-browser) browser=no ;;
    --browser-agents) browser_agents=yes ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
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
place "$here/layouts/har.json" "$dest/layouts/har.json"
place "$here/layouts/har.svg" "$dest/layouts/har.svg"
chmod +x "$dest/mods/har/bin/"*.sh

# ---- herdr-web-browser ------------------------------------------------------------------
# Not `herdr-web-browser install-cli`: that also rewrites the agents' global instructions on
# every run. Link the binary ourselves and run only the desktop and Chrome steps.
browser_bin="$HOME/.local/bin/herdr-web-browser"
if [ "$browser" = yes ]; then
  if [ -x "$browser_bin" ] || command -v herdr-web-browser >/dev/null; then
    echo "✓ herdr-web-browser found"
  elif ! command -v cargo >/dev/null || ! command -v git >/dev/null; then
    echo "→ herdr-web-browser skipped: it builds with Rust — install cargo (https://rustup.rs) and git, then rerun"
  else
    src=${HERDR_BROWSER_SRC:-$HOME/.local/src/herdr-web-browser}
    if [ ! -d "$src/.git" ]; then
      mkdir -p "$(dirname "$src")"
      git clone -q https://github.com/MattJColes/herdr-web-browser "$src"
    fi
    echo "→ building herdr-web-browser in $src (cargo build --release)…"
    (cd "$src" && cargo build --release --quiet)
    mkdir -p "$HOME/.local/bin"
    ln -sf "$src/target/release/herdr-web-browser" "$browser_bin"
    PATH="$HOME/.local/bin:$PATH" "$browser_bin" install-desktop
    PATH="$HOME/.local/bin:$PATH" "$browser_bin" install-browser   # its own Chrome for Testing (~200 MB)
    echo "✓ herdr-web-browser installed: Browser is in herdr's + menu, panel links open in it"
  fi
  if [ "$browser_agents" = yes ] && [ -x "$browser_bin" ]; then
    PATH="$HOME/.local/bin:$PATH" "$browser_bin" install-agents
  fi
fi

if command -v herdr-app >/dev/null; then
  herdr-app check "$dest/mods/har" >/dev/null && echo "✓ mod check passed"
  herdr-app do layout.switch --name har >/dev/null 2>&1 && echo "✓ switched herdr to the HAR layout" || echo "→ in herdr: ctrl-shift-l, pick HAR"
fi
echo "installed ($mode) into $dest"
