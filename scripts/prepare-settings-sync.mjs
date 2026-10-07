import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshMachineSidecar } from "./settings-sync/filters.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const script = path.join(repo, "scripts/settings-sync/filter.mjs");

await refreshMachineSidecar(repo);

// Same filter commands as upstream, using Node on PATH so a mise Node upgrade
// does not leave Git pointing at a removed version-specific executable.
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
for (const [name, value] of Object.entries({
  "filter.pi-config-sync.clean": `node ${quote(script)} clean`,
  "filter.pi-config-sync.smudge": `node ${quote(script)} smudge`,
  "filter.pi-config-sync.required": "false",
})) {
  execFileSync("git", ["-C", repo, "config", "--local", name, value]);
}

// Git's stat-size shortcut can report a change even when clean(input) is
// identical to the index blob. Clear only that cached stat, never stage the
// live file. Leave unmerged, skip-worktree, and assume-unchanged entries alone.
const entry = execFileSync("git", ["-C", repo, "ls-files", "-v", "--stage", "--", "settings.json"], {
  encoding: "utf8",
}).match(/^H ([0-7]+) ([0-9a-f]+) 0\tsettings\.json\n$/);
if (entry) {
  const diff = spawnSync("git", ["-C", repo, "diff", "--quiet", "--no-ext-diff", "--", "settings.json"], {
    encoding: "utf8",
  });
  if (diff.status === 0) {
    execFileSync("git", ["-C", repo, "update-index", "--cacheinfo", `${entry[1]},${entry[2]},settings.json`]);
  } else if (diff.status !== 1) {
    throw diff.error ?? new Error(diff.stderr || "Could not compare settings.json with the index");
  }
}
