#!/bin/sh
# Finds har, node and gh for the herdr HAR panels. herdr starts mods with its own PATH,
# which usually lacks what your shell setup adds (nvm, volta, fnm, mise, asdf, Homebrew…).
#
#   find-tools.sh [shell] [har-path] [node-path]
#
# Tries, in order, until har and node are both found:
#   1. the paths set in the panel's Settings
#   2. your login shell's PATH          ($SHELL -l -c, in that shell's own syntax: sh/bash/zsh/fish/nu)
#   3. your interactive shell's PATH    (bash -i / zsh -l -i, detached from any terminal) — for setups
#                                       that live only in ~/.zshrc / ~/.bashrc / config.fish
#   4. the usual install folders        (nvm, volta, fnm, mise, asdf, nodenv, n, bun, npm-global, Homebrew…)
# Prints key=value lines: path (folders to put first on PATH), har, node, gh, how, and one tried= per step.

shell_bin=${1:-${SHELL:-}}
har_set=${2:-}
node_set=${3:-}

if [ -z "$shell_bin" ]; then
  shell_bin=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)
  [ -z "$shell_bin" ] && shell_bin=$(dscl . -read "/Users/$(id -un)" UserShell 2>/dev/null | awk '{print $2}')
  [ -z "$shell_bin" ] && shell_bin=/bin/sh
fi
shell_name=$(basename "$shell_bin")

with_timeout() { if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi; }

# find <PATH>: sets har / node / gh from that PATH
find_in() {
  har=$( (PATH=$1; command -v har) 2>/dev/null) || har=
  node=$( (PATH=$1; command -v node) 2>/dev/null) || node=
  gh=$( (PATH=$1; command -v gh) 2>/dev/null) || gh=
  case $har in /*) ;; *) har= ;; esac
  case $node in /*) ;; *) node= ;; esac
  case $gh in /*) ;; *) gh= ;; esac
  # prefer the node that sits next to har (same nvm/fnm version)
  if [ -n "$har" ] && [ -x "$(dirname "$har")/node" ]; then node=$(dirname "$har")/node; fi
}

missing() { m=; [ -z "$har" ] && m="har"; [ -z "$node" ] && m="${m:+$m, }node"; echo "${m:-nothing}"; }

done_with() { # how
  dirs=
  for b in "$har" "$node" "$gh"; do
    [ -n "$b" ] || continue
    d=$(dirname "$b")
    case ":$dirs:" in *":$d:"*) ;; *) dirs=${dirs:+$dirs:}$d ;; esac
  done
  printf 'path=%s\nhar=%s\nnode=%s\ngh=%s\nhow=%s\n' "$dirs" "$har" "$node" "$gh" "$1"
  exit 0
}

# The shell prints its PATH behind a marker, so whatever its startup files print is ignored.
case $shell_name in
  fish) probe='printf "__HAR_PATH=%s\n" (string join : $PATH)' ;;
  nu)   probe='print $"__HAR_PATH=($env.PATH | str join \":\")"' ;;
  *)    probe='printf "__HAR_PATH=%s\n" "$PATH"' ;;
esac
shell_path() { sed -n 's/^__HAR_PATH=//p' | tail -n 1; }

# 1. Settings
if [ -n "$har_set" ]; then
  if [ -x "$har_set" ]; then
    find_in "$(dirname "$har_set"):${node_set:+$(dirname "$node_set"):}$PATH"
    har=$har_set
    [ -n "$node_set" ] && [ -x "$node_set" ] && node=$node_set
    [ -n "$node" ] && done_with "settings"
    echo "tried=settings: har at $har_set, but no node next to it — set the node path too"
  else
    echo "tried=settings: $har_set is not an executable file"
  fi
fi

# 2. login shell
p=$(with_timeout 15 "$shell_bin" -l -c "$probe" </dev/null 2>/dev/null | shell_path)
if [ -n "$p" ]; then
  find_in "$p:$PATH"
  [ -n "$har" ] && [ -n "$node" ] && done_with "login shell ($shell_name -l)"
  echo "tried=login shell ($shell_name -l): $(missing) not on its PATH"
else
  echo "tried=login shell ($shell_name -l): did not answer"
fi

# 3. interactive shell, in its own session with no terminal, so it cannot take over herdr's.
#    bash reads ~/.bashrc only when interactive and NOT login; zsh reads ~/.zshrc when interactive.
#    fish reads config.fish even in step 2, and nu has no interactive -c: both skip this step.
case $shell_name in
  bash) iflags="-i" ;;
  fish|nu) iflags= ;;
  *) iflags="-l -i" ;;
esac
if [ -n "$iflags" ]; then
  if command -v setsid >/dev/null 2>&1; then detach="setsid -w"
  elif command -v perl >/dev/null 2>&1; then detach=perl
  else detach=
  fi
  if [ -n "$detach" ]; then
    if [ "$detach" = "setsid -w" ]; then
      p=$(with_timeout 15 setsid -w "$shell_bin" $iflags -c "$probe" </dev/null 2>/dev/null | shell_path)
    else
      p=$(with_timeout 15 perl -MPOSIX -e 'POSIX::setsid(); exec(@ARGV) or exit 127' "$shell_bin" $iflags -c "$probe" </dev/null 2>/dev/null | shell_path)
    fi
    if [ -n "$p" ]; then
      find_in "$p:$PATH"
      [ -n "$har" ] && [ -n "$node" ] && done_with "interactive shell ($shell_name $iflags)"
      echo "tried=interactive shell ($shell_name $iflags): $(missing) not on its PATH"
    else
      echo "tried=interactive shell ($shell_name $iflags): did not answer"
    fi
  else
    echo "tried=interactive shell: skipped (no setsid or perl to run it without a terminal)"
  fi
fi

# 4. usual install folders (newest node versions first)
H=$HOME
dirs=
nl='
'
add() { [ -d "$1" ] && dirs=${dirs:+$dirs:}$1; }
add_newest() { # glob results, newest version first (folder names may contain spaces)
  list=$(for d in "$@"; do [ -d "$d" ] && printf '%s\n' "$d"; done | sort -V -r 2>/dev/null)
  old_ifs=$IFS; IFS=$nl
  for d in $list; do add "$d"; done
  IFS=$old_ifs
}
add_newest "$H"/.nvm/versions/node/*/bin
add "$H/.volta/bin"
add_newest "$H"/.local/share/fnm/node-versions/*/installation/bin "$H"/.fnm/node-versions/*/installation/bin \
  "$H/Library/Application Support/fnm/node-versions/"*/installation/bin
add "$H/.local/share/mise/shims"
add_newest "$H"/.local/share/mise/installs/node/*/bin
add "$H/.asdf/shims"; add "$H/.nodenv/shims"; add "$H/n/bin"; add "$H/.bun/bin"
add "$H/.npm-global/bin"; add "$H/.npm/bin"; add "$H/.local/bin"; add "$H/bin"
add /opt/homebrew/bin; add /usr/local/bin; add /usr/bin; add /bin
find_in "$dirs"
[ -n "$har" ] && [ -n "$node" ] && done_with "usual install folders"
echo "tried=usual install folders: $(missing) not found"
printf 'path=\nhar=%s\nnode=%s\ngh=%s\nhow=\n' "$har" "$node" "$gh"
exit 1
