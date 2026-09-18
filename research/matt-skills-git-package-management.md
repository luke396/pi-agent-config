# Matt skills 用 Pi Git package 管理：研究结论

## 结论

**这是 Pi 官方支持、适合“上游托管更新”的管理方式，但不是 Matt 上游推荐的 Pi 专用安装方案，也不能称为普遍最佳实践。** 不建议直接执行裸命令 `pi install git:github.com/mattpocock/skills`：它默认全局注册、默认递归发现所有 skills，而本次目标是“全局零个 Matt skill、仅 sglang 启用三个”。应先审查、固定 commit、配置白名单，再另行授权迁移。[P1][U1][U2]

本次仅研究；未安装、更新、迁移、修改设置、处理 symlink 或操作暂存区。全局四个 npm 包及 25 条旧路径排除、项目三个显式旧路径均已只读核实；本地副本与上游字节相同是任务提供的既有结论，本次未重做全部哈希比较。

## 关键证据

### 1. 能加载，但“整个 Git 仓库”不等于上游正式技能集合

GitHub `main` 和递归 tree 当前均为 `3cca18b368ae95cdbdebbff572ccafa662551015`。`package.json` 没有 `pi` manifest；因此 Pi 使用约定目录 `skills/`，支持分组目录递归发现，不要求上游专门打包成 Pi package。[P1][S1]

实际 tree 有 **37 个 SKILL.md**：engineering 18、productivity 7、in-progress 8、misc 4；Claude plugin manifest 仅列出前两组 **25 个**。Pi 不读取 `.claude-plugin/plugin.json` 来限定这 25 个，因此裸安装还会发现草稿及 Claude 专用技能。上游 ADR 明确说明只有 engineering/productivity 属于正式发布范围。[U2][U3]

上游 README 推荐：Claude Code 用原生插件；Codex/其他 agent 用 `npx skills@latest add mattpocock/skills`，需要更新 editable copies 时用 `npx skills update`。**没有推荐 `pi install`**。这不否定 Pi 原生 Git 包的适用性，只是应区分“Pi 支持”与“Matt 背书”。不要同时使用两套安装器加载同一技能。[U1]

### 2. 全局禁用与项目 delta 可以组合；禁用不等于不安装

- 包对象的 `skills: []` 表示不启用该包的 skills；省略该键则启用默认集合。不是停止克隆或停止更新。[P1][S1]
- 同一 Git 仓库的身份不含 ref；普通项目条目会覆盖全局条目。项目 `autoload: false` 则保留全局基础项，并只对明确匹配的资源施加 delta。[P1][S1]
- 有全局基础项时，项目 delta **从全局 clone 发现资源**，不是依赖显式旧副本。项目先插入三个 enabled=true 记录，全局随后把其他资源记为 false；相同路径首条保留。[S1]
- `autoload:false` 不是安全沙箱，也不是“禁止下载”。它控制资源选择；全局 clone 缺失时仍可能安装。项目设置/资源只有在项目获信任后生效。[P3][S1]

### 3. 两类旧路径必须分开处理

**旧的全局负路径不是包级排除。** `-skills/teach/SKILL.md` 针对 `~/.pi/agent/skills/teach/SKILL.md`，不会禁用新的 Git clone 中对应技能。新包必须通过 `packages[].skills` 配置。[S1]

但若旧 25 份仍在默认发现目录，**不能为了“迁移配置”直接删除这 25 条负路径**，否则旧副本会重新全局加载。安全的第一阶段是保留这 25 条，将其视为旧副本隔离规则；以后经授权将 Matt 副本完整备份/移出所有自动发现目录后，才可删掉对应规则。不要移动/修改 Omarchy 的系统 symlink。[P2][S1]

项目 `.pi/settings.json` 中三个 `~/.pi/agent/skills/.../SKILL.md` 必须删去并改为包 delta；否则仍读取不会随 Git 包更新的旧副本，而且显式项目路径可先于全局自动发现排除生效。[S1]

