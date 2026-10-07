/**
 * Repository-owned settings sync.
 * Pi: /settings-sync [pull|prepare] (default: pull).
 * Shell/setup: node extensions/settings-sync.ts prepare|pull (Node >=22.19).
 * Startup installs the Git filter; shutdown saves local fields. No automatic
 * pull, commit, push, or stash. Explicit sync snapshots before a fast-forward pull.
 * Before other Git rewrites, use "prepare". New clones run setup.sh once.
 * Keep existing settings backed up during first adoption. Runtime files live
 * in ignored .git-sync/. Missing/malformed filter inputs retain fail-open behavior.
 *
 * Adapted from diogovdias/pi-config-sync, commit
 * 81d821bbb6a92df2b52c342fe2e1ff51c560bb66; maintained here without a package dependency.
 *
 * MIT License
 *
 * Copyright (c) 2026 Diogo Dias
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const keys = ["deviceId", "lastChangelogVersion"];
const settingsPath = path.join(repo, "settings.json");
const statePath = path.join(repo, ".git-sync", "settings.machine.json");
const filterPath = path.join(repo, ".git-sync", "filter.mjs");
const ownRepo = () => existsSync(path.join(repo, ".git"));
const git = (args: string[]) => exec("git", args, {
  cwd: repo,
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(repo), GIT_TERMINAL_PROMPT: "0" },
});

// Git calls this standalone program even when Pi is not running.
const filter = `import fs from "node:fs";
const keys = ${JSON.stringify(keys)};
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks);
try {
  const value = JSON.parse(raw.toString("utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not object");
  if (process.argv[2] === "clean") {
    for (const key of keys) delete value[key];
    process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
  } else if (process.argv[2] === "smudge") {
    const local = JSON.parse(fs.readFileSync(new URL("settings.machine.json", import.meta.url), "utf8"));
    if (!local || Array.isArray(local) || typeof local !== "object") throw new Error("bad sidecar");
    process.stdout.write(JSON.stringify({ ...value, ...local }, null, 2) + "\\n");
  } else process.stdout.write(raw);
} catch { process.stdout.write(raw); }
`;

async function writeIfChanged(file: string, content: string) {
  try { if (await fs.readFile(file, "utf8") === content) return; } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function saveMachineFields() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    if (!settings || Array.isArray(settings) || typeof settings !== "object") return;
    const local = Object.fromEntries(keys.filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]]));
    await writeIfChanged(statePath, JSON.stringify(local, null, 2) + "\n");
  } catch {}
}

async function prepare() {
  if (!ownRepo()) throw new Error("The agent directory must have its own .git repository");

  // During this upgrade Git may remove the old tracked filter before checking
  // out settings. Recover missing local fields from its saved sidecar before
  // refreshing it. Current live values always win; normal refresh behavior stays.
  const oldFilter = await git(["config", "--get", "filter.pi-config-sync.smudge"]).then(r => r.stdout, () => "");
  if (oldFilter.includes("scripts/settings-sync/filter.mjs")) {
    try {
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      const local = JSON.parse(await fs.readFile(statePath, "utf8"));
      if (settings && local && !Array.isArray(settings) && !Array.isArray(local) &&
          typeof settings === "object" && typeof local === "object") {
        const missing = keys.filter(key => !Object.hasOwn(settings, key) && Object.hasOwn(local, key));
        if (missing.length) {
          for (const key of missing) settings[key] = local[key];
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        }
      }
    } catch {}
  }

  await saveMachineFields();
  await writeIfChanged(filterPath, filter);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  for (const [name, value] of Object.entries({
    "filter.pi-config-sync.clean": `node ${quote(filterPath)} clean`,
    "filter.pi-config-sync.smudge": `node ${quote(filterPath)} smudge`,
    "filter.pi-config-sync.required": "false",
  })) await git(["config", "--local", name, value]);

  // Reset only stale stat data for an identical index blob. Preserve staged
  // content, intent-to-add, unmerged entries and explicit index flags.
  const entry = (await git(["ls-files", "-v", "--stage", "--", "settings.json"])).stdout
    .match(/^H ([0-7]+) ([0-9a-f]+) 0\tsettings\.json\n$/);
  if (entry) {
    try { await git(["diff", "--quiet", "--no-ext-diff", "--", "settings.json"]); }
    catch (error) {
      if ((error as { code?: number }).code === 1) return;
      throw error;
    }
    await git(["update-index", "--cacheinfo", `${entry[1]},${entry[2]},settings.json`]);
  }
}

async function run(action: string) {
  if (action !== "prepare" && action !== "pull") throw new Error("Usage: settings-sync [pull|prepare]");
  await prepare();
  if (action === "prepare") return "Settings filter ready; machine fields saved.";
  const result = await git(["pull", "--ff-only"]);
  return result.stdout.trim() || "Configuration is up to date.";
}

export default function settingsSync(pi: ExtensionAPI) {
  const child = Number(process.env.PI_SUBAGENT_DEPTH ?? "0") > 0;
  pi.on("session_start", async (_event, ctx) => {
    if (child || !ownRepo()) return;
    try { await prepare(); }
    catch (error) { ctx.ui.notify(`settings-sync: ${(error as Error).message}`, "warning"); }
  });
  pi.on("session_shutdown", async () => {
    if (!child && ownRepo()) await saveMachineFields();
  });
  pi.registerCommand("settings-sync", {
    description: "Pull this configuration repo, preserving machine fields; or prepare filters only",
    handler: async (args, ctx) => {
      const action = args.trim() || "pull";
      await ctx.waitForIdle();
      try {
        const result = await run(action);
        ctx.ui.notify(result + (action === "pull" ? "\nUse /reload to load updated configuration." : ""), "info");
      } catch (error) { ctx.ui.notify(`settings-sync: ${(error as Error).message}`, "error"); }
    },
  });
}

// Same file is the setup/non-interactive entry point; importing an extension
// only registers handlers and never runs a Git operation.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await run(process.argv[2] || "prepare")); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
