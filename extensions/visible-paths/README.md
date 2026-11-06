# Visible local paths

Adds a readable path beside local Markdown links in assistant answers and thinking. Uses Pi 1.5.0’s display-only `registerMarkdownTransformer`; stored messages and link targets remain intact. Reload with `/reload`.

Paths under the session working directory are relative; paths elsewhere under the home directory use `~/`; others stay absolute. Line suffixes are retained. Complete path labels are not repeated; basename-only labels still gain their directory. Web links, images, user messages and code examples stay unchanged.

The parser supplies source offsets so edits preserve the original Markdown, including nested quotes, lists and reference links. Completed links appear during streaming; unfinished inline links wait for their closing parenthesis. No filesystem checks are performed during rendering.

Install on another machine after pulling:

```sh
npm ci --prefix ~/.pi/agent/extensions/visible-paths --ignore-scripts
```

The repository `setup.sh` also installs these dependencies. Verify with `npm test --prefix ~/.pi/agent/extensions/visible-paths`.
