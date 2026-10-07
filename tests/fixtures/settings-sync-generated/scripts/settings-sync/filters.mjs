// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Diogo Dias
// Locally maintained copy from pi-config-sync, commit 81d821bbb6a92df2b52c342fe2e1ff51c560bb66.
// See README.md and LICENSE. Filtering and sidecar behavior are unchanged.
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MACHINE_LOCAL = ["lastChangelogVersion"];
function stateDir(dir) { return path.join(dir, ".git-sync"); }
export function machineKeys(config) { return config.machineLocalSettings ?? DEFAULT_MACHINE_LOCAL; }

export function filterSource(keys) { return `import fs from "node:fs";
const keys=${JSON.stringify(keys)};
const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); const raw=Buffer.concat(chunks);
try { const value=JSON.parse(raw.toString("utf8")); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not object"); if (process.argv[2] === "clean") { for (const key of keys) delete value[key]; process.stdout.write(JSON.stringify(value, null, 2)+"\\n"); } else if (process.argv[2] === "smudge") { const sidecar=JSON.parse(fs.readFileSync(new URL("settings.machine.json", import.meta.url), "utf8")); if (!sidecar || Array.isArray(sidecar) || typeof sidecar !== "object") throw new Error("bad sidecar"); process.stdout.write(JSON.stringify({...value, ...sidecar}, null, 2)+"\\n"); } else process.stdout.write(raw); } catch { process.stdout.write(raw); }
`; }

export async function refreshMachineSidecar(dir, config = {}) { try { const settings = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8")); if (!settings || Array.isArray(settings) || typeof settings !== "object") return; const sidecar = Object.fromEntries(machineKeys(config).filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]])); const output = JSON.stringify(sidecar, null, 2)+"\n", file = path.join(stateDir(dir), "settings.machine.json"); await fs.mkdir(stateDir(dir), { recursive: true }); try { if (await fs.readFile(file, "utf8") === output) return; } catch {} await fs.writeFile(file, output); } catch {} }
