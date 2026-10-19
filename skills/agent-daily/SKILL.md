---
name: agent-daily
description: "Create a concise daily recap of agent-assisted work, learning and collaboration. Use for 今日 Agent 总结、昨天的 Agent 日报、总结某天的 agent 工作, or saving that recap into an existing diary."
---

# Daily work snapshot

Read [agent-history](../agent-history/SKILL.md) and follow its retrieval,
attribution and private-data rules. This skill adds the daily selection,
editorial and diary-writing contract.

## Select the day's increment

Resolve the calendar day and timezone from the request and established context,
using the actual local clock when needed; clarify unresolved ambiguity. Make
the date explicit and label today's report as partial.

Include all synced devices, projects and session types unless the user narrows
scope, including children, one-shot and automated sessions. Paginate candidate
results. Active-session date filters do not isolate that day's messages: cover
timezone boundaries, then select by message timestamp. Content can embed
`[Thinking]` blocks even when `thinking_text` is empty; exclude those too.

Merge related work across sessions, forks and parent/child reports. Earlier
context may explain an item, but report only its change and final state within
the day, including reversals and unresolved work. Later messages or renamed
session titles must not rewrite that snapshot.

## Write for quick recall

Work review leads. Use three sections:
- **工作回顾:** what advanced, the outcome, and important remaining work.
- **知识沉淀:** reusable insights, without repeating the work review.
- **Agent 协作复盘:** concrete effective behavior or costly corrections worth
  changing next time.

Cover substantive topics in proportion to their importance: a few bullets for
major work, one short phrase for routine items. Do not force quotas or lessons;
omit empty commentary and duplicate notices. The user can ask for detail.

Cut chronology, commands, test inventories, long explanations and repeated
caveats. Keep numbers, conditions and validation limits that change the
conclusion. Default to no session IDs, ordinals, source tables or retrieval
instructions; keep directly useful document or artifact links. Research
follow-ups by date and topic.

## Save into the existing diary

When saving is authorized, discover the destination and existing naming/layout
from private local context or ask. Add or update only the **Agent 日报** section
at the appropriate heading level. Preserve unrelated text and personal
annotations, including annotations inside the section; use targeted edits or
ask when replacement would discard them. Update the same-day section rather
than append a duplicate.

Keep the diary as a dated snapshot; link live project notes when useful.
After editing, verify the intended file, one daily section, preserved personal
content and valid local links.

## Keep reusable files public-safe

Do not put real diary excerpts, personal identities, machine/vault paths,
internal project details, credentials or session references in this skill,
examples or fixtures. Resolve private details at runtime; reports and raw
history stay outside the skill/config repository. Before sharing a skill
change, inspect the exact files and diff being published.
