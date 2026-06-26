#!/bin/bash
# 自动创建 Python 虚拟环境并安装依赖

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/../venv"

echo "🐍 创建 Python 虚拟环境..."

# 检查 Python 版本
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "❌ 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

PYTHON_VERSION=$($PYTHON --version 2>&1)
echo "   使用: $PYTHON_VERSION"

# 创建虚拟环境
if [ -d "$VENV_DIR" ]; then
    echo "   虚拟环境已存在: $VENV_DIR"
else
    $PYTHON -m venv "$VENV_DIR"
    echo "   已创建: $VENV_DIR"
fi

# 激活并安装依赖
echo "📦 安装依赖..."
source "$VENV_DIR/bin/activate"

pip install --upgrade pip -q
pip install -r "$SCRIPT_DIR/requirements.txt" -q

echo "✅ 完成!"
echo ""
echo "使用方法:"
echo "  source venv/bin/activate"
echo "  python python/describe.py <file.xlsx>"