仓库 `.agents/skills/teach/SKILL.md` 保留磁盘原样，用 **绝对精确排除**：

```json
"skills": ["-/home/luke/Work/sglang/.agents/skills/teach/SKILL.md"]
```

这是有效的 `-path`，但不是任意 `-project-skill` 名称开关。源码对项目 `.agents/skills` 自动发现的排除匹配基准是其 `.agents` 目录，而非 `.pi`；`-../.agents/skills/teach/SKILL.md` 不会按想象中的 `.pi` 相对路径命中。`-skills/teach/SKILL.md` 可以命中，却也可能影响其他同基准相对路径。绝对路径最精确，代价是不便跨机器共享。[S1]

同真实路径会去重；不同路径但相同 skill name 会警告并保留首先加载者。不要依赖“碰巧选中新版”解决重复。[P2][S2]

## 推荐的安全迁移配置（仅方案，未应用）

选择 **固定已核对的 commit + 全局禁用所有包资源 + 项目显式启用三个**。不需要修改上游或为它另造 Pi manifest。

### 全局 `~/.pi/agent/settings.json`

保留现有其他设置和 **25 条顶层 `skills` 负路径**。只将 `packages` 改为以下内容（即保留四包、追加一个对象）：

```json
{
  "packages": [
    "npm:pi-web-access",
    "npm:pi-powerline-footer",
    "npm:pi-codex-fast-mode",
    "npm:pi-subagents",
    {
      "source": "git:github.com/mattpocock/skills@3cca18b368ae95cdbdebbff572ccafa662551015",
      "extensions": [],
      "skills": [],
      "prompts": [],
      "themes": []
    }
  ]
}
```

三个额外的空数组防止上游将来加入 extensions/prompts/themes 时意外加载；**不能阻止安装脚本**。

### sglang `.pi/settings.json`

当前文件仅有三个旧技能路径，可在未来授权时替换为：

```json
{
  "packages": [
    {
      "source": "git:github.com/mattpocock/skills@3cca18b368ae95cdbdebbff572ccafa662551015",
      "autoload": false,
      "skills": [
        "+skills/productivity/teach/SKILL.md",
        "+skills/engineering/research/SKILL.md",
        "+skills/productivity/handoff/SKILL.md"
      ]
    }
  ],
  "skills": [
    "-/home/luke/Work/sglang/.agents/skills/teach/SKILL.md"
  ]
}
```

项目 delta 中未声明的类型不作修改，继承全局禁用状态；`+` 仅精确选择已有资源。预期全局 Matt 启用数为 0、可信 sglang 为 3，并保留其他非 Matt 技能。这不是限制所有 CLI/扩展主动注入技能的强制权限边界。

**更简单的备选**：若完全不需要“全局登记统一管理”，可仅在项目声明普通 Git package 对象，`skills` 使用三个无 `+` 的正向完整路径、其他类型 `[]`，不设 `autoload:false`。它更直接，但使用项目 clone，不实现上述全局管理方案。[P1]

## 更新是否真会生效？会，但有重要限制

1. 更新扫描的是 settings 中的 package source，不看 `skills:[]`。所以全局禁用并不会阻断 fetch/update；项目 delta 读取全局 clone，新的文件内容在后续资源重载/会话中可用。[S1]
2. **固定 commit 不会追踪 main**。包更新只对齐固定 ref；想升级必须先审查新 commit，再同步改变配置的 ref。使用固定 commit 比可移动 tag 更明确。两个配置应保持一致；delta 读取时实际以全局基础 source/ref 为准。[P1][S1]
3. 若明确选择滚动跟踪，在两处把 source 改为无 `@ref`。以后有授权时可用 `pi update --no-approve git:github.com/mattpocock/skills` 更新全局这一包；`--no-approve` 是有意忽略项目配置。**Pi 0.85.1 的裸 `pi update` 只更新 Pi 本体，不更新技能包**。[P1][P3]
4. **源码发现的陷阱**：普通 `update(source)` 分别遍历全局和项目 source，没有复用资源解析时的 delta-base 去重。因此在可信 sglang 内运行包含项目配置的包更新，可能同时更新全局与项目 scope，甚至新建一个资源加载并不使用的 `.pi/git/...` clone。`autoload:false` 不会阻止这一点。上述 `--no-approve` 可避免对该项目 delta 的额外安装/更新。[S1]
5. 无 ref 更新不是简单保证“安全 git pull”：它 fetch 跟踪分支（必要时回退 origin/HEAD），切换目标 commit 时执行 **`git reset --hard`、`git clean -fdx`**，再装依赖。不要把用户定制放在托管 clone；更新可能失败、破坏本地修改或改变行为，固定 ref 也不是事务回滚保证。[S1]

