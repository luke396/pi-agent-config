# Pi subagent 实现调研

日期：2026-09-05。环境：独立二进制 Pi 0.84.4；已安装 nicobailon/pi-subagents 0.65.0。

## 结论

问题不宜概括为“当前插件实现差”。它已经是多代理编排平台，包含 missions、调度、watchdog、管理、worktree、外部 CLI、持久化和发布证据等能力；用户当前需要的主要是简单委派、并行审查和后台结果。能力面、默认提示策略和实际需求不匹配。

- 若最看重简单委派/并行审查，允许父代理等待整批结果：优先试验 `@mjakl/pi-subagent@3.0.1`。
- 若必须保留后台运行、完成唤醒、steering、续接：优先试验 `@tintinweb/pi-subagents@0.19.0` 的精简配置，不推荐原样默认替换。
- 官方 subagent 示例最容易审计，但只是参考实现，缺少完整后台生命周期和工作区隔离管理。
- `@narumitw/pi-subagents@3.0.1` 的能力边界很干净，但当前不能完整代替后台研究/审查需求。
- `@snowy117/pi-subagents@0.35.0` 是当前插件的精简 fork，值得观察，尚无足够证据推荐为首选。

没有安装或运行替代插件，没有声称性能提升或稳定性排名。下载并静态检查了 mjakl/tintinweb/narumitw 的 npm 发布包；只对现有插件执行了一次失败的直接后台启动，以及一次成功的后台 workflow 验证。未更改插件配置。

## 1. 当前插件：问题具体在哪里

### 模型可见接口过宽

本机 `src/extension/schemas.ts` 中 `SubagentParamProperties` 有 **79 个顶层字段**，还不包括嵌套结构、`bg_wait`、supervisor 工具。这个数字是源码字段统计，不是 token 测量。

`src/extension/tool-description.ts:17–26` 把发现、调用形状、脚本限制和结果处理同时写入工具 description 和 promptGuidelines；skill 又要求复杂工作读取多份参考。这是可证实的重复，不是从 README 长度推测。

### 两条后台执行路径不一致：本机已验证

1. 直接 `{agent, task, async:true}`：失败，错误为缺少 npm Pi 包目录。
2. `{workflowScript: "...runs.run(...)...", async:true}`：成功完成一个只读 reviewer 子任务并送达完成通知。

源码依据（相对 `~/.pi/agent/npm/node_modules/pi-subagents/src/`）：

- `runs/background/async-execution.ts:89,547–552,589–598`：直接后台运行解析 npm Pi 根目录，启动 Node → jiti → subagent-runner；缺包目录提前拒绝。
- `runs/foreground/subagent-executor.ts:4517–4522,5121–5126`：外层后台 workflow 在当前进程调度，普通原生 workflow 子任务默认 `async:false`。
- `runs/shared/child-session.ts`：这些原生子任务使用进程内 Pi session，不走前述 detached runner。

所以不能说“所有 subagent 后台都不可用”，也不能把问题归因于此前卸载 MCP：没有卸载前后同一路径的对照证据。现有成功案例本来就使用了另一条路径。

