# Repository-owned settings sync

This is our locally maintained implementation, not a dependency on or an
installation of the upstream package. The filtering and sidecar code was copied from [pi-config-sync v0.3.0](https://github.com/diogovdias/pi-config-sync/blob/81d821bbb6a92df2b52c342fe2e1ff51c560bb66/extensions/git-sync.ts),
MIT, copyright 2026 Diogo Dias. The license is included alongside this file.

The copied clean/smudge program is tracked directly as `filter.mjs`; it is
not generated into the machine-state directory. `MACHINE_KEYS` is the shared,
fixed policy for the filter and sidecar refresh. The filtering and sidecar
behavior, including pass-through on malformed input or a missing sidecar,
is unchanged.
No upstream automatic commit, push, extension, or ignore-policy code is loaded.

Our fixed policy keeps `deviceId` and `lastChangelogVersion` local. The adapter
(`scripts/prepare-settings-sync.mjs`) saves them in ignored
`.git-sync/settings.machine.json` and registers the tracked clean/smudge program.
It does not stage file content.
If only filtered fields changed the file size, it clears Git's stale size cache
for the same index blob; genuine shared edits and staged content are preserved.

## Use

Run `./setup.sh` once per clone with Node.js on PATH. Use `./sync.sh` for
subsequent fast-forward pulls: it refreshes the machine values **before** Git
rewrites settings. The existing post-merge hook still runs package setup.
No automatic commits, pushes, or scheduled pulls are added.

Before other Git operations that may rewrite settings (checkout, reset,
rebase, stash), run `node scripts/prepare-settings-sync.mjs` to save current
machine values. A plain `git pull` uses the last saved values; it does not
refresh the sidecar. Missing Node/filter registration retains upstream's
fail-open behavior, so every clone needs setup.

When adopting this change in an existing clone, keep a backup of its current
`settings.json`. Do not discard local settings to force the first pull through;
restore that machine's two fields from the backup before running setup.
Credentials (`auth.json`, `models.json`) are unaffected and remain untracked.
