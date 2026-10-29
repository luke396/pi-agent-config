import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const extension = fileURLToPath(new URL("../extensions/config-update-notice.ts", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi config notice '"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(root, "no-global-config"),
    GIT_AUTHOR_NAME: "Config test", GIT_AUTHOR_EMAIL: "config@example.invalid",
    GIT_COMMITTER_NAME: "Config test", GIT_COMMITTER_EMAIL: "config@example.invalid",
    PI_OFFLINE: "0", PI_SUBAGENT_DEPTH: "0",
  });
  const git = (cwd, ...args) => execFileSync("git", args, {
    cwd, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const remote = path.join(root, "remote.git");
  const agent = path.join(root, "agent");
  const other = path.join(root, "other machine");
  git(root, "init", "--bare", "-b", "main", remote);
  git(root, "clone", remote, agent);
  mkdirSync(path.join(agent, "extensions"));
  copyFileSync(extension, path.join(agent, "extensions/config-update-notice.ts"));
  writeFileSync(path.join(agent, "settings.json"), '{"theme":"dark"}\n');
  const commit = (dir, name) => {
    git(dir, "add", ".");
    git(dir, "commit", "-m", name);
    return git(dir, "rev-parse", "HEAD");
  };
  commit(agent, "Initial config");
  git(agent, "push", "-u", "origin", "main");
  git(root, "clone", remote, other);

  const advance = () => {
    writeFileSync(path.join(other, "settings.json"), '{"theme":"light"}\n');
    const tip = commit(other, "Update shared config");
    git(other, "push");
    return tip;
  };
  const snapshot = () => ({
    head: git(agent, "rev-parse", "HEAD"),
    refs: git(agent, "show-ref"),
    status: git(agent, "status", "--porcelain"),
    staged: git(agent, "diff", "--cached"),
    worktree: git(agent, "diff"),
    objects: git(agent, "count-objects", "-v"),
    fetchHead: existsSync(path.join(agent, ".git/FETCH_HEAD"))
      ? readFileSync(path.join(agent, ".git/FETCH_HEAD"), "utf8") : null,
  });
  const check = ({ dir = agent, mode = "tui", extraEnv = {}, slow = false, shutdown = false } = {}) => {
    const trace = path.join(root, "trace");
    rmSync(trace, { force: true });
    const runEnv = { ...env, GIT_TRACE: trace, ...extraEnv };
    const sshPidFile = path.join(root, "ssh.pid");
    if (slow) {
      // Real Git launches a transport child: cancellation must stop both.
      const bin = path.join(root, "bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(path.join(bin, "ssh"),
        '#!/bin/sh\nprintf "%s" "$$" > "$NOTICE_SSH_PID"\nexec sleep 30\n', { mode: 0o755 });
      runEnv.PATH = bin + path.delimiter + env.PATH;
      runEnv.NOTICE_SSH_PID = sshPidFile;
      runEnv.GIT_SSH_VARIANT = "ssh";
      git(agent, "remote", "set-url", "origin", "ssh://example.invalid/config.git");
    }
    let output;
    let helperRunning = false;
    try {
      output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import factory from ${JSON.stringify(pathToFileURL(path.join(dir, "extensions/config-update-notice.ts")).href)};
      import { existsSync } from "node:fs";
      const hooks = new Map();
      const result = { notices: [] };
      factory({ on: (name, handler) => hooks.set(name, handler) });
      const ctx = {
        mode: ${JSON.stringify(mode)}, cwd: ${JSON.stringify(other)},
        hasUI: ${JSON.stringify(mode === "tui" || mode === "rpc")},
        ui: { notify: (message, type) => result.notices.push({ message, type }) },
      };
      const started = hooks.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
      result.nonBlocking = started === undefined;
      ${shutdown ? `
        const deadline = Date.now() + 4000;
        while (!existsSync(process.env.NOTICE_SSH_PID)) {
          if (Date.now() > deadline) throw new Error("SSH transport did not start");
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        hooks.get("session_shutdown")({}, ctx);
      ` : ""}
      process.once("beforeExit", () => console.log(JSON.stringify(result)));
    `], { cwd: other, env: runEnv, encoding: "utf8", timeout: 12000 });
    } finally {
      if (slow && existsSync(sshPidFile)) {
        const pid = Number(readFileSync(sshPidFile, "utf8"));
        // Linux: a killed child waiting to be reaped is no longer running.
        try {
          helperRunning = !readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].startsWith("Z ");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        // Also clean up when exercising a broken implementation.
        if (helperRunning) process.kill(pid, "SIGKILL");
      }
    }
    return {
      ...JSON.parse(output), helperRunning,
      trace: existsSync(trace) ? readFileSync(trace, "utf8") : "",
    };
  };
  return { root, agent, other, remote, git, commit, advance, snapshot, check };
}

test("notifies about an unfetched upstream update without changing config, Git refs or staged work", t => {
  const f = fixture(t);
  const tip = f.advance();
  writeFileSync(path.join(f.agent, "settings.json"), '{"theme":"local"}\n');
  writeFileSync(path.join(f.agent, "staged.txt"), "keep staged\n");
  f.git(f.agent, "add", "staged.txt");
  writeFileSync(path.join(f.agent, "untracked.txt"), "keep untracked\n");
  const before = f.snapshot();
  const result = f.check();
  assert.equal(result.nonBlocking, true);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0].type, "info");
  assert.match(result.notices[0].message, /pi-agent-config: remote updates available/);
  assert.ok(result.notices[0].message.includes("origin/main @ " + tip.slice(0, 7)));
  assert.ok(result.notices[0].message.includes("'" + f.agent.replaceAll("'", "'\\''") + "'"));
  assert.match(result.notices[0].message, /pull --ff-only/);
  assert.match(result.notices[0].message, /\/reload/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(readFileSync(path.join(f.agent, "untracked.txt"), "utf8"), "keep untracked\n");
});

test("stays quiet when current or when only local commits are ahead", t => {
  const f = fixture(t);
  assert.deepEqual(f.check().notices, []);
  writeFileSync(path.join(f.agent, "local.txt"), "local only\n");
  f.commit(f.agent, "Local change");
  assert.deepEqual(f.check().notices, []);
});

for (const fetched of [false, true]) {
  test(`detects divergent updates with the remote object ${fetched ? "present" : "absent"} locally`, t => {
    const f = fixture(t);
    f.advance();
    writeFileSync(path.join(f.agent, "local.txt"), "local only\n");
    f.commit(f.agent, "Local change");
    if (fetched) f.git(f.agent, "fetch", "origin");
    const before = f.snapshot();
    const result = f.check();
    assert.equal(result.notices.length, 1);
    assert.match(result.notices[0].message, /manual reconciliation/);
    assert.deepEqual(f.snapshot(), before);
  });
}

test("uses the configured upstream remote and branch", t => {
  const f = fixture(t);
  f.git(f.agent, "remote", "rename", "origin", "config");
  f.git(f.other, "checkout", "-b", "shared");
  writeFileSync(path.join(f.other, "shared.txt"), "shared branch\n");
  const tip = f.commit(f.other, "Update shared branch");
  f.git(f.other, "push", "-u", "origin", "shared");
  f.git(f.agent, "config", "branch.main.merge", "refs/heads/shared");
  const result = f.check();
  assert.equal(result.notices.length, 1);
  assert.ok(result.notices[0].message.includes("config/shared @ " + tip.slice(0, 7)));
});

test("does not mistake a parent Git repo for the config checkout", t => {
  const f = fixture(t);
  f.advance();
  const dir = path.join(f.agent, "nested-config");
  mkdirSync(path.join(dir, "extensions"), { recursive: true });
  copyFileSync(extension, path.join(dir, "extensions/config-update-notice.ts"));
  const result = f.check({ dir });
  assert.deepEqual(result.notices, []);
  assert.equal(result.trace, "");
});

test("skips branches without an upstream and detached checkouts", t => {
  const f = fixture(t);
  f.advance();
  f.git(f.agent, "branch", "--unset-upstream");
  const untracked = f.check();
  assert.deepEqual(untracked.notices, []);
  assert.doesNotMatch(untracked.trace, /ls-remote/);
  f.git(f.agent, "checkout", "--detach");
  const detached = f.check();
  assert.deepEqual(detached.notices, []);
  assert.doesNotMatch(detached.trace, /ls-remote/);
});

test("skips non-TUI sessions, offline mode and subagents without running Git", t => {
  const f = fixture(t);
  f.advance();
  for (const options of [
    { mode: "print" }, { mode: "json" }, { mode: "rpc" },
    { extraEnv: { PI_OFFLINE: "1" } },
    { extraEnv: { PI_SUBAGENT_DEPTH: "1" } },
  ]) {
    const result = f.check(options);
    assert.deepEqual(result.notices, []);
    assert.equal(result.trace, "");
  }
});

test("unavailable remotes and missing remote branches stay quiet", t => {
  const f = fixture(t);
  f.git(f.agent, "config", "branch.main.merge", "refs/heads/missing");
  assert.deepEqual(f.check().notices, []);
  f.git(f.agent, "config", "branch.main.merge", "refs/heads/main");
  f.git(f.agent, "remote", "set-url", "origin", path.join(f.root, "missing.git"));
  assert.deepEqual(f.check().notices, []);
});

test("shutdown cancels pending work without a late notification", t => {
  const f = fixture(t);
  const start = Date.now();
  const result = f.check({ slow: true, shutdown: true });
  assert.equal(result.nonBlocking, true);
  assert.deepEqual(result.notices, []);
  assert.ok(Date.now() - start < 3000, "shutdown must cancel the pending Git check");
  assert.equal(result.helperRunning, false, "shutdown must also stop the SSH transport");
});

test("a hung Git command times out without blocking startup or notifying", t => {
  const f = fixture(t);
  const start = Date.now();
  const result = f.check({ slow: true });
  assert.equal(result.nonBlocking, true);
  assert.deepEqual(result.notices, []);
  assert.ok(Date.now() - start < 9000, "the background check must have a bounded lifetime");
  assert.equal(result.helperRunning, false, "timeout must also stop the SSH transport");
});
