// Extra HAR facts the CLI status does not carry, for the herdr panels.
//   node collect.mjs <harnessRoot> '<json: [{id, workDir, branch, baseBranch}]>'
// Prints { workUnits, git: { [slotId]: {...} } }. Never throws: missing pieces are null.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const [root, slotsJson = "[]"] = process.argv.slice(2);
const slots = JSON.parse(slotsJson);
const readDir = (d) => { try { return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(d, f), "utf8"))); } catch { return []; } };
const git = (cwd, ...a) => { try { return execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); } catch { return null; } };

const units = readDir(join(root, ".har/work-units"));
const attempts = readDir(join(root, ".har/work-attempts"));
const workUnits = units.map((u) => {
  const mine = attempts.filter((a) => a.workUnitId === u.workUnitId).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return {
    id: u.workUnitId, title: u.title ?? null, source: u.source ?? u.workSource ?? null, url: u.url ?? u.workUrl ?? null,
    createdAt: u.createdAt ?? null, attempts: mine.map((a) => ({ id: a.attemptId, slot: a.agentId, branch: a.branch, workDir: a.workDir, at: a.createdAt })),
    lastAt: mine[0]?.createdAt ?? u.updatedAt ?? u.createdAt ?? null,
  };
}).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

const out = {};
for (const s of slots) {
  const wd = s.workDir;
  if (!wd || !existsSync(wd)) { out[s.id] = null; continue; }
  const base = s.baseBranch || "main";
  const head = git(wd, "rev-parse", "HEAD");
  const unpushed = Number(git(wd, "rev-list", "--count", "HEAD", "--not", "--remotes") ?? NaN);
  const upstreamBase = git(wd, "rev-parse", "--verify", "--quiet", `origin/${base}`) ? `origin/${base}` : base;
  const merged = head ? git(wd, "merge-base", "--is-ancestor", "HEAD", upstreamBase) !== null : null;
  // Remote branches carrying this slot's own commits. When HEAD is already on the base branch, every
  // branch that merged base contains it too — those say nothing about this slot.
  const remotes = merged ? [] : (git(wd, "branch", "-r", "--contains", "HEAD", "--format=%(refname:short)") ?? "").split("\n")
    .filter(Boolean).filter((r) => r.includes("/") && !/\/HEAD$/.test(r) && r !== upstreamBase);
  const changed = (git(wd, "status", "--porcelain") ?? "").split("\n").filter(Boolean).length;
  const subject = git(wd, "log", "-1", "--format=%s");
  out[s.id] = { head, unpushed: Number.isNaN(unpushed) ? null : unpushed, remotes, merged, changed, subject };
}
process.stdout.write(JSON.stringify({ workUnits, git: out }));
