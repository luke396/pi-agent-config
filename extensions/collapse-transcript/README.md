# Local transcript folding

A small fork of [`@luan.sh/pi-collapse-transcript`](https://github.com/luan/agents/tree/main/harnesses/pi/agent/packages/pi-collapse-transcript)
**0.3.6**, retaining its MIT license in [LICENSE](LICENSE).

## Ownership

This directory owns activity grouping, workflow-source folding and image
visibility. It replaces the npm folding extension and the former
`visible-tool-images.ts` addon.

- Consecutive thinking/tool entries stay folded, with the upstream summary,
  elapsed time, step count, queue boundaries and compaction disclosure.
- Top-level `<thinking>…</thinking>` text joins the thinking fold, including
  unfinished blocks while streaming. Code examples and unfinished final tags
  stay visible. Expansion retains the original tagged text.
- Interrupted native thinking stays folded while partial answers and native
  error, abort and truncation notices remain visible outside the fold.
- Top-level `js workflow` / `javascript workflow` fences join activity as tool
  preparation, including while streaming. Surrounding prose, ordinary code and
  nested code examples remain visible; incomplete final fences and native
  error/abort/truncation notices retain their original view.
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

Pi 1.3's native image selection is isolated in
[native-tool-images.ts](native-tool-images.ts). It borrows direct `Image` children
and their preceding `Spacer` from the native `Container`; it does not inspect
private image arrays or walk into tool-detail renderers. Other shapes produce no
extra preview; the expanded native view remains available. Native instances
continue to own image settings, IDs, conversion and invalidation.

Tagged thinking and workflow source selection are isolated in
[assistant-sources.ts](assistant-sources.ts).
It splits only libtui's single-text assistant views, reusing Pi's native rendering
with the original theme and padding. Whole-message Markdown transformers run
before splitting, with native width/streaming context, error handling and
invalidation. This includes Pi's built-in Mermaid transformer; fragments never
reapply those hooks. Possible reference definitions across prose spans retain
the complete Markdown context to preserve link resolution; their workflow source
stays visible. This boundary reads Pi 1.3's private assistant presentation fields;
unrecognized shapes stay native. Display views retain their identities through
streaming, resize and invalidation. The original messages, components and
workflow execution inputs are never rewritten. Plain JavaScript fences remain
ordinary content, including pi-subagents' untagged
fallback syntax; the explicit `workflow` tag selects this folding policy.

[interrupted-thinking.ts](interrupted-thinking.ts) handles the whole native
messages that libtui deliberately leaves unprojected on error, abort or length
stops. It splits their thinking from prose and reuses Pi's native notice renderer,
preserving its tool-call suppression rule. This is display-only: stored messages,
stop reasons and provider requests remain untouched.

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
node --test tests/collapse-transcript.test.mjs
```

After a Pi/libtui upgrade, also check actual TUI history restoration, `/reload`,
image display, workflow source disclosure, mouse expansion and pi-vim.
Component-only tests do not establish extension startup ordering or terminal
protocol integration.
