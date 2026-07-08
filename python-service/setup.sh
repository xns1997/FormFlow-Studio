#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INIT_SCRIPT="$REPO_ROOT/scripts/init-env.sh"

echo "[INFO] python-service/setup.sh 已迁移为仓库级初始化入口的兼容包装。"
echo "[INFO] 将改为执行: bash scripts/init-env.sh"

if [ ! -f "$INIT_SCRIPT" ]; then
  echo "[ERROR] 未找到初始化脚本: $INIT_SCRIPT" >&2
  exit 1
fi

exec bash "$INIT_SCRIPT"
