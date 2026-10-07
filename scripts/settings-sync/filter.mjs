// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Diogo Dias; locally maintained. See LICENSE.
import fs from "node:fs";
import { MACHINE_KEYS as keys } from "./filters.mjs";
const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); const raw=Buffer.concat(chunks);
try { const value=JSON.parse(raw.toString("utf8")); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not object"); if (process.argv[2] === "clean") { for (const key of keys) delete value[key]; process.stdout.write(JSON.stringify(value, null, 2)+"\n"); } else if (process.argv[2] === "smudge") { const sidecar=JSON.parse(fs.readFileSync(new URL("../../.git-sync/settings.machine.json", import.meta.url), "utf8")); if (!sidecar || Array.isArray(sidecar) || typeof sidecar !== "object") throw new Error("bad sidecar"); process.stdout.write(JSON.stringify({...value, ...sidecar}, null, 2)+"\n"); } else process.stdout.write(raw); } catch { process.stdout.write(raw); }
