# Hermes memory trial

The public config installs `pi-hermes-memory@0.9.10`, but filters its extension out.
`extensions/hermes-memory.ts` loads it only when this machine has the ignored
`hermes-memory-config.json`. It skips pi-subagents child runtimes, keeping their
delegated task prompts out of this extension's direct capture path.
Do not also enable the package extension: that bypasses the guard.

## Private storage

Memory, generated skills, recovery snapshots, and the SQLite session index are
private runtime data. They must never be committed to this public repository.
The root-anchored ignore entries cover both directories and symlinks, including
the upstream default and legacy locations.

On an opted-in machine:

- Global data: `~/.local/share/pi-hermes-memory/global/`
- Project data: `~/.local/share/pi-hermes-memory/projects/`
- `~/.pi/agent/projects-memory` is an **ignored symlink** to the project data.
  Upstream only accepts a project-root name inside the agent directory; the
  symlink keeps the actual files outside this repository.
- `~/.pi/agent/hermes-memory-config.json` is ignored and mode `0600`.
- The private data root, `global/`, and `projects/` are mode `0700`;
  their descendants are protected by those private parent directories.

The local config used for the trial is:

```json
{
  "memoryDir": "~/.local/share/pi-hermes-memory/global",
  "projectsMemoryDir": "projects-memory",
  "memoryMode": "legacy-inject",
  "reviewRecentMessages": 24,
  "flushRecentMessages": 24,
  "sessionRetentionDays": 7
}
```

`legacy-inject` makes learned user/project memories available without relying on
the model to remember to search. It also retains upstream's bounded stores and
capacity-triggered consolidation. Background review is enabled and uses the
current model; the 24-message limits bound its conversation slice, not an exact
token or cost budget.

Upstream automatically indexes local Pi transcripts; there is no separate disable
switch in this version. The seven-day retention limits that duplicate index, not
agent-history or the original Pi session files. This trial does not import the
agent-history archive. Content used by background review goes to the configured
model provider, just as ordinary agent requests do; local storage is not offline
inference.

## Use and rollback

Restart Pi or run `/reload` after configuring this machine. Inspect learned facts
with `/memory-insights`, the actual injected context with
`/memory-preview-context`, and files in the private data root. Test persistence
and corrections before relying on it for important facts.

To stop this machine's trial, rename the ignored local config out of the expected
path and restart Pi. The wrapper then registers no Hermes tools or hooks. Leave
the private data intact until you decide whether to retain or delete it. Other
machines without this local config remain opted out.
