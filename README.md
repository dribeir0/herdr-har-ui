# herdr-har-ui

A [herdr](https://herdr.dev) layout for [HAR](https://github.com/os-factory/har): your projects, their agent slots, the coding agents running in them, verification pipelines and OTel cost — next to your terminals.

## What you get

**Left — project tree.** Every HAR project (name + path) with its slots underneath.
- Compact (one line per slot: status, `#id`, work unit, PR, `↑unpushed`, `●dirty`, stale, verify ✓/✗) or detailed cards — toggle in the header.
- One search box over project names/paths, slot ids, work units and titles, branches, PR numbers and titles, last commits and agent prompts. Other harnesses found on the machine show up as results you can add.
- **+** on a project starts a new discussion: launches the first free slot and opens your agent CLI (claude / codex) inside the new worktree. When every slot is taken, a dialog ranks the slots from safest to free (PR merged, nothing committed) to keep (unpushed commits, uncommitted changes, agent still working) and frees the one you pick with `teardown` or `complete`.

**Right — overview or slot.**
- Project overview: OTel usage (repo total, per slot, per model), pipeline health (last 16 verifies per stage, pass rate, median, flaky stages), factory lines (stations), work units (slot, attempts, cost).
- Slot view: work unit, branch/base, Git & PR state with a free-safety verdict, usage, previews, herdr agents in the worktree, live verification pipeline (ticks while `har env verify` runs in its tab), readiness, recent runs. Buttons: Verify --full, Verify, Open space, Start agent, Mission Control, Complete…, Teardown….

**Bottom — status bar.** Slots in use, agents working / needing you, failing verifies, stale slots, repo cost.

## Requirements

- herdr desktop (`herdr-app`)
- `@osfactory/har` on your login shell PATH (`npm i -g @osfactory/har`) — nvm/volta installs are found through your login shell
- optional: `gh` (PR state), Mission Control running (`har control up`) for OTel cost and tokens

## Install

```bash
git clone https://github.com/os-factory/herdr-har-ui
cd herdr-har-ui
./install.sh          # or ./install.sh --link to work on it in place
```

Then in herdr: `ctrl-shift-l` → **HAR**. On first run the project list is seeded from `~/.har/repos.json`; add more with **+** or the search box.

## Settings and keys

The gear in the tree header sets the slot view (compact/detailed), the agent CLI new slots start, and whether free slots are listed.

Commands you can bind in `~/.config/herdr-app/keys.json`:

| Command | Does |
|---|---|
| `har.new` | New discussion in the selected project |
| `har.choose` | Open the slot chooser |
| `har.slot-1` … `har.slot-N` | Select a slot |
| `har.overview` | Back to the project overview |
| `har.verify` / `har.verify-full` | Verify the selected slot |
| `har.open` / `har.agent` | Open the slot's space / start the agent in it |
| `har.toggle-view` / `har.settings` | Compact ↔ detailed / settings |
| `har.refresh` / `har.next-repo` | Refresh / next project |

## Where the data comes from

| Panel data | Source |
|---|---|
| Slots, readiness, previews | `har env status --json` |
| Runs, pipeline | `har env runs list --json`, `.har/stages.json`, live parse of the verify tab |
| Factory lines | `har line status --json` |
| Work units | `.har/work-units/`, `.har/work-attempts/` |
| Unpushed / merged / dirty | `git` in each slot worktree (`mods/har/bin/collect.mjs`) |
| PRs | `gh pr list` (cached 60s) |
| Cost & tokens | Mission Control `/api/repos/:id/usage` (OTel) |

Nothing is written by the panels except through the HAR commands you click (launch, verify, complete, teardown), each run in a visible herdr tab.

## Layout

```
mods/har/main.js          views: tree, detail, status, free (dialog), settings (popup)
mods/har/data.js          data layer (har CLI, git, gh, Mission Control)
mods/har/bin/             launch-agent.sh (free → launch → agent), collect.mjs (git + work units)
layouts/har.json          the herdr layout
```

`herdr-app types mods/har` writes `gpui-kit.d.ts` for editor completion (not committed).

Icons are from [Lucide](https://lucide.dev) (ISC).

## License

Apache-2.0
