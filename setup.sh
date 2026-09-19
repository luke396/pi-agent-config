#!/usr/bin/env bash
# 新机器引导 / 每次 pull 后补齐。幂等，可反复执行。
#   新机器： mv ~/.pi/agent ~/.pi/agent.bak
#            git clone <url> ~/.pi/agent
#            cd ~/.pi/agent && ./setup.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# pull 后自动重跑本脚本（pasky 同款做法）
git config core.hooksPath .githooks

if ! command -v pi >/dev/null 2>&1; then
    echo "警告：PATH 里没有 pi，跳过包同步。装好 pi 后重跑本脚本。"
else
    # settings.json 里的 npm:/git: 包声明在此落地（pi-token-speed、pi-powerline-footer 等）
    pi update --extensions || echo "警告：pi update --extensions 失败，稍后手动重跑"
fi

# 本仓库不跟踪、也不分发的第三方托管文件，由各工具自行安装
if [[ ! -f extensions/herdr-agent-state.ts ]]; then
    echo "提示：extensions/herdr-agent-state.ts 属于 herdr 托管，本仓库不含它。若用 herdr，请在其安装流程里重装集成。"
fi

echo "完成。"
