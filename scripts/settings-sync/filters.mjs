// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Diogo Dias
// Locally maintained copy from pi-config-sync, commit 81d821bbb6a92df2b52c342fe2e1ff51c560bb66.
// See README.md and LICENSE. Filtering and sidecar behavior are unchanged.
import fs from "node:fs/promises";
import path from "node:path";

export const MACHINE_KEYS = ["deviceId", "lastChangelogVersion"];

export async function refreshMachineSidecar(dir) { try { const settings = JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8")); if (!settings || Array.isArray(settings) || typeof settings !== "object") return; const sidecar = Object.fromEntries(MACHINE_KEYS.filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]])); const output = JSON.stringify(sidecar, null, 2)+"\n", file = path.join(dir, ".git-sync", "settings.machine.json"); await fs.mkdir(path.dirname(file), { recursive: true }); try { if (await fs.readFile(file, "utf8") === output) return; } catch {} await fs.writeFile(file, output); } catch {} }
