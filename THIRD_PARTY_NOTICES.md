# Third-party notices

Original contributions use [LICENSE](LICENSE). The following material, including
historical copies, retains its upstream terms. Separately installed packages
keep their own licenses.

- **Pi:** `extensions/claude-rules.ts` derives from the
  [Claude rules example](https://github.com/badlogic/pi-mono/blob/7bd01fb92485c06f92ecfff7ccf3197148bc16af/packages/coding-agent/examples/extensions/claude-rules.ts).
  Its full MIT notice (2025 Mario Zechner) is inline so standalone copies retain
  it. The linked revision is a checked reference; the original import revision
  was not recorded.
- **pi-config-sync:** `extensions/settings-sync.ts` derives from
  [Diogo Dias's implementation](https://github.com/diogovdias/pi-config-sync/tree/81d821bbb6a92df2b52c342fe2e1ff51c560bb66)
  and retains its full MIT notice inline. Historical `scripts/settings-sync/`
  and `tests/fixtures/settings-sync-generated/` copies carried license files.
- **HumanLayer:** `skills/show-me/` adapts the
  [show-me skill](https://github.com/humanlayer/skills/blob/bba9d13ab34f0a87f1cc33df4dd196372393ddfc/plugins/show-me/skills/show-me/SKILL.md).
  Keep its source metadata and accompanying [MIT license](skills/show-me/LICENSE).

## Omarchy: historical generated theme

`themes/omarchy-system.json` was tracked in `b59fcf5` and untracked in `667903e`.
It remains in Git history. Its structure and palette match Omarchy's
[Pi template](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/default/themed/pi.json.tpl)
and [Tokyo Night palette](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/themes/tokyo-night/colors.toml).
These are checked references, not a record of the original generator revision.
The [upstream MIT notice](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/LICENSE)
applies to that historical material:

```text
Copyright (c) David Heinemeier Hansson

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
