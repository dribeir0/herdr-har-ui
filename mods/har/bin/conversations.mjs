#!/usr/bin/env node
// Claude Code and Codex conversations of a folder, newest first, as JSON:
//   { total, items: [{ agent: "claude" | "codex", id, title, at, cwd, live, liveIn, bound }] }
// Usage:
//   conversations.mjs <dir> [limit=50]                                  conversations started in <dir>
//   conversations.mjs <worktree> [limit] --repo <repo> --branch <b>     a slot's: started in its worktree, plus
//        the ones HAR bound to the slot when they launched it (<repo>/.har/session-bindings, same branch). Those
//        often ran in the repo folder (Claude Desktop, an IDE): `cwd` says where to resume them.
//   conversations.mjs <repo> [limit] --repo <repo> --exclude-branches a,b   the repo's own, without the ones
//        bound to these (active) slots
// `liveIn` is where a live Claude Code session runs ("cli", "claude-desktop", …): resuming it a second time
// would make two writers of one conversation. Transcripts can be tens of MB: only their first and last 256 KB
// are read.
import { openSync, readSync, closeSync, statSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const [repo, limitArg] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const limit = Number(limitArg) || 50;
const harRepo = flag("--repo"), branch = flag("--branch");
const excludeBranches = new Set((flag("--exclude-branches") ?? "").split(",").filter(Boolean));
const home = homedir();
const CHUNK = 256 * 1024;
const DAYS = 120; // Codex rollouts older than this are not scanned

function slice(path, size, fromEnd) {
  const fd = openSync(path, "r");
  try {
    const { size: total } = statSync(path);
    const len = Math.min(size, total);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, fromEnd ? total - len : 0);
    return buf.toString("utf8");
  } finally { closeSync(fd); }
}
const lines = (text) => text.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const clip = (s) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > 120 ? `${t.slice(0, 117)}…` : t; };

// The text a person typed, skipping command wrappers, tool results and pasted system context.
function typed(content) {
  const text = typeof content === "string" ? content
    : Array.isArray(content) ? content.filter((c) => c?.type === "text").map((c) => c.text).join(" ") : "";
  const t = text.trim();
  return t && !t.startsWith("<") && !t.startsWith("Caveat:") ? t : null;
}

function claude() {
  const dir = join(home, ".claude", "projects", repo.replace(/[^A-Za-z0-9]/g, "-"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => {
    const path = join(dir, f);
    return { agent: "claude", id: f.slice(0, -6), path, at: statSync(path).mtimeMs, cwd: repo };
  });
}

// Sessions HAR recorded as launching (or holding) a slot, from <repo>/.har/session-bindings/*.json:
// [{ agentTool, sessionId, branch, kind }]
function bindings() {
  if (!harRepo) return [];
  const dir = join(harRepo, ".har", "session-bindings");
  return safeDir(dir).flatMap((f) => { try { return [JSON.parse(readFileSync(join(dir, f), "utf8"))]; } catch { return []; } })
    .filter((b) => b?.sessionId && b.branch);
}

// A Claude Code transcript by session id, wherever it was started.
function claudeById(id) {
  const root = join(home, ".claude", "projects");
  for (const d of safeDir(root)) {
    const path = join(root, d, `${id}.jsonl`);
    if (!existsSync(path)) continue;
    const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(slice(path, 65536, false))?.[1];
    return { agent: "claude", id, path, at: statSync(path).mtimeMs, cwd: cwd ? JSON.parse(`"${cwd}"`) : null, bound: true };
  }
  return null;
}

function claudeTitle(c) {
  const head = lines(slice(c.path, CHUNK, false));
  const tail = lines(slice(c.path, CHUNK, true));
  const titled = [...tail].reverse().find((o) => o.type === "ai-title" || o.type === "custom-title" || o.type === "summary")
    ?? [...head].reverse().find((o) => o.type === "ai-title" || o.type === "custom-title" || o.type === "summary");
  if (titled) return clip(titled.customTitle ?? titled.aiTitle ?? titled.title ?? titled.summary);
  const first = head.find((o) => o.type === "user" && !o.isMeta && typed(o.message?.content));
  return first ? clip(typed(first.message.content)) : null;
}

function codex(ids) {
  const root = join(home, ".codex", "sessions");
  if (!existsSync(root)) return [];
  const since = Date.now() - DAYS * 86400e3;
  const out = [];
  for (const y of readdirSync(root)) for (const m of safeDir(join(root, y))) for (const d of safeDir(join(root, y, m))) {
    const day = join(root, y, m, d);
    if (new Date(`${y}-${m}-${d}T23:59:59Z`).getTime() < since) continue;
    for (const f of safeDir(day)) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(day, f);
      const head = slice(path, 8192, false);
      const meta = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(head);
      const id = /"id":"([0-9a-f-]{36})"/.exec(head)?.[1];
      const cwd = meta ? JSON.parse(`"${meta[1]}"`) : null;
      if (!id || !(cwd === repo || ids?.has(id))) continue;
      out.push({ agent: "codex", id, path, at: statSync(path).mtimeMs, cwd, bound: cwd !== repo && Boolean(ids?.has(id)) });
    }
  }
  return out;
}
function safeDir(p) { try { return readdirSync(p); } catch { return []; } }

