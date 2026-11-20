// From herdr-git-graph (https://github.com/rabeeh-ta/herdr-git-graph, lanes.js), unchanged.
// MIT License, Copyright (c) 2026 Rabeeh T A:
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions
// of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
// CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// Lays commits out on lanes. Commits come newest first, every child before its
// parents (git log --date-order). A lane is a column waiting for one commit and
// keeps its column until that commit arrives, so lines bend only where
// branches fork or merge. A commit marked `dashed` (uncommitted changes) draws
// its line to its parent dashed.
//
// Each row gets the commit's lane and its segments [fromLane, fromY, toLane,
// toY, colorLane, dashed], with y 0 = top of the row, 0.5 = the dot, 1 = bottom.
export function layoutLanes(commits) {
  const lanes = [], dashed = []; // lanes[i]: the hash that column waits for, or null
  const free = () => { const i = lanes.indexOf(null); return i < 0 ? lanes.length : i; };
  let width = 1;
  const rows = commits.map((commit) => {
    const before = lanes.slice(), wasDashed = dashed.slice(), segments = [];
    let lane = before.indexOf(commit.hash);
    if (lane < 0) { lane = free(); lanes[lane] = commit.hash; dashed[lane] = false; } // a branch tip: nothing above it
    before.forEach((hash, j) => {
      if (hash === null || hash === undefined) return;
      if (hash === commit.hash) {
        segments.push([j, 0, lane, 0.5, j, Boolean(wasDashed[j])]);
        if (j !== lane) { lanes[j] = null; dashed[j] = false; } // branches that end here
      } else segments.push([j, 0, j, 1, j, Boolean(wasDashed[j])]);
    });
    const [first, ...rest] = commit.parents;
    lanes[lane] = first ?? null;
    dashed[lane] = Boolean(first && commit.dashed);
    if (first) segments.push([lane, 0.5, lane, 1, lane, dashed[lane]]);
    for (const parent of rest) {
      let k = lanes.indexOf(parent);
      if (k < 0) { k = free(); lanes[k] = parent; dashed[k] = Boolean(commit.dashed); }
      segments.push([lane, 0.5, k, 1, k, dashed[k]]);
    }
    width = Math.max(width, before.length, lanes.length);
    while (lanes.length && lanes[lanes.length - 1] === null) { lanes.pop(); dashed.length = lanes.length; }
    return { lane, segments };
  });
  return { rows, width };
}
