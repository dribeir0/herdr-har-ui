# herdr-har-ui

A [herdr](https://herdr.dev) layout for [HAR](https://github.com/os-factory/har). It puts your HAR projects, their agent slots, the coding agents running in them, the verification pipeline and OTel cost right next to your terminals.

![The HAR layout in herdr: project tree on the left, project overview on the right](docs/screenshots/default-view.png)

- **Left:** every HAR project, with its slots listed underneath, one line per slot.
- **Right:** the selected project's overview (usage, pipeline health, factory lines, work units) or the selected slot.
- **Bottom:** a status bar for the selected project.

## Features

### Project tree

- Each project is one line: name, path, slots in use, and a **+** that starts a new discussion.
- Each slot is one line: a status dot, `#id`, work unit, PR number, `↑` unpushed commits, `●` uncommitted changes, `stale`, and the last verify result.
- One search box covers projects, slots, work units, branches, PRs, commits and agent prompts. It also finds HAR projects on this machine that you haven't added yet.
- A header button switches to detailed cards, which show the branch, ahead/behind, PR state and a strip with one cell per verification stage.

### New discussion

**+** launches the project's first free slot, then starts your agent CLI (Claude Code or Codex) inside the new worktree.

When every slot is taken, a dialog ranks the slots from safest to free to riskiest. Each slot shows PR state, push state, uncommitted changes, last verify, open agents, cost and last commit. You choose to free it with **Teardown** or **Complete**.

![Slot chooser when every slot is taken](docs/screenshots/free-slot-popup.png)

### Overview and slot view

The **project overview** shows:
- **OTel usage:** the repo total, each model and each slot.
- **Pipeline health:** the last 16 verifies per stage, with pass rate, median duration and flaky stages.
- **Factory lines:** stations shown as pills.
- **Work units:** the slot working on each, attempts, cost and last activity.

![Detailed slot cards, factory lines and work units](docs/screenshots/detail-view.png)

The **slot view** shows the work unit, branch and base, Git & PR state with a "safe to free" verdict, and usage. It also lists previews, the herdr agents in the worktree, readiness warnings and recent runs. Its verification pipeline updates live while `har env verify` runs in its tab. Its buttons are Verify --full, Verify, Open space, Start agent, Mission Control, Complete… and Teardown….

![Work units with their slot, attempts and cost](docs/screenshots/work-unit-view.png)

## Requirements

- herdr desktop app (`herdr-app`)
- [`@osfactory/har`](https://www.npmjs.com/package/@osfactory/har) installed in your login shell (`npm i -g @osfactory/har`). nvm, volta and asdf installs are found through your login shell.
- Optional: `gh`, logged in, for PR state
- Optional: Mission Control (`har control up`) for OTel cost and tokens

## Install

```bash
git clone https://github.com/os-factory/herdr-har-ui
cd herdr-har-ui
./install.sh            # copies into ~/.config/herdr-app
./install.sh --link     # or symlinks, to edit in place
```

Then switch to the layout in herdr with `ctrl-shift-l` → **HAR**. On first run, the project list starts with the projects HAR already knows (`~/.har/repos.json`). Add more with **+** in the header or from the search results.

## Documentation

The **[user guide](docs/guide.md)** covers:
- every panel, and how to read the compact rows;
- what search matches;
- how slots are ranked for freeing;
- settings and key commands;
- where each number comes from;
- troubleshooting and customising the layout.

## Repository layout

```
install.sh                 copy or link into ~/.config/herdr-app
layouts/har.json           the herdr layout (sidebar tree, work area, right panel, status bar)
mods/har/main.js           views: tree, detail, status, free (dialog), settings
mods/har/data.js           data layer: har CLI, git, gh, Mission Control
mods/har/bin/              launch-agent.sh (free → launch → agent), collect.mjs (git + work units)
mods/har/icons/            Lucide icons (ISC)
docs/                      user guide and screenshots
```

## License

Apache-2.0
