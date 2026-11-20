#!/usr/bin/env node
// A slot worktree's git state, as JSON, for the slot view's Worktree section:
//   { branch, upstream, base, ahead, behind, upAhead, upBehind, dirty,
//     files: [{ st: "M"|"A"|"D"|"R"|"?"|"U", staged, path, from, add, del }],
//     commits: [{ hash, short, parents, at, author, subject, refs: [..], mine, head, base }] }
// Usage: worktree.mjs <workDir> [baseBranch]
// `ahead`/`behind` are against the base branch (the one the slot was cut from), `upAhead`/`upBehind` against
// the upstream. commits: the branch's own commits, then where it left the base, a few of the base's own, and
// the base's newer commits when it moved on: enough to draw where the slot stands.
import { execFileSync } from "node:child_process";

const [dir, baseArg] = process.argv.slice(2);
const git = (...args) => {
  try { return execFileSync("git", ["-C", dir, "-c", "core.quotepath=off", ...args], { encoding: "utf8", maxBuffer: 16 << 20, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
};
const ok = (ref) => git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`)?.trim() || null;

const out = { branch: null, upstream: null, base: null, ahead: 0, behind: 0, upAhead: 0, upBehind: 0, dirty: false, files: [], commits: [] };

// status: branch line, then one line per file ("XY path" or "XY from -> to")
const status = git("status", "--porcelain=v1", "-b", "--untracked-files=all");
if (status == null) { process.stdout.write(JSON.stringify({ error: `not a git worktree: ${dir}` })); process.exit(0); }
const lines = status.split("\n").filter(Boolean);
const head = lines[0]?.startsWith("## ") ? lines.shift().slice(3) : "";
const hm = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(head);
if (hm) {
  out.branch = hm[1].replace(/^No commits yet on /, "");
  out.upstream = hm[2] ?? null;
  out.upAhead = Number(/ahead (\d+)/.exec(hm[3] ?? "")?.[1] ?? 0);
  out.upBehind = Number(/behind (\d+)/.exec(hm[3] ?? "")?.[1] ?? 0);
}
const files = new Map();
for (const l of lines) {
  const x = l[0], y = l[1];
  let path = l.slice(3), from = null;
  if (path.includes(" -> ")) [from, path] = path.split(" -> ");
  const st = x === "?" ? "?" : x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D") ? "U"
    : [x, y].find((c) => c !== " " && c !== "?") ?? "M";
  files.set(path, { st, staged: x !== " " && x !== "?", path, from, add: null, del: null });
}
// line counts, staged and not, against HEAD
for (const l of (git("diff", "HEAD", "--numstat", "-M") ?? "").split("\n").filter(Boolean)) {
  const [a, d, ...rest] = l.split("\t");
  const p = rest.join("\t").replace(/^.*\{(.*) => (.*)\}.*$/, (m, _f, t) => m.replace(/\{.*\}/, t)).replace(/^.* => /, "");
  const f = files.get(p);
  if (f) { f.add = a === "-" ? null : Number(a); f.del = d === "-" ? null : Number(d); }
}
out.files = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
out.dirty = out.files.length > 0;

// the base it was cut from: the local branch, else its remote
const baseRef = baseArg ? (ok(baseArg) ? baseArg : ok(`origin/${baseArg}`) ? `origin/${baseArg}` : null) : null;
out.base = baseRef;
const headHash = ok("HEAD");
if (headHash && baseRef) {
  const [behind, ahead] = (git("rev-list", "--left-right", "--count", `${baseRef}...HEAD`) ?? "0\t0").trim().split(/\s+/).map(Number);
  out.ahead = ahead || 0; out.behind = behind || 0;
}
// Ref labels worth showing on a commit: this branch, its upstream, the base (local and remote) and tags. Other
// branches (sibling slots cut from the same commit) are only counted.
const wanted = new Set([out.branch, out.upstream, baseArg, baseArg && `origin/${baseArg}`].filter(Boolean));
function labels(deco) {
  const all = (deco ?? "").split(", ").map((r) => r.replace(/^HEAD -> /, "")).filter((r) => r && r !== "HEAD" && r !== "origin/HEAD");
  const refs = all.filter((r) => wanted.has(r) || r.startsWith("tag: ")).map((r) => r.replace(/^tag: /, "tag:"));
  return { refs, others: all.length - refs.length };
}

if (headHash) {
  const mine = new Set(baseRef ? (git("rev-list", `${baseRef}..HEAD`) ?? "").split("\n").filter(Boolean) : []);
  const baseHash = baseRef ? ok(baseRef) : null;
  const n = Math.min(40, out.ahead + Math.min(out.behind, 10) + 6);
  const refs = baseRef ? ["HEAD", baseRef] : ["HEAD"];
  const log = git("log", "--date-order", `-n${n}`, "--format=%H%x1f%P%x1f%ct%x1f%an%x1f%D%x1f%s", ...refs) ?? "";
  out.commits = log.split("\n").filter(Boolean).map((l) => {
    const [hash, parents, at, author, deco, subject] = l.split("\x1f");
    return {
      hash, short: hash.slice(0, 7), parents: parents ? parents.split(" ") : [], at: Number(at) * 1000, author, subject,
      ...labels(deco),
      mine: mine.has(hash), head: hash === headHash, base: hash === baseHash,
    };
  });
  // The branch's own commits first, then the base's: still children before parents (none of the branch's is an
  // ancestor of a base commit), and the slot's work reads at the top instead of under newer base commits.
  out.commits = [...out.commits.filter((c) => c.mine), ...out.commits.filter((c) => !c.mine)];
}
process.stdout.write(JSON.stringify(out));
