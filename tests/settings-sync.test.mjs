import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = fileURLToPath(new URL("../", import.meta.url));
const initial = {
  theme: "dark",
  packages: ["npm:example"],
  compaction: { reserveTokens: 87200 },
  deviceId: "device-a",
  lastChangelogVersion: "1.0.4",
};

function fixture(t) {
  // Spaces and an apostrophe exercise the real Git shell-command quoting.
  const root = mkdtempSync(path.join(os.tmpdir(), "pi settings sync '"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  // Package updates are outside this boundary; never launch the live Pi.
  writeFileSync(path.join(bin, "pi"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, {
    PATH: bin + path.delimiter + process.env.PATH,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(root, "no-global-config"),
    GIT_AUTHOR_NAME: "Sync test",
    GIT_AUTHOR_EMAIL: "sync@example.invalid",
    GIT_COMMITTER_NAME: "Sync test",
    GIT_COMMITTER_EMAIL: "sync@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
  });
  const run = (cwd, command, args, input) => execFileSync(command, args, {
    cwd, env, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
  });
  const git = (cwd, ...args) => run(cwd, "git", args);
  const a = path.join(root, "machine a");
  mkdirSync(a);
  git(a, "init", "-b", "main");
  for (const file of [".gitattributes", ".gitignore", ".githooks", "setup.sh", "sync.sh", "scripts"]) {
    cpSync(path.join(source, file), path.join(a, file), { recursive: true });
  }
  const save = (dir, settings) => writeFileSync(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
  const read = dir => JSON.parse(readFileSync(path.join(dir, "settings.json"), "utf8"));
  const prepare = dir => run(dir, process.execPath, ["scripts/prepare-settings-sync.mjs"]);
  const setup = dir => run(dir, "bash", ["setup.sh"]);
  const commit = (dir, message) => {
    git(dir, "add", ".");
    git(dir, "commit", "-m", message);
  };
  save(a, initial);
  return { root, a, run, git, save, read, prepare, setup, commit };
}

function twoMachines(t) {
  const f = fixture(t);
  f.setup(f.a);
  f.commit(f.a, "Initial portable settings");
  const remote = path.join(f.root, "remote.git");
  f.git(f.root, "init", "--bare", "-b", "main", remote);
  f.git(f.a, "remote", "add", "origin", remote);
  f.git(f.a, "push", "-u", "origin", "main");
  const b = path.join(f.root, "machine b");
  f.git(f.root, "clone", remote, b);
  f.save(b, { ...f.read(b), deviceId: "device-b", lastChangelogVersion: "1.0.2" });
  f.setup(b);
  return { ...f, b };
}

test("setup preserves live and staged settings; commits contain only portable values", t => {
  const f = fixture(t);
  const before = readFileSync(path.join(f.a, "settings.json"), "utf8");
  writeFileSync(path.join(f.a, "already-staged.txt"), "keep staged\n");
  f.git(f.a, "add", "already-staged.txt");
  const staged = f.git(f.a, "diff", "--cached");
  f.setup(f.a);
  f.setup(f.a);
  assert.equal(readFileSync(path.join(f.a, "settings.json"), "utf8"), before);
  assert.equal(f.git(f.a, "diff", "--cached"), staged);

  // Never use real credentials in this fixture.
  writeFileSync(path.join(f.a, "auth.json"), '{"test":"do not sync"}');
  writeFileSync(path.join(f.a, "models.json"), '{"test":"machine only"}');
  f.commit(f.a, "Portable config");
  const blob = JSON.parse(f.git(f.a, "show", "HEAD:settings.json"));
  assert.deepEqual(blob, {
    theme: initial.theme, packages: initial.packages, compaction: initial.compaction,
  });
  const tracked = f.git(f.a, "ls-files").trim().split("\n");
  assert.ok(!tracked.some(file => file.startsWith(".git-sync/")));
  assert.ok(!tracked.includes("auth.json"));
  assert.ok(!tracked.includes("models.json"));
  assert.deepEqual(JSON.parse(readFileSync(path.join(f.a, ".git-sync/settings.machine.json"), "utf8")), {
    deviceId: initial.deviceId, lastChangelogVersion: initial.lastChangelogVersion,
  });
  f.save(f.a, { ...initial, deviceId: "new-login-id", lastChangelogVersion: "1.0.10" });
  assert.equal(f.git(f.a, "diff", "--", "settings.json"), "");
  f.prepare(f.a);
  assert.equal(f.git(f.a, "status", "--porcelain"), "");
});

test("two machines sync shared preferences while keeping freshly changed local values", t => {
  const f = twoMachines(t);
  const remoteSettings = {
    ...f.read(f.b), theme: "light", packages: ["npm:example", "git:github.com/example/skills"],
  };
  f.save(f.b, remoteSettings);
  f.commit(f.b, "Change portable preferences");
  f.git(f.b, "push");
  f.save(f.a, { ...f.read(f.a), deviceId: "device-a-new-login", lastChangelogVersion: "1.0.6" });
  f.run(f.a, "bash", ["sync.sh"]);
  assert.deepEqual(f.read(f.a), {
    ...remoteSettings, deviceId: "device-a-new-login", lastChangelogVersion: "1.0.6",
  });
  assert.equal(f.read(f.b).deviceId, "device-b");
  assert.equal(f.read(f.b).lastChangelogVersion, "1.0.2");
  assert.equal(f.git(f.a, "status", "--porcelain"), "");
  assert.equal(f.git(f.a, "rev-parse", "HEAD"), f.git(f.b, "rev-parse", "HEAD"));
  assert.doesNotMatch(f.git(f.a, "show", "HEAD:settings.json"), /deviceId|lastChangelogVersion/);
});

test("checkout restores saved machine fields and smudge prefers them to incoming fields", t => {
  const f = fixture(t);
  f.setup(f.a);
  f.commit(f.a, "Initial");
  f.save(f.a, { ...initial, theme: "temporary", deviceId: "new-device-a", lastChangelogVersion: "1.0.7" });
  f.prepare(f.a);
  f.git(f.a, "checkout", "--", "settings.json");
  assert.deepEqual(f.read(f.a), {
    ...initial, deviceId: "new-device-a", lastChangelogVersion: "1.0.7",
  });

  const incoming = JSON.stringify({ theme: "remote", deviceId: "foreign", lastChangelogVersion: "old" });
  const restored = JSON.parse(f.run(f.a, process.execPath, ["scripts/settings-sync/filter.mjs", "smudge"], incoming));
  assert.deepEqual(restored, {
    theme: "remote", deviceId: "new-device-a", lastChangelogVersion: "1.0.7",
  });
});

test("sync refuses conflicting shared edits without committing, stashing or overwriting them", t => {
  const f = twoMachines(t);
  f.save(f.b, { ...f.read(f.b), theme: "remote-change" });
  f.commit(f.b, "Remote change");
  f.git(f.b, "push");
  f.save(f.a, { ...f.read(f.a), theme: "uncommitted-local-change", lastChangelogVersion: "1.0.8" });
  const before = readFileSync(path.join(f.a, "settings.json"), "utf8");
  const head = f.git(f.a, "rev-parse", "HEAD");
  assert.throws(() => f.run(f.a, "bash", ["sync.sh"]), /local changes.*overwritten/s);
  assert.equal(readFileSync(path.join(f.a, "settings.json"), "utf8"), before);
  assert.equal(f.git(f.a, "rev-parse", "HEAD"), head);
  assert.equal(f.git(f.a, "diff", "--cached"), "");
  assert.equal(f.git(f.a, "stash", "list"), "");
});

test("preparation preserves partially staged shared settings", t => {
  const f = fixture(t);
  f.setup(f.a);
  f.commit(f.a, "Initial");
  f.save(f.a, { ...initial, theme: "staged-theme" });
  f.git(f.a, "add", "settings.json");
  f.save(f.a, { ...initial, theme: "unstaged-theme", lastChangelogVersion: "1.0.10" });
  const staged = f.git(f.a, "diff", "--cached");
  const unstaged = f.git(f.a, "diff");
  f.prepare(f.a);
  assert.equal(f.git(f.a, "diff", "--cached"), staged);
  assert.equal(f.git(f.a, "diff"), unstaged);
  assert.equal(f.read(f.a).theme, "unstaged-theme");
});

test("upstream malformed-input and missing-sidecar pass-through behavior is preserved", t => {
  const f = fixture(t);
  f.prepare(f.a);
  const raw = "{ malformed settings\n";
  for (const mode of ["clean", "smudge"]) {
    assert.equal(f.run(f.a, process.execPath, ["scripts/settings-sync/filter.mjs", mode], raw), raw);
  }
  rmSync(path.join(f.a, ".git-sync/settings.machine.json"));
  const portable = '{"theme":"light"}\n';
  assert.equal(f.run(f.a, process.execPath, ["scripts/settings-sync/filter.mjs", "smudge"], portable), portable);
});

test("equal-size fresh machine values survive a pull", t => {
  const f = twoMachines(t);
  f.save(f.b, { ...f.read(f.b), theme: "light" });
  f.commit(f.b, "Shared change");
  f.git(f.b, "push");
  f.save(f.a, { ...f.read(f.a), deviceId: "device-c", lastChangelogVersion: "1.0.9" });
  f.run(f.a, "bash", ["sync.sh"]);
  assert.equal(f.read(f.a).theme, "light");
  assert.equal(f.read(f.a).deviceId, "device-c");
  assert.equal(f.read(f.a).lastChangelogVersion, "1.0.9");
});

test("preparation preserves intent-to-add", t => {
  const f = fixture(t);
  f.prepare(f.a);
  f.git(f.a, "add", "--intent-to-add", "settings.json");
  const staged = f.git(f.a, "diff", "--cached");
  f.prepare(f.a);
  assert.equal(f.git(f.a, "diff", "--cached"), staged);
});

for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
  test("preparation preserves " + flag, t => {
    const f = fixture(t);
    f.setup(f.a);
    f.commit(f.a, "Initial");
    f.git(f.a, "update-index", flag, "settings.json");
    f.save(f.a, { ...initial, theme: "local-flagged-edit" });
    const entry = f.git(f.a, "ls-files", "-v", "--stage", "--", "settings.json");
    f.prepare(f.a);
    assert.equal(f.git(f.a, "ls-files", "-v", "--stage", "--", "settings.json"), entry);
    assert.equal(f.read(f.a).theme, "local-flagged-edit");
  });
}

test("preparation preserves unresolved merge stages and worktree text", t => {
  const f = fixture(t);
  f.setup(f.a);
  f.commit(f.a, "Initial");
  f.git(f.a, "checkout", "-b", "other");
  f.save(f.a, { ...initial, theme: "other" });
  f.commit(f.a, "Other theme");
  f.git(f.a, "checkout", "main");
  f.save(f.a, { ...initial, theme: "main" });
  f.commit(f.a, "Main theme");
  assert.throws(() => f.git(f.a, "merge", "other"));
  const entries = f.git(f.a, "ls-files", "--unmerged");
  assert.notEqual(entries, "");
  const contents = readFileSync(path.join(f.a, "settings.json"), "utf8");
  f.prepare(f.a);
  assert.equal(f.git(f.a, "ls-files", "--unmerged"), entries);
  assert.equal(readFileSync(path.join(f.a, "settings.json"), "utf8"), contents);
});

test("upgrade from generated to tracked filter preserves local values", t => {
  const f = fixture(t);
  rmSync(path.join(f.a, "scripts"), { recursive: true });
  // Frozen b9869ab scripts: this migration test needs no repository history.
  cpSync(path.join(source, "tests/fixtures/settings-sync-generated/scripts"), path.join(f.a, "scripts"), { recursive: true });
  f.setup(f.a);
  f.commit(f.a, "Old generated-filter setup");
  const remote = path.join(f.root, "remote.git");
  f.git(f.root, "init", "--bare", "-b", "main", remote);
  f.git(f.a, "remote", "add", "origin", remote);
  f.git(f.a, "push", "-u", "origin", "main");
  const b = path.join(f.root, "machine b");
  f.git(f.root, "clone", remote, b);
  rmSync(path.join(b, "scripts"), { recursive: true });
  cpSync(path.join(source, "scripts"), path.join(b, "scripts"), { recursive: true });
  f.save(b, { ...f.read(b), theme: "upgraded", deviceId: "device-b", lastChangelogVersion: "1.0.3" });
  f.setup(b);
  f.commit(b, "Use tracked filter program");
  f.git(b, "push");
  f.save(f.a, { ...f.read(f.a), deviceId: "device-a-new-login", lastChangelogVersion: "1.0.10" });
  f.run(f.a, "bash", ["sync.sh"]);
  assert.equal(f.read(f.a).theme, "upgraded");
  assert.equal(f.read(f.a).deviceId, "device-a-new-login");
  assert.equal(f.read(f.a).lastChangelogVersion, "1.0.10");
  assert.match(f.git(f.a, "config", "--get", "filter.pi-config-sync.smudge"), /scripts.settings-sync.filter.mjs/);
  assert.equal(f.git(f.a, "status", "--porcelain"), "");
});
