# Verifying a config change

The rule: a config change is not done when the file looks right, it is done when
the effect has been observed. These are the recipes that actually worked here,
including the traps in each.

Every recipe uses `--no-session` so no transcript is left behind, and a timeout
so a stuck startup cannot hang the session.

## RPC smoke test

Cheapest end-to-end check: start pi, ask it for its commands, exit.

```bash
printf '{"type":"get_commands"}\n' | timeout 90 pi --mode rpc --no-session
```

Read the output for:

- **startup warnings** — a broken extension or an unfiltered slot conflict often
  only shows up here, not as a hard error;
- **registered commands** — a skill shows up as `/skill:<name>`, an extension's
  command as its own name (this is how `/open-tui` was confirmed).

## Ad-hoc hook: inspecting what pi loaded

Write a throwaway extension and load it with `-e`, then read what it wrote:

```ts
// @ts-nocheck
import { writeFileSync } from "node:fs";
export default function (pi) {
  pi.on("session_start", async (_e, ctx) => {
    const p = await ctx.getSystemPrompt();
    writeFileSync("/tmp/ctx-check.txt", String(p).includes("MARKER") ? "yes" : "no");
  });
}
```

```bash
printf '{"type":"get_commands"}\n' | timeout 90 pi --mode rpc --no-session -e /tmp/probe.ts
```

- `-e` must point at a **real file**: process substitution (`-e <(...)`) does
  not work.
- `ctx.getSystemPrompt()` answers "what is actually in context" — this is how it
  was proven that `AGENTS.md` loads while a referenced doc's body does not, and
  that a new skill's description appears.
- The declared default export must match the loader's expectation; a bare
  function or a mismatched shape fails silently at load time.

## Throwaway config dir

To test bootstrap or first-run behaviour without touching the live config:

```bash
PI_CODING_AGENT_DIR=/tmp/pi-test pi --mode rpc --no-session
```

Used to verify that a fresh clone plus `setup.sh` materializes every package
from the npm registry, produces the theme files, and yields a byte-identical
`settings.json` — with `auth.json`, `models.json` and `trust.json` correctly
absent. Any file the fresh run needs that the repo does not carry shows up here.

## Prompt and context inspection

- `ctx.getSystemPrompt()` — what the model starts with (context files, skill
  descriptions).
- `ctx.getContextUsage()` — returns `{tokens, contextWindow, percent}`. Tolerate
  a missing `percent` by falling back to `tokens / contextWindow`, since only
  `tokens` is documented.
- `ctx.sessionManager.getBranch()` — the message list, for anything that must be
  computed from history (a cache-hit rate is
  `cacheRead / (input + cacheRead)` summed over assistant messages, matching what
  powerline reported).

## Pure logic without pi

Anything that is just arithmetic or string formatting is cheaper to test as a
stub than through a real session: copy the function into a `.mjs` file, replace
`ctx` with a literal object, and run node against the interesting cases. This is
how the context/cache split was checked against the four shapes the API can
return (percent present, percent missing, contextWindow missing, tokens null).

## Config diffs

To prove a change touched exactly one key, compare the JSON before and after
rather than trusting the edit:

```bash
jq -S . open-tui.json | diff - <(git show HEAD:open-tui.json | jq -S .)
```

## Safety checks before committing

```bash
git status --short                       # only intended files
git ls-files | grep -c auth.json         # must be 0
git ls-files -s | awk '$1 != "100644"'   # non-regular files: symlinks, submodules
```

The last one caught Omarchy's symlinked skills before they entered history.
