#!/usr/bin/env bash
# Builds and sets up herdr-web-browser (https://github.com/MattJColes/herdr-web-browser) so links
# open in a browser pane inside herdr desktop. Used by install.sh and by Settings → Links.
#   install-browser.sh [--agents]   --agents: also add its section to the agents' global instructions
# Not `herdr-web-browser install-cli`: that rewrites the agents' instructions on every run.
set -euo pipefail
agents=no; [ "${1:-}" = "--agents" ] && agents=yes
bin="$HOME/.local/bin/herdr-web-browser"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
if [ -x "$bin" ]; then
  echo "✓ herdr-web-browser is already installed ($bin)"
else
  command -v cargo >/dev/null && command -v git >/dev/null || {
    echo "✗ herdr-web-browser builds from source with Rust: install cargo (https://rustup.rs) and git, then run this again."; exit 1; }
  src=${HERDR_BROWSER_SRC:-$HOME/.local/src/herdr-web-browser}
  [ -d "$src/.git" ] || { mkdir -p "$(dirname "$src")"; git clone -q https://github.com/MattJColes/herdr-web-browser "$src"; }
  echo "→ building herdr-web-browser in $src (cargo build --release)…"
  (cd "$src" && cargo build --release --quiet)
  mkdir -p "$HOME/.local/bin"
  ln -sf "$src/target/release/herdr-web-browser" "$bin"
  "$bin" install-desktop
  echo "→ downloading its own Chrome for Testing (~200 MB)…"
  "$bin" install-browser
  echo "✓ herdr-web-browser installed: Browser is in herdr's + menu, and HAR panel links open in it."
fi
[ "$agents" = yes ] && "$bin" install-agents
exit 0
