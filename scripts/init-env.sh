#!/usr/bin/env bash

set -uo pipefail

SCRIPT_VERSION="1.0.0"
TOTAL_STEPS=7
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_SERVICE_DIR="$REPO_ROOT/python-service"
VENV_DIR="$REPO_ROOT/venv"
NODE_DOWNLOAD_URL="https://nodejs.org/en/download"
PYTHON_DOWNLOAD_URL="https://www.python.org/downloads/"
DEFAULT_NODE_LATEST_RELEASE="v26.4.0"
DEFAULT_NODE_LTS="v24.18.0"
DEFAULT_PYTHON_LATEST="3.14.6"

CURRENT_OS=""
CURRENT_ARCH=""
HAS_CURL=0
HAS_BREW=0
NODE_CMD=""
NODE_VERSION=""
NODE_LATEST_RELEASE="$DEFAULT_NODE_LATEST_RELEASE"
NODE_LATEST_LTS="$DEFAULT_NODE_LTS"
BREW_NODE_VERSION=""
PYTHON_CMD=""
PYTHON_VERSION=""
PYTHON_LATEST="$DEFAULT_PYTHON_LATEST"
BREW_PYTHON_FORMULA=""
BREW_PYTHON_VERSION=""
PNPM_CMD=""
PNPM_VERSION=""
INSTALL_NODE_DEPS=0
INSTALL_PYTHON_DEPS=0

log_step() {
  printf '\n[%s/%s] %s\n' "$1" "$TOTAL_STEPS" "$2"
}

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_ok() {
  printf '[OK] %s\n' "$1"
}

log_warn() {
  printf '[WARN] %s\n' "$1"
}

log_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

run_checked() {
  local description="$1"
  shift

  log_info "$description"
  "$@"
  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    log_ok "$description 完成"
    return 0
  fi

  log_error "$description 失败，退出码: $exit_code"
  return "$exit_code"
}

fetch_url() {
  local url="$1"

  if [ "$HAS_CURL" -ne 1 ]; then
    return 1
  fi

  curl --fail --silent --show-error --location --max-time 20 "$url"
}

trim_line() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

extract_first_match() {
  local pattern="$1"
  sed -nE "s/.*(${pattern}).*/\\1/p" | head -n 1
}

detect_system() {
  CURRENT_OS="$(uname -s 2>/dev/null || echo "unknown")"
  CURRENT_ARCH="$(uname -m 2>/dev/null || echo "unknown")"
}

check_prerequisites() {
  if command -v curl >/dev/null 2>&1; then
    HAS_CURL=1
    log_ok "检测到 curl: $(command -v curl)"
  else
    log_warn "未检测到 curl，在线版本查询将回退到内置默认值"
  fi

  if command -v uname >/dev/null 2>&1; then
    log_ok "检测到 uname: $(command -v uname)"
  else
    log_error "未检测到 uname，无法识别当前操作系统"
    return 1
  fi

  if command -v perl >/dev/null 2>&1; then
    log_ok "检测到 perl: $(command -v perl)"
  else
    log_warn "未检测到 perl，在线版本解析可能会退回内置默认值"
  fi

  if command -v brew >/dev/null 2>&1; then
    HAS_BREW=1
    log_ok "检测到 Homebrew: $(brew --version | head -n 1)"
  else
    log_info "未检测到 Homebrew，将跳过 brew 版本查询"
  fi

  return 0
}

fetch_node_versions() {
  local node_home
  node_home="$(fetch_url "https://nodejs.org/en" 2>/dev/null || true)"
  if [ -n "$node_home" ]; then
    local release
    local lts
    release="$(printf '%s' "$node_home" | perl -0ne 'print "$1\n" if /v(\d+\.\d+\.\d+)Latest Release/s' | head -n 1)"
    lts="$(printf '%s' "$node_home" | perl -0ne 'print "$1\n" if /v(\d+\.\d+\.\d+)Latest LTS/s' | head -n 1)"
    if [ -n "$release" ]; then
      NODE_LATEST_RELEASE="v$release"
    fi
    if [ -n "$lts" ]; then
      NODE_LATEST_LTS="v$lts"
    fi
  else
    log_warn "无法从 Node 官网抓取版本信息，将使用内置默认值"
  fi
}

fetch_python_version() {
  local python_home
  python_home="$(fetch_url "$PYTHON_DOWNLOAD_URL" 2>/dev/null || true)"
  if [ -n "$python_home" ]; then
    local latest
    latest="$(printf '%s' "$python_home" | perl -0ne 'print "$1\n" if /Download Python ([0-9]+\.[0-9]+\.[0-9]+)/s' | head -n 1)"
    if [ -n "$latest" ]; then
      PYTHON_LATEST="$latest"
    fi
  else
    log_warn "无法从 Python 官网抓取版本信息，将使用内置默认值"
  fi
}