function codexTitles() {
  const names = new Map();
  try {
    for (const o of lines(readFileSync(join(home, ".codex", "session_index.jsonl"), "utf8"))) if (o.id && o.thread_name) names.set(o.id, o.thread_name);
  } catch { /* no index */ }
  return names;
}

function codexTitle(c, names) {
  if (names.has(c.id)) return clip(names.get(c.id));
  for (const o of lines(slice(c.path, CHUNK, false))) {
    const p = o.payload;
    if (o.type === "event_msg" && p?.type === "user_message" && typed(p.message)) return clip(typed(p.message));
  }
  return null;
}

// Claude Code sessions with a live process (~/.claude/sessions/<pid>.json) → where they run ("cli",
// "claude-desktop"), so a click can focus the agent instead of resuming a second copy.
function liveClaude() {
  const dir = join(home, ".claude", "sessions"), ids = new Map();
  for (const f of safeDir(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const o = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (!o.sessionId || !o.pid) continue;
      process.kill(o.pid, 0);
      ids.set(o.sessionId, o.entrypoint ?? "cli");
    } catch { /* gone */ }
  }
  return ids;
}
const live = liveClaude();

const binds = bindings();
const boundIds = new Set(binds.filter((b) => b.branch === branch).map((b) => b.sessionId));
const excluded = new Set(binds.filter((b) => excludeBranches.has(b.branch)).map((b) => b.sessionId));
const boundClaude = [...boundIds].map((id) => claudeById(id)).filter(Boolean);

// Codex writes several rollout files for one session (one per resume): keep the newest.
const seen = new Set();
const all = [...claude(), ...boundClaude, ...codex(boundIds)].sort((a, b) => b.at - a.at)
  .filter((c) => !excluded.has(c.id))
  .filter((c) => { const k = `${c.agent}:${c.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
const names = codexTitles();
const items = [];
for (const c of all) {
  if (items.length >= limit) break;
  let title = null;
  try { title = c.agent === "claude" ? claudeTitle(c) : codexTitle(c, names); } catch { /* unreadable */ }
  if (title) items.push({ agent: c.agent, id: c.id, title, at: new Date(c.at).toISOString(), cwd: c.cwd && existsSync(c.cwd) ? c.cwd : repo,   // a removed worktree: resume from this folder
    live: live.has(c.id), liveIn: live.get(c.id) ?? null, bound: Boolean(c.bound) });
}
process.stdout.write(JSON.stringify({ total: all.length, items }));
