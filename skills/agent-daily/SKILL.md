---
name: agent-daily
description: "Create a concise daily recap of agent-assisted work, learning and collaboration. Use for 今日 Agent 总结、昨天的 Agent 日报、总结某天的 agent 工作, or saving that recap into an existing diary."
---

# Agent daily recap

## When to Use
Summarize a requested day's agent activity. Work review is primary; include useful learning and collaboration observations without padding. Historical recall of one issue belongs to agent-history; broader workflow audits belong to history-retrospective.

## Procedure
1. Resolve the requested calendar day against the actual clock and the user's established timezone, falling back to local time. Make the date explicit; today's report is partial. Clarify an unspecified or ambiguous day rather than silently choosing a different interval.
2. Read [agent-history](../agent-history/SKILL.md) and follow its retrieval, attribution and private-temporary-file rules. Include all synced devices, projects, agent types, child, one-shot and automated sessions unless the user narrows scope; inspect installed CLI help for inclusion flags. Date filters select active sessions, not just that day's messages. Cover timezone boundaries in the candidate query, paginate results, then select messages by timestamp in the target interval. Extract conversation text before it enters context; content may embed [Thinking] blocks even when thinking_text is empty.
3. Merge related work across sessions, forks and child reports. Count a parent task and its children as one work item; distinguish human decisions from forwarded tasks. Use earlier context only to understand the day's increment. Preserve the final state within the day, including reversals and unresolved work; later messages or a subsequently renamed session must not rewrite that snapshot.
4. Write a short date line and three sections: 工作回顾, 知识沉淀, Agent 协作复盘. Give substantive work a few result-oriented bullets and routine topics one short phrase; full scope does not mean equal space per session. Work review states what advanced, the outcome and important remaining work. Learning records reusable insights without retelling the work section. Collaboration records concrete effective behavior or costly corrections worth changing next time. Include only useful observations; do not fill quotas or invent lessons. The user can ask for details.
5. Cut chronology, command transcripts, test inventories, long explanations and repeated caveats. Keep a number, condition or verification boundary when omitting it would change the conclusion. Distinguish proposal, execution and validation, especially local tests versus production results. Do not turn an unfinished investigation into a diagnosed cause. Default to no session IDs, ordinals, source tables or retrieval instructions in the report; keep directly useful document or artifact links. Follow-up questions can be researched by date and topic.
6. Return the recap in conversation unless saving is authorized by the request or an established instruction. When saving, locate the existing diary and inspect its naming and layout; resolve missing destination details privately or ask. Add or update only the Agent 日报 section at the appropriate heading level. Preserve other content and personal annotations, and update an existing same-day module rather than append a duplicate. If annotations are mixed with generated text, make targeted edits or ask before replacing them. Keep project notes as the live status source and the diary as a dated snapshot.

## Pitfalls
- Uploads and indexing are asynchronous. Report a material coverage gap briefly; an empty successful query is different from a retrieval failure. Never claim the report covers unsynced activity.
- Do not expand a daily recap into a raw archive, technical audit or productivity scorecard. Suppress administrative chatter and duplicate notices, while retaining substantive discussion and small tasks in proportion to their value.
- Reusable skill files and any examples or fixtures must be safe for a public repository: no real diary excerpts, personal identities, machine or vault paths, internal project details, credentials or real session references. Discover destination details at runtime or use private local context. Do not copy reports or raw history into the skill/config repository, even as test data.
- Writing a recap does not authorize executing its pending tasks, changing plugins or sync settings, scheduling future runs, or publishing the diary.

## Verification
1. Check the day boundary, deduplication and attribution; completed work and remaining validation must agree with evidence available by that day's end.
2. Read the recap for brevity, topic coverage and non-repetition. Verify that no source table or session metadata was added by default.
3. After a diary edit, verify the intended file, a single Agent 日报 module, preservation of unrelated text and personal additions, and valid local links.
4. Before sharing this skill, inspect the exact files and diff being published for private data; exclude runtime state and retrieved material.