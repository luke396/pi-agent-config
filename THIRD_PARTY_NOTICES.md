# Third-party notices

Repository-original material is licensed under [LICENSE](LICENSE). The materials
below retain their respective copyrights and license terms. This index also
covers identified third-party material retained in Git history; it does not
claim authorship of that material or relicense separately installed dependencies.

## Pi — Claude rules example

`extensions/claude-rules.ts`, including earlier versions in this repository's
history, is adapted from Pi's Claude rules example. The complete MIT notice is
now included in the file so it travels with standalone copies:

> Copyright (c) 2025 Mario Zechner

Source references checked for this review (the original import revision was not
recorded):

- [Example source](https://github.com/badlogic/pi-mono/blob/7bd01fb92485c06f92ecfff7ccf3197148bc16af/packages/coding-agent/examples/extensions/claude-rules.ts)
- [MIT license](https://github.com/badlogic/pi-mono/blob/7bd01fb92485c06f92ecfff7ccf3197148bc16af/LICENSE)

Local changes use Pi's structured prompt section interface.

## pi-config-sync — settings filtering

`extensions/settings-sync.ts` is adapted from
[diogovdias/pi-config-sync](https://github.com/diogovdias/pi-config-sync/tree/81d821bbb6a92df2b52c342fe2e1ff51c560bb66).
Its header includes the source revision and the complete MIT notice:

> Copyright (c) 2026 Diogo Dias

The historical `scripts/settings-sync/` implementation and
`tests/fixtures/settings-sync-generated/` copies carried corresponding license
files. Preserve the inline notice when copying the consolidated extension.

## HumanLayer — show-me skill

`skills/show-me/` is adapted from
[HumanLayer's show-me skill](https://github.com/humanlayer/skills/blob/bba9d13ab34f0a87f1cc33df4dd196372393ddfc/plugins/show-me/skills/show-me/SKILL.md).
Its source metadata is in `SKILL.md`, and its complete MIT notice is in
[skills/show-me/LICENSE](skills/show-me/LICENSE):

> Copyright (c) 2026 HumanLayer

Keep both files when copying the skill.

## Omarchy — historical generated theme

`themes/omarchy-system.json` was tracked in the initial commit `b59fcf5` and
removed from tracking in `667903e`. The generated file remains in Git history.
Its structure and palette match Omarchy's Pi template and Tokyo Night palette.
It is now generated per machine and ignored by this repository.

Source references checked for this review (not a claim about the exact revision
used by the original generator):

- [Pi template](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/default/themed/pi.json.tpl)
- [Tokyo Night palette](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/themes/tokyo-night/colors.toml)
- [MIT license](https://github.com/basecamp/omarchy/blob/4c1b4cb3a94447aff39af98e2fcc0490a9fb32e7/LICENSE)

The following upstream notice applies to this historical material:

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

## Referenced packages

Packages declared in `settings.json` are installed separately under ignored
`npm/` and `git/` directories. Their own licenses continue to apply. A reference
to a package or an upstream skill does not place that dependency under this
repository's license.
