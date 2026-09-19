# `~/.pi/agent` is a synced git repo

This file sits in pi's global config directory, which is also a git repo pushed
to `github.com/luke396/pi-agent-config`. Other machines clone it.

**After changing a tracked file here, commit and push.** The working tree is the
live config, so `git status` shows exactly what is uncommitted. Never commit
`auth.json` or `models.json`. What is per-machine, and why: `.gitignore`.
New-machine steps: the header of `setup.sh`.

Before changing pi's config here (packages, settings.json, open-tui.json,
models.json, extensions, skills, themes) → use the `pi-config` skill.