[当前上游](https://github.com/nicobailon/pi-subagents)；本地验证报告：`/home/luke/.pi/agent/sessions/--home-luke--/subagent-artifacts/outputs/f4e16696-9254-4e0d-973b-92e49b800bb8/research/runner-compatibility.md`。

## 2. 候选比较

| 实现 | 简单/并行 | 后台返回并唤醒 | 上下文续接 | 文件隔离 | 主要权衡 |
|---|---|---|---|---|---|
| 本机 nicobailon 0.65.0 | 支持 | workflow 已实测；直接后台受 npm 安装形态限制 | fresh/fork/resume | managed worktrees | 功能全，模型接口和指导较重 |
| Pi 0.84.4 官方示例 | single/tasks/chain；最多 8 项、4 并发 | 示例工具等待结果，没有完整 detached 管理 | 独立新上下文；无命名续接 API | 只有 cwd，不管理 worktree | 最小参考实现，不是完整产品替换 |
| mjakl 3.0.1 | 统一 calls 数组；1–8 项 | 无公开 detached + 完成唤醒接口；等待整批返回 | empty/parent；命名 session | 独立进程，默认共享文件系统 | 简洁，但牺牲后台交互 |
| tintinweb 0.19.0 | Agent 单次调用；多个调用并行 | 支持默认后台、自动通知、结果读取 | fresh/继承历史/resume/steer | 可选 worktree | 默认也重，但能实际关闭功能和缩小 schema |
| narumitw 3.0.1 | 多次 spawn；任务即角色 | 后台 job；终态通知不自动唤醒空闲主模型 | 运行中问答，不保留完成后会话 | 同 cwd；外部负责隔离 | 限制多，但边界清晰、无附带 skill |
| Snowy117 0.35.0 | tasks 统一单/并行 | README 声明 detached + 自动通知 | fresh/fork/resume/steer | worktree | 精简 fork；安装兼容性和维护证据需更多验证 |

这里的“独立进程/上下文”均不等于文件系统沙箱。多个写代理仍须独立 worktree 或明确互不重叠的文件所有权。

## 3. @mjakl/pi-subagent 3.0.1

发布元数据：Pi >=0.80.5；npm 3.0.1，gitHead `0d13273319902a84535c2bf4341a5aefbd422dc0`。仓库未归档；查询时最近 push 为 2026-09-04，不能据此保证稳定性。

优点：
- 一个工具、一个 `calls` 顶层数组，每项 8 个字段，没有 missions/调度/watchdog 管理 API。
- 独立 Pi RPC 子进程；默认不带父对话；可按命名 session 续接。
- 有取消、进程组终止、输出限额、递归深度/循环防护。
- npm manifest 只加载 extension，不附带需要强制阅读的 skill 或 prompt 模板。
- 发布版 `runner.ts:77–83` 的非 Node 分支直接使用当前可执行文件，源码上对 standalone 形态友好；尚未在本机加载验证。

不足：
- 公共调用等待整批结果，不是“派出后父代理继续，完成时自动回来”的替代品。
- `contract.ts:152–207` 仍把 Fields/Rules 写进系统提示和工具 description 两处。接口小，不代表完全没有重复提示。
- 没有 managed worktrees；命名会话冲突锁是会话保护，不是文件写入隔离。
- 没有代理时会自动创建一个用户级 `explore.md`；试用时应隔离 agentDir。

[仓库](https://github.com/mjakl/pi-subagent)
[发布元数据](https://registry.npmjs.org/@mjakl%2fpi-subagent/3.0.1)
[发布源码 contract](https://github.com/mjakl/pi-subagent/blob/0d13273319902a84535c2bf4341a5aefbd422dc0/contract.ts)
[发布源码 runner](https://github.com/mjakl/pi-subagent/blob/0d13273319902a84535c2bf4341a5aefbd422dc0/runner.ts)

## 4. @tintinweb/pi-subagents 0.19.0

发布元数据：Pi >=0.84.0，开发依赖 Pi 0.84.2；npm 0.19.0，gitHead `4f572eaa04c09d3dbc16e4a5f13a16b295e84e14`。本机版本落在声明范围内，尚未进行兼容性实测。

优点：
- 普通派发是 `Agent`，结果是 `get_subagent_result`，运行中指导是 `steer_subagent`，不必先写 workflowScript。
- 默认后台、完成通知、合并通知、续接、steering、并发限制、可选 worktree。
- 发布版 `src/agent-runner.ts:978–1008` 使用宿主 `createAgentSession` 创建独立会话，不依赖当前插件那个直接 detached Node runner 的 npm 根目录检查。不是独立 OS 进程。
- `toolDescriptionMode: compact` 确实选择较短文本。
- `workflowsEnabled:false` 不注册 workflow 工具；`schedulingEnabled:false` 从 schema 删除 schedule 字段，而不只是提示“不使用”。

建议的试验配置，而非本次已应用配置：

```json
{
  "toolDescriptionMode": "compact",
  "workflowsEnabled": false,
  "schedulingEnabled": false,
  "agentMentions": "off",
  "maxSubagentDepth": 1,
  "fallbackSubagent": "none"
}
```

保留 worktree 能力，按需显式使用；不要把“关闭隔离”当作纯提示词优化。

不足与迁移风险：
- 默认仍是大型产品，带 workflow、定时、mentions、memory、较长角色说明；原样安装不能保证减负。
- compact 仍有 promptGuidelines；不能把上游“约 75% 更短”的单段描述宣传当成总请求 token 节省。
- 默认 `@agent` 首次启动可通过隐藏的对话克隆模型调用准备提示；建议关闭 mentions，避免隐性额外调用。
- 默认未知 agent 可以回退为 general-purpose；建议 `fallbackSubagent:none`。
- worktree 变更会被自动提交到本地分支，preservation commit 使用 `--no-verify`；这是需要用户接受的行为差异。
- 同宿主 session 的隔离与独立进程不同，第三方扩展兼容/共享状态需实测。

[仓库](https://github.com/tintinweb/pi-subagents)
[发布元数据](https://registry.npmjs.org/@tintinweb%2fpi-subagents/0.19.0)
[发布源码入口](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/index.ts)
[发布源码 runner](https://github.com/tintinweb/pi-subagents/blob/4f572eaa04c09d3dbc16e4a5f13a16b295e84e14/src/agent-runner.ts)

## 5. 其他候选

### 官方示例

本机已随 Pi 0.84.4 提供：
`/home/luke/.local/share/mise/installs/pi/0.84.4/pi/examples/extensions/subagent/`

`index.ts:459–480` 是 7 个顶层参数、几句工具描述；支持单个、并行、链式。`getPiInvocation` 对独立二进制做了处理。没有产品级后台通知/持久化/工作区管理。适合最小基线，不宜包装成“官方完整 subagents”。

[上游示例](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent)

### @narumitw/pi-subagents 3.0.1

发布包只带 extension，没有注册 skill；spawn 仅 task/tools/thinkingLevel/timeout，默认只读。源码支持独立 Pi RPC 子进程、运行中双向问答和取消。

不作为当前首选：子代理仅可使用内置工具，不能直接继承 `web_search` 等 extension 工具；没有每任务模型选择、fork/resume、managed worktrees；完成事件不自动唤醒空闲主模型。会削弱目前后台研究和续接的体验。

文档存在明确漂移：README 说 v3 未发布，但 npm registry 和实际下载 tarball 均是 3.0.1，且包含新工具实现。该结论以 registry/tarball 为准。发布包开发依赖是 Pi 0.84.4，而当前 main 已改为 0.85.0，因此不能混用 main 和 npm 发布版兼容性说法。

[仓库](https://github.com/narumiruna/pi-extensions/tree/main/packages/pi-subagents)
[发布元数据](https://registry.npmjs.org/@narumitw%2fpi-subagents/3.0.1)
[发布源码](https://github.com/narumiruna/pi-extensions/tree/72df85c54149e07fc204539bc1db38c1bba494f3/packages/pi-subagents)

### @snowy117/pi-subagents 0.35.0

README 声明：一个 subagent 工具、一个 /subagents 命令、一个中立 delegate、无 prompt 模板；支持后台、fresh/fork、worktree 和续接。GitHub 元数据确认它是 nicobailon 的 fork；查询时最后 push 为 2026-08-06，未归档。

设计方向符合减负，但仍使用 detached Node/jiti runner，并依赖大量原框架代码。没有验证 standalone 安装兼容性，不能因“minimal”标签推荐无条件迁移。需要额外验证安装、真实完成通知和停止语义。

[仓库](https://github.com/Snowy117/pi-subagents)
[发布元数据](https://registry.npmjs.org/@snowy117%2fpi-subagents/0.35.0)

## 6. 下一步建议：先做可回退对照，而不是直接全局换装

如用户批准试用：
1. 使用隔离的 agentDir 和临时测试项目；一次只加载一个 subagent 插件，避免同名工具和旧提示规则串入。
2. 不更换用户当前 provider/model，比较同一份自包含任务。
3. 检查只读单代理、两路并行审查、后台完成后的主模型唤醒、Esc/取消、一次失败传播、一次会话续接；需要写代理才加 worktree 验证。
4. 记录真实模型可见的工具 schemas + system prompt，以及冷启动和完成延迟；不以包大小/README 长度代替测量。
5. 确认 reviewer 工具权限、用户改动未被暂存/提交、无遗留子进程、其他插件状态正常。
6. 再决定是否全局替换，保留原版本和配置以回退。

本次只产出此报告及临时只读源码下载，没有安装候选、改配置或对外提交 issue。
