# Local transcript folding

A small fork of [`@luan.sh/pi-collapse-transcript`](https://github.com/luan/agents/tree/main/harnesses/pi/agent/packages/pi-collapse-transcript)
**0.3.6**, retaining its MIT license in [LICENSE](LICENSE).

## Ownership

This directory owns activity grouping and image visibility. It replaces the npm
folding extension and the former `visible-tool-images.ts` addon.

- Consecutive thinking/tool entries stay folded, with the upstream summary,
  elapsed time, step count, queue boundaries and compaction disclosure.
- Native tool images appear below the folded row. Clicking an image does not
  open the fold.
- Expansion uses the original tool views, with one copy of each image.
- Regular scrollback, model-visible messages and tool results are unchanged.

The group creates its image view once, alongside its existing activity view.
It queries libtui's public fold capability and renders the existing native
Image/spacer instances. There is no `setChildren` monkeypatch, separate image
widget, late-install retry, or second map of group identities.

## Dependency and compatibility

`settings.json` installs **`@luan.sh/pi-libtui@0.3.15`**, with its extension enabled
and themes filtered out. The pin deliberately retains the library version bundled
with the fork's baseline; the installed standalone and bundled `src/` trees were
identical when migrated. The library still owns its native transcript/history
bridge, mouse/scrolling services and codemode presentation.

Imports use paths relative to this repo's Pi-managed `npm/node_modules/` tree.
Pi does not resolve bare third-party imports from local extensions through that
managed directory. Copy this directory with the package declaration; no local
`node_modules`, symlink, custom loader or separate install script is required.
Normal online Pi startup installs missing declared packages; `pi update --extensions`
reconciles them explicitly.

Pi 1.3's private `imageComponents` / `imageSpacers` access is isolated in
[native-tool-images.ts](native-tool-images.ts). Unknown shapes produce no extra
preview; the expanded native view remains available. Native instances continue
to own image settings, IDs, conversion and invalidation.

## Baseline and maintenance

Copied upstream `src/activity-transcript.ts`, `activity-timing.ts` and
`compaction-section.ts`; upstream `src/extension.ts` is our `index.ts`.
The npm tarball integrity for 0.3.6 is:

```text
sha512-eeyRsMZ2McnDj7rmUGaNPiTv8UUOivjaGKcreDZZwFI+x5s0BlgXoCPC0vwI5NaDJVIdDj+lVcXZlLGZVvJPZA==
```

Keep changes against that baseline easy to inspect. Selectively port upstream
fixes rather than replacing this directory during package updates. The original
tests are adapted under `tests/fixtures/collapse-*.ts` to run with Node assertions
inside the installed Pi, including standalone distributions.

From the agent repository:

```sh
node --test tests/collapse-transcript.test.mjs tests/visible-tool-images.test.mjs
```

After a Pi/libtui upgrade, also check actual TUI history restoration, `/reload`,
image display, mouse expansion and pi-vim. Component-only tests do not establish
extension startup ordering or terminal protocol integration.
