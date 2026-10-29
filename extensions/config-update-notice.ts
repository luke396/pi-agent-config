import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// This extension belongs to the config checkout, not the current project.
const repo = fileURLToPath(new URL("../", import.meta.url));

async function updateNotice(signal: AbortSignal): Promise<string | undefined> {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
  };
  const git = (args: string[]) => new Promise<string>((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn("git", args, {
      cwd: repo, env, detached: true, stdio: ["ignore", "pipe", "ignore"],
    });
    // A separate POSIX process group includes Git's SSH/HTTPS transport helpers.
    // Killing only Git leaves those helpers running after cancellation.
    const stop = () => {
      try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch {}
    };
    signal.addEventListener("abort", stop, { once: true });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.once("error", reject);
    child.once("close", code => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0) reject(Object.assign(new Error("Git check failed"), { code }));
      else resolve(stdout.trim());
    });
  });

  const branch = await git(["symbolic-ref", "--quiet", "HEAD"]);
  const [remote, ref] = (await git([
    "for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", branch,
  ])).split("\0");
  if (!remote || remote === "." || !ref) return;

  // Read the advertised tip without fetching objects or changing tracking refs.
  const advertised = await git(["ls-remote", remote, ref]);
  const tip = advertised.split("\n").map(line => line.split("\t"))
    .find(([, name]) => name === ref)?.[0];
  if (!tip) return;

  try {
    await git(["merge-base", "--is-ancestor", tip, "HEAD"]);
    return; // Already incorporated, including local-only commits ahead of upstream.
  } catch (error) {
    // 1: divergent/behind; 128: the advertised commit is not available locally.
    // Other errors (including abort/timeout) do not establish an update.
    if (![1, 128].includes((error as { code: number }).code)) throw error;
  }

  const quotedRepo = "'" + path.resolve(repo).replaceAll("'", "'\\''") + "'";
  return [
    `pi-agent-config: remote updates available (${remote}/${ref.replace(/^refs\/heads\//, "")} @ ${tip.slice(0, 7)}).`,
    `Review local changes, then: git -C ${quotedRepo} pull --ff-only`,
    "After syncing, run /reload or restart Pi. Diverged branches need manual reconciliation.",
  ].join("\n");
}

export default function configUpdateNotice(pi: ExtensionAPI) {
  const child = Number(process.env.PI_SUBAGENT_DEPTH ?? "0") > 0;
  let pending: AbortController | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || child || process.env.PI_OFFLINE === "1" ||
        !existsSync(path.join(repo, ".git"))) return;

    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    // Do not hold up session startup on network I/O.
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    void updateNotice(signal).then(message => {
      if (message && !signal.aborted) ctx.ui.notify(message, "info");
    }).catch(() => {
      // Best-effort notice: offline/unavailable remotes must not disrupt startup.
    });
  });

  pi.on("session_shutdown", () => pending?.abort());
}
