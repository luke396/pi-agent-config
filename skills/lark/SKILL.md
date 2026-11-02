---
name: lark
description: 飞书/Lark 入口：用户给出 feishu.cn、larksuite.com 或 doubao.com 的 /docx/ /wiki/ /sheets/ /base/ /slides/ /file/ 等链接，或要读写飞书文档、表格、多维表格、知识库、画板、幻灯片、云盘，发消息、查群聊、日历会议、妙记、任务、审批、邮件、OKR，或处理 lark-cli 授权时使用。先读本入口，再选具体的 lark-* skill。
---

# 飞书 skill 入口

具体的 skill 由 `lark-cli install` 安装在 `~/.agents/skills/lark-*/`，不直接列进 system prompt。先选出一个 skill，用 read 读它的 `SKILL.md`，再按里面的说明做。该 skill 引用的相对路径（如 `references/...`、`../lark-shared/...`）都相对 `~/.agents/skills/<skill>/` 解析。

## 常用路由

按 URL 路径判断，不按域名：

| 输入 | skill |
|---|---|
| `/docx/`、`/doc/`、`/wiki/` 链接，读写文档 | lark-doc（wiki 节点本身的管理用 lark-wiki） |
| `/sheets/` 链接，电子表格 | lark-sheets |
| `/base/`、`/app/` 链接，多维表格 | lark-base |
| 文档里的画板 | lark-whiteboard |
| `/slides/` 链接 | lark-slides |
| `/file/`、`/drive/` 链接，上传下载、导入、搜索云盘文件 | lark-drive |
| 登录、授权、缺 scope、身份、`_notice` | lark-shared |

lark-doc、lark-sheets 等多数 skill 要求先读 lark-shared，以各 skill 的 metadata 为准。

## 其他需求

上表没有覆盖时，列出全部描述再选：

```bash
grep -H '^description:' ~/.agents/skills/lark-*/SKILL.md
```

LarkShell 本地缓存里的图片路径（`~/Library/Application Support/LarkShell/...`）只是本地文件，不需要这个入口。