## npm 生命周期与兼容性风险

**Git package 不等于“只下载 Markdown”。** 当前上游有根 `package.json`，Pi clone 后和切换 checkout 后会执行 npm；默认参数为 `install --omit=dev`，没有 `--ignore-scripts`。配置 `npmCommand` 时则传普通 `install`，默认的 omit-dev 也不再由 Pi 添加。因此不能承诺无 npm lifecycle 执行。[S1][P3]

当前上游仅声明三个普通开发命令 `changeset`、`version`、`check-plugin-version`，没有根 preinstall/install/postinstall/prepare，只有 Changesets devDependencies；普通 scripts 并不都会在安装时自动运行。但这只是当前 manifest 的观察，不是依赖树、用户 npm 配置或未来版本的安全认证。`skills:[]` 及固定 SHA 都不会禁止 npm 执行；若希望额外禁止 npm lifecycle，应另行决定隔离环境或 npm 的 ignore-scripts 策略，不在本次擅改影响四个现有 npm 包的全局配置。[U2][S1]

格式可加载不等于功能全兼容：[P2][U4]

- `teach`：通用 Markdown 工作流；引用同目录格式文件，包克隆保留完整辅助文件更稳妥。会在当前目录生成教学文件，使用时仍需限制写入范围。
- `research`：正文要求后台 agent。Pi 的 skill loader 不会因此自动提供后台执行工具；需验证现有 subagent 扩展/权限，未验证就明确降级或报阻塞。
- `handoff`：要求后继调用 “Skill tool”，Pi 应适配为读取技能或 `/skill:name`，不能假定 Claude 的工具存在。
- teach/handoff 的 `disable-model-invocation:true` 被 Pi 支持：二者可有 `/skill:teach`、`/skill:handoff` 命令，但不进入默认技能描述提示。**验收三个启用项时不能只数系统提示中的技能**。
- `git-guardrails-claude-code` 明确写 `.claude/settings.json`、PreToolUse hook；Pi 发现文件不会把这些 hook 转成 Pi 安全机制。其他技能依赖 setup/issue tracker 等也需逐项审查，不能由 README 的“any model”推导所有 harness 无条件兼容。

## 只读验证与后续验收

本次完整读取安装版 `packages.md`、`skills.md`、`settings.md`；用 urllib 获取上游 README/package.json/tree、目标技能及 ADR；检查已安装 ELF 内嵌 JS，并与 Pi v0.85.1 官方 TS 实现交叉核对。

`node /tmp/pi-0851-filter-probe.cjs` **通过**：探针使用从已安装 ELF 提取的真实纯函数/方法，并以 mock settings/更新执行器验证：三个精确 delta；全局禁用不会覆盖项目先写入的启用记录；绝对路径排除命中；`.pi` 风格相对路径陷阱；delta 选择全局 clone；更新列表确实包含两个 scope。没有执行被 mock 掉的下载、安装或更新。探针是局部行为验证，**不是端到端安装验证**。

