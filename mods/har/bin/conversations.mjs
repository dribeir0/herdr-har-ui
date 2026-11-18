#!/usr/bin/env node
// Claude Code and Codex conversations started in a repo's own folder, newest first, as JSON:
//   { total, items: [{ agent: "claude" | "codex", id, title, at }] }
// Usage: conversations.mjs <repo> [limit=50]
// Only the repo folder itself counts. Slots run in their own worktrees (other folders), so their conversations
// never show here. Transcripts can be tens of MB: only their first and last 256 KB are read.
import { openSync, readSync, closeSync, statSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [repo, limitArg] = process.argv.slice(2);
const limit = Number(limitArg) || 50;
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
    return { agent: "claude", id: f.slice(0, -6), path, at: statSync(path).mtimeMs };
  });
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

function codex() {
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
      const meta = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(slice(path, 8192, false));
      if (!meta || JSON.parse(`"${meta[1]}"`) !== repo) continue;
      const id = /"id":"([0-9a-f-]{36})"/.exec(slice(path, 8192, false))?.[1];
      if (id) out.push({ agent: "codex", id, path, at: statSync(path).mtimeMs });
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

// Codex writes several rollout files for one session (one per resume): keep the newest.
const seen = new Set();
const all = [...claude(), ...codex()].sort((a, b) => b.at - a.at)
  .filter((c) => { const k = `${c.agent}:${c.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
const names = codexTitles();
const items = [];
for (const c of all) {
  if (items.length >= limit) break;
  let title = null;
  try { title = c.agent === "claude" ? claudeTitle(c) : codexTitle(c, names); } catch { /* unreadable */ }
  if (title) items.push({ agent: c.agent, id: c.id, title, at: new Date(c.at).toISOString() });
}
process.stdout.write(JSON.stringify({ total: all.length, items }));