detect_brew_node() {
  if [ "$HAS_BREW" -ne 1 ]; then
    return 0
  fi

  local brew_json
  brew_json="$(brew info --json=v2 node 2>/dev/null || true)"
  BREW_NODE_VERSION="$(printf '%s' "$brew_json" | perl -0ne 'print "$1\n" if /"stable"\s*:\s*"([^"]+)"/s' | head -n 1)"
  if [ -n "$BREW_NODE_VERSION" ]; then
    log_ok "Homebrew 可提供 node $BREW_NODE_VERSION"
  else
    log_warn "未能解析 Homebrew 中 node 的 stable 版本"
  fi
}

detect_brew_python() {
  if [ "$HAS_BREW" -ne 1 ]; then
    return 0
  fi

  local latest_major_minor
  local latest_major
  local candidate
  latest_major_minor="${PYTHON_LATEST%.*}"
  latest_major="${latest_major_minor%%.*}"

  for candidate in "python@${latest_major_minor}" "python@${latest_major}" "python3" "python"; do
    local brew_json
    brew_json="$(brew info --json=v2 "$candidate" 2>/dev/null || true)"
    if [ -n "$brew_json" ]; then
      local stable
      stable="$(printf '%s' "$brew_json" | perl -0ne 'print "$1\n" if /"stable"\s*:\s*"([^"]+)"/s' | head -n 1)"
      if [ -n "$stable" ]; then
        BREW_PYTHON_FORMULA="$candidate"
        BREW_PYTHON_VERSION="$stable"
        log_ok "Homebrew 可提供 $BREW_PYTHON_FORMULA $BREW_PYTHON_VERSION"
        return 0
      fi
    fi
  done

  log_warn "未能解析 Homebrew 中可用的 Python 公式版本"
  return 0
}

detect_node() {
  fetch_node_versions
  detect_brew_node

  log_info "Node 最新 Release: $NODE_LATEST_RELEASE"
  log_info "Node 最新 LTS: $NODE_LATEST_LTS"
  log_info "Node 推荐版本策略: 优先 LTS，Latest Release 仅作参考"

  if command -v node >/dev/null 2>&1; then
    NODE_CMD="$(command -v node)"
    NODE_VERSION="$(node --version 2>/dev/null || true)"
    log_ok "已检测到 Node.js: $NODE_VERSION ($NODE_CMD)"
    INSTALL_NODE_DEPS=1
    return 0
  fi

  log_error "未检测到 Node.js"
  if [ -n "$BREW_NODE_VERSION" ]; then
    log_info "Homebrew 可提供 node $BREW_NODE_VERSION"
  fi
  log_info "请前往官方下载安装: $NODE_DOWNLOAD_URL"
  INSTALL_NODE_DEPS=0
  return 1
}

detect_python() {
  fetch_python_version
  detect_brew_python

  log_info "Python 最新稳定版本: $PYTHON_LATEST"

  if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="$(command -v python)"
  else
    PYTHON_CMD=""
  fi

  if [ -n "$PYTHON_CMD" ]; then
    PYTHON_VERSION="$("$PYTHON_CMD" --version 2>&1 | trim_line)"
    log_ok "已检测到 Python: $PYTHON_VERSION ($PYTHON_CMD)"
    INSTALL_PYTHON_DEPS=1
    return 0
  fi

  log_error "未检测到 Python 3"
  if [ -n "$BREW_PYTHON_FORMULA" ] && [ -n "$BREW_PYTHON_VERSION" ]; then
    log_info "Homebrew 可提供 $BREW_PYTHON_FORMULA $BREW_PYTHON_VERSION"
  fi
  log_info "请前往官方下载安装: $PYTHON_DOWNLOAD_URL"
  INSTALL_PYTHON_DEPS=0
  return 1
}

prepare_node_dependencies() {
  if [ "$INSTALL_NODE_DEPS" -ne 1 ]; then
    log_warn "跳过 Node 依赖安装，因为 Node.js 未安装"
    return 1
  fi

  if command -v corepack >/dev/null 2>&1; then
    run_checked "启用 Corepack" corepack enable || return 1
    PNPM_CMD="corepack pnpm"
    PNPM_VERSION="$(corepack pnpm --version 2>/dev/null || true)"
    if [ -n "$PNPM_VERSION" ]; then
      log_ok "将使用 Corepack 提供的 pnpm: $PNPM_VERSION"
    else
      log_warn "Corepack 已启用，但未能读取 pnpm 版本"
    fi
    log_info "执行命令: corepack pnpm install"
    if (cd "$REPO_ROOT" && corepack pnpm install); then
      log_ok "Node 依赖安装完成"
      PNPM_VERSION="$(corepack pnpm --version 2>/dev/null || echo "$PNPM_VERSION")"
      return 0
    fi

    log_error "corepack pnpm install 失败"
    log_info "建议检查网络、锁文件一致性，或手动重试: cd \"$REPO_ROOT\" && corepack pnpm install"
    return 1
  fi

  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD="$(command -v pnpm)"
    PNPM_VERSION="$(pnpm --version 2>/dev/null || true)"
    log_ok "检测到 pnpm: ${PNPM_VERSION:-unknown} ($PNPM_CMD)"
    log_info "执行命令: pnpm install"
    if (cd "$REPO_ROOT" && pnpm install); then
      log_ok "Node 依赖安装完成"
      return 0
    fi

    log_error "pnpm install 失败"
    log_info "建议检查网络、锁文件一致性，或手动重试: cd \"$REPO_ROOT\" && pnpm install"
    return 1
  fi

  log_error "未检测到 corepack 或 pnpm，无法安装 Node 依赖"
  log_info "建议先确保 Node.js 安装完整，然后执行: corepack enable"
  return 1
}

prepare_python_dependencies() {
  if [ "$INSTALL_PYTHON_DEPS" -ne 1 ]; then
    log_warn "跳过 Python 依赖安装，因为 Python 未安装"
    return 1
  fi

  if [ ! -f "$PYTHON_SERVICE_DIR/requirements.txt" ]; then
    log_error "缺少 Python 依赖清单: $PYTHON_SERVICE_DIR/requirements.txt"
    return 1
  fi

  if [ -d "$VENV_DIR" ]; then
    log_ok "检测到已存在的虚拟环境，将继续复用: $VENV_DIR"
  else
    log_info "创建新的 Python 虚拟环境: $VENV_DIR"
    if ! "$PYTHON_CMD" -m venv "$VENV_DIR"; then
      log_error "创建虚拟环境失败"
      log_info "请确认当前 Python 启用了 venv 模块，然后重试"
      return 1
    fi
    log_ok "Python 虚拟环境已创建"
  fi

  local venv_python="$VENV_DIR/bin/python"
  if [ ! -x "$venv_python" ]; then
    log_error "虚拟环境解释器不存在: $venv_python"
    return 1
  fi

  if ! run_checked "升级 venv 内 pip" "$venv_python" -m pip install --upgrade pip; then
    log_info "请手动重试: \"$venv_python\" -m pip install --upgrade pip"
    return 1
  fi

  log_info "执行命令: \"$venv_python\" -m pip install -r \"$PYTHON_SERVICE_DIR/requirements.txt\""
  if "$venv_python" -m pip install -r "$PYTHON_SERVICE_DIR/requirements.txt"; then
    log_ok "Python 依赖安装完成"
    return 0
  fi

  log_error "Python 依赖安装失败"
  log_info "虚拟环境已保留，可手动重试:"
  log_info "  \"$venv_python\" -m pip install -r \"$PYTHON_SERVICE_DIR/requirements.txt\""
  return 1
}

print_summary() {
  log_step 7 "输出初始化结果摘要"
  log_info "仓库根目录: $REPO_ROOT"
  log_info "Node 版本: ${NODE_VERSION:-未安装}"
  log_info "pnpm 版本: ${PNPM_VERSION:-未检测到}"
  log_info "Python 版本: ${PYTHON_VERSION:-未安装}"
  log_info "venv 路径: $VENV_DIR"
  log_info "后续启动命令: cd \"$REPO_ROOT\" && pnpm dev:all"
  log_info "Python 激活命令: source \"$VENV_DIR/bin/activate\""
}

main() {
  printf '=== FormFlow Studio 环境初始化脚本 v%s ===\n' "$SCRIPT_VERSION"

  log_step 1 "检测系统信息"
  detect_system
  log_info "当前时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  log_info "仓库根目录: $REPO_ROOT"
  log_info "操作系统: $CURRENT_OS"
  log_info "CPU 架构: $CURRENT_ARCH"

  log_step 2 "检测基础能力"
  if ! check_prerequisites; then
    log_error "基础能力检测失败，初始化终止"
    return 1
  fi

  log_step 3 "检测 Node.js"
  detect_node || true

  log_step 4 "检测 Python"
  detect_python || true

  local overall_status=0

  log_step 5 "安装 Node 依赖"
  if ! prepare_node_dependencies; then
    overall_status=1
  fi

  log_step 6 "配置 Python venv 并安装依赖"
  if ! prepare_python_dependencies; then
    overall_status=1
  fi

  print_summary
  return "$overall_status"
}

main "$@"