授权迁移后的独立验收应检查：其他目录 Matt=0；可信 sglang enabled paths 仅为 Git clone 内上述三条；`.agents` teach 为 disabled 且磁盘文件仍在；无 name collision；四个 npm 包/Omarchy 未变；teach 的辅助文件可读；仅在隔离审查后验证实际更新。旧副本继续保留时，25 条负规则不可提前删除。

仓库 `git diff --cached --name-only` 与 `git status --short --untracked-files=no` 输出均为空。持久新增文件仅本报告；临时源码/探针仅在 `/tmp`。未读取 auth/凭据文件；dbs-standard-answer 未触碰。

## 引用索引（可独立复核）

本地文档根：`/home/luke/.local/share/mise/installs/pi/0.85.1/pi/`。以下行号对应完整读取的安装版文件；官方网页固定 v0.85.1。

- **[P1]** [Pi packages.md](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/docs/packages.md)：本地 `docs/packages.md:20-45`（安全、命令、scope），`:79-94`（Git/ref），`:156-172`（发现、依赖），`:188-228`（过滤、delta/身份）。
- **[P2]** [Pi skills.md](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/docs/skills.md)：本地 `docs/skills.md:7,22-60,65-90,132-150,176-189`（标准、发现、调用、相对资产、frontmatter、冲突）；[Agent Skills 标准](https://agentskills.io/specification)。
- **[P3]** [Pi settings.md](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/docs/settings.md)：本地 `docs/settings.md:11-22`（trust/命令），`:198-220`（npmCommand），`:277-323`（资源路径与过滤）。
- **[S1]** [Pi package-manager.ts](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/package-manager.ts)：本地核对副本 `/tmp/pi-0851-package-manager.ts:667-807`（精确匹配、delta），`:915-961`（project-first 解析），`:1059-1146`（更新 source 遍历），`:1254-1330`（delta 基础 clone），`:1567-1627`（无 ref 更新目标），`:1688-1730`（身份去重），`:1772-1778,1831-1960`（npm、reset/clean），`:2158-2298`（发现/过滤），`:2332-2498`（本地资源/.agents 基准），`:2555-2600`（首写保留、canonical 去重）。实际安装二进制：`/home/luke/.local/share/mise/installs/pi/0.85.1/pi/pi`；`strings` 提取 `/tmp/pi-0851-strings-research.txt:633956-634060,634139-634200,634244-634317,634399-634464,634751-634809,634860-634961,635118-635389` 可对照关键实现。ELF 内 `update(source)` 起始字节 103004332，`findAutoloadDeltaBase` 103012956，`addResource` 103048615。
- **[S2]** [Pi skills.ts](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/skills.ts)：`/tmp/pi-0851-skills.ts:293-356,410-450`；[resource-loader.ts](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/resource-loader.ts)：`/tmp/pi-0851-resource-loader.ts:416-473,672-684`（仅加载 enabled）；[settings-manager.ts](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/settings-manager.ts)：`/tmp/pi-0851-settings-manager.ts:485-495`（独立获取 global/project settings）。
- **[U1]** [Matt README 固定快照](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/README.md#L19-L80)：主张 any model、两种安装哲学、非 Claude 安装及 setup。
- **[U2]** [package.json](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/package.json#L1-L21)；[递归 tree API](https://api.github.com/repos/mattpocock/skills/git/trees/3cca18b368ae95cdbdebbff572ccafa662551015?recursive=1)；[Claude manifest:21-46](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/.claude-plugin/plugin.json#L21-L46)。
- **[U3]** [上游插件 ADR:3-23](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/.agents/adr/0002-ship-as-a-claude-code-plugin.md#L3-L23)：正式范围与布局限制。
- **[U4]** 固定快照技能正文：[teach:1-20](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/teach/SKILL.md#L1-L20)、[research:1-12](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/research/SKILL.md#L1-L12)、[handoff:1-16](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/handoff/SKILL.md#L1-L16)、[Claude guardrails:1-58](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/misc/git-guardrails-claude-code/SKILL.md#L1-L58)。

报告路径：`/home/luke/.pi/agent/research/matt-skills-git-package-management.md`
