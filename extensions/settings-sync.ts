/**
 * Keep machine fields local while using ordinary Git.
 * Pi session start installs the filter and saves fields; session shutdown saves
 * them again. No sync command, watcher, or automatic pull/commit/push/stash.
 * New clones run setup.sh once (Node >=22.19). On a machine without deviceId,
 * the first ChatGPT login attempt can create it mid-session, even if cancelled:
 * exit Pi normally and reopen it before pulling configuration for the first time.
 * Arbitrary mid-session edits to these fields are not continuously captured.
 * Back up existing settings before first adoption. Runtime files live in ignored
 * .git-sync/. Missing/malformed filter inputs retain fail-open behavior.
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
// Settings paths that stay on each machine. compaction.modelOverrides is keyed
// by provider/model IDs, and providers come from the untracked models.json.
const paths = [["deviceId"], ["lastChangelogVersion"], ["compaction", "modelOverrides"]];
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
const paths = ${JSON.stringify(paths)};
const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const get = (value, path) => path.reduce((node, key) => isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined, value);
function set(value, path, leaf) {
  let node = value;
  for (const key of path.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[path.at(-1)] = leaf;
}
// Also drops parents that held only the removed field, so the tracked file
// carries no empty placeholder.
function remove(value, path) {
  const parents = [value];
  for (const key of path.slice(0, -1)) {
    const next = parents.at(-1)[key];
    if (!isObject(next)) return;
    parents.push(next);
  }
  if (!Object.hasOwn(parents.at(-1), path.at(-1))) return;
  delete parents.at(-1)[path.at(-1)];
  for (let i = parents.length - 1; i > 0 && Object.keys(parents[i]).length === 0; i--) delete parents[i - 1][path[i - 1]];
}
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks);
try {
  const value = JSON.parse(raw.toString("utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not object");
  if (process.argv[2] === "clean") {
    for (const path of paths) remove(value, path);
    process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
  } else if (process.argv[2] === "smudge") {
    const local = JSON.parse(fs.readFileSync(new URL("settings.machine.json", import.meta.url), "utf8"));
    if (!local || Array.isArray(local) || typeof local !== "object") throw new Error("bad sidecar");
    for (const path of paths) {
      const leaf = get(local, path);
      if (leaf !== undefined) set(value, path, leaf);
    }
    process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
  } else process.stdout.write(raw);
} catch { process.stdout.write(raw); }
`;

async function writeIfChanged(file: string, content: string) {
  try { if (await fs.readFile(file, "utf8") === content) return; } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

// Same path semantics as the filter program above, which must stay standalone.
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const getPath = (value: unknown, keys: string[]) =>
  keys.reduce<unknown>((node, key) => isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined, value);
function setPath(value: Json, keys: string[], leaf: unknown) {
  let node = value;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key] as Json;
  }
  node[keys.at(-1)!] = leaf;
}

async function saveMachineFields() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    if (!isObject(settings)) return;
    const local: Json = {};
    for (const keys of paths) {
      const leaf = getPath(settings, keys);
      if (leaf !== undefined) setPath(local, keys, leaf);
    }
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
      if (isObject(settings) && isObject(local)) {
        const missing = paths.filter(keys => getPath(settings, keys) === undefined && getPath(local, keys) !== undefined);
        if (missing.length) {
          for (const keys of missing) setPath(settings, keys, getPath(local, keys));
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
}

// setup.sh uses this same file for initialization. Importing the extension
// only registers handlers and never runs a Git operation.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepare(); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
