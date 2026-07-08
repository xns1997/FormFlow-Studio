$ErrorActionPreference = "Stop"

$ScriptVersion = "1.0.0"
$TotalSteps = 7
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PythonServiceDir = Join-Path $RepoRoot "python-service"
$RequirementsPath = Join-Path $PythonServiceDir "requirements.txt"
$VenvDir = Join-Path $RepoRoot "venv"
$NodeDownloadUrl = "https://nodejs.org/en/download"
$PythonDownloadUrl = "https://www.python.org/downloads/"
$DefaultNodeLatestRelease = "v26.4.0"
$DefaultNodeLatestLts = "v24.18.0"
$DefaultPythonLatest = "3.14.6"

$NodeVersion = $null
$NodeLatestRelease = $DefaultNodeLatestRelease
$NodeLatestLts = $DefaultNodeLatestLts
$PythonVersion = $null
$PythonLatest = $DefaultPythonLatest
$PnpmVersion = $null
$PythonCommand = $null
$PyLauncher = $null
$InstallNodeDeps = $false
$InstallPythonDeps = $false
$OverallStatus = 0

function Write-Step {
  param([int]$Number, [string]$Message)
  Write-Host ""
  Write-Host ("[{0}/{1}] {2}" -f $Number, $TotalSteps, $Message)
}

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message"
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN] $Message"
}

function Write-ErrorLog {
  param([string]$Message)
  Write-Host "[ERROR] $Message"
}

function Get-CommandPath {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Invoke-LoggedCommand {
  param(
    [string]$Description,
    [scriptblock]$Action
  )

  Write-Info $Description
  try {
    & $Action
    Write-Ok "$Description 完成"
    return $true
  }
  catch {
    Write-ErrorLog "$Description 失败: $($_.Exception.Message)"
    return $false
  }
}

function Get-WebContent {
  param([string]$Url)
  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 20).Content
  }
  catch {
    return $null
  }
}

function Update-OfficialVersions {
  $nodeHome = Get-WebContent -Url "https://nodejs.org/en"
  if ($nodeHome) {
    $releaseMatch = [regex]::Match($nodeHome, 'v(\d+\.\d+\.\d+)Latest Release', 'Singleline')
    $ltsMatch = [regex]::Match($nodeHome, 'v(\d+\.\d+\.\d+)Latest LTS', 'Singleline')
    if ($releaseMatch.Success) {
      $NodeLatestRelease = "v$($releaseMatch.Groups[1].Value)"
    }
    if ($ltsMatch.Success) {
      $NodeLatestLts = "v$($ltsMatch.Groups[1].Value)"
    }
  }
  else {
    Write-Warn "无法从 Node 官网抓取版本信息，将使用内置默认值"
  }

  $pythonHome = Get-WebContent -Url $PythonDownloadUrl
  if ($pythonHome) {
    $pythonMatch = [regex]::Match($pythonHome, 'Download Python ([0-9]+\.[0-9]+\.[0-9]+)')
    if ($pythonMatch.Success) {
      $PythonLatest = $pythonMatch.Groups[1].Value
    }
  }
  else {
    Write-Warn "无法从 Python 官网抓取版本信息，将使用内置默认值"
  }
}

function Detect-Node {
  Update-OfficialVersions

  Write-Info "Node 最新 Release: $NodeLatestRelease"
  Write-Info "Node 最新 LTS: $NodeLatestLts"
  Write-Info "Node 推荐版本策略: 优先 LTS，Latest Release 仅作参考"

  $nodePath = Get-CommandPath -Name "node"
  if ($nodePath) {
    $NodeVersion = (& node --version).Trim()
    Write-Ok "已检测到 Node.js: $NodeVersion ($nodePath)"
    $InstallNodeDeps = $true
    return
  }

  Write-ErrorLog "未检测到 Node.js"
  Write-Info "请前往官方下载安装: $NodeDownloadUrl"
  $InstallNodeDeps = $false
}

function Detect-Python {
  Write-Info "Python 最新稳定版本: $PythonLatest"

  $PyLauncher = Get-CommandPath -Name "py"
  if ($PyLauncher) {
    try {
      $PythonVersion = (& py -3 --version 2>&1 | Out-String).Trim()
      if ($PythonVersion) {
        $PythonCommand = "py -3"
        Write-Ok "已检测到 Python Launcher: $PythonVersion ($PyLauncher)"
        $InstallPythonDeps = $true
        return
      }
    }
    catch {
      Write-Warn "检测到 py，但未能通过 py -3 读取 Python 版本"
    }
  }

  $pythonPath = Get-CommandPath -Name "python"
  if ($pythonPath) {
    $PythonVersion = (& python --version 2>&1 | Out-String).Trim()
    $PythonCommand = $pythonPath
    Write-Ok "已检测到 Python: $PythonVersion ($pythonPath)"
    $InstallPythonDeps = $true
    return
  }

  Write-ErrorLog "未检测到 Python 3"
  Write-Info "请前往官方下载安装: $PythonDownloadUrl"
  $InstallPythonDeps = $false
}

function Prepare-NodeDependencies {
  if (-not $InstallNodeDeps) {
    Write-Warn "跳过 Node 依赖安装，因为 Node.js 未安装"
    return $false
  }

  $corepackPath = Get-CommandPath -Name "corepack"
  if ($corepackPath) {
    if (-not (Invoke-LoggedCommand -Description "启用 Corepack" -Action { corepack enable | Out-Host })) {
      return $false
    }

    try {
      $PnpmVersion = (& corepack pnpm --version 2>&1 | Out-String).Trim()
      if ($PnpmVersion) {
        Write-Ok "将使用 Corepack 提供的 pnpm: $PnpmVersion"
      }
    }
    catch {
      Write-Warn "Corepack 已启用，但未能读取 pnpm 版本"
    }

    Write-Info "执行命令: corepack pnpm install"
    try {
      Push-Location $RepoRoot
      corepack pnpm install | Out-Host
      Pop-Location
      $PnpmVersion = (& corepack pnpm --version 2>&1 | Out-String).Trim()
      Write-Ok "Node 依赖安装完成"
      return $true
    }
    catch {
      if ((Get-Location).Path -ne $RepoRoot) {
        Pop-Location
      }
      Write-ErrorLog "corepack pnpm install 失败: $($_.Exception.Message)"
      Write-Info "建议手动重试: Set-Location '$RepoRoot'; corepack pnpm install"
      return $false
    }
  }

  $pnpmPath = Get-CommandPath -Name "pnpm"
  if ($pnpmPath) {
    $PnpmVersion = (& pnpm --version 2>&1 | Out-String).Trim()
    Write-Ok "检测到 pnpm: $PnpmVersion ($pnpmPath)"
    Write-Info "执行命令: pnpm install"
    try {
      Push-Location $RepoRoot
      pnpm install | Out-Host
      Pop-Location
      Write-Ok "Node 依赖安装完成"
      return $true
    }
    catch {
      if ((Get-Location).Path -ne $RepoRoot) {
        Pop-Location
      }
      Write-ErrorLog "pnpm install 失败: $($_.Exception.Message)"
      Write-Info "建议手动重试: Set-Location '$RepoRoot'; pnpm install"
      return $false
    }
  }

  Write-ErrorLog "未检测到 corepack 或 pnpm，无法安装 Node 依赖"
  Write-Info "建议先确保 Node.js 安装完整，然后执行: corepack enable"
  return $false
}

function Prepare-PythonDependencies {
  if (-not $InstallPythonDeps) {
    Write-Warn "跳过 Python 依赖安装，因为 Python 未安装"
    return $false
  }

  if (-not (Test-Path $RequirementsPath)) {
    Write-ErrorLog "缺少 Python 依赖清单: $RequirementsPath"
    return $false
  }

  if (Test-Path $VenvDir) {
    Write-Ok "检测到已存在的虚拟环境，将继续复用: $VenvDir"
  }
  else {
    Write-Info "创建新的 Python 虚拟环境: $VenvDir"
    try {
      if ($PyLauncher) {
        & py -3 -m venv $VenvDir
      }
      else {
        & python -m venv $VenvDir
      }
      Write-Ok "Python 虚拟环境已创建"
    }
    catch {
      Write-ErrorLog "创建虚拟环境失败: $($_.Exception.Message)"
      return $false
    }
  }

  $venvPython = Join-Path $VenvDir "Scripts\python.exe"
  if (-not (Test-Path $venvPython)) {
    Write-ErrorLog "虚拟环境解释器不存在: $venvPython"
    return $false
  }

  if (-not (Invoke-LoggedCommand -Description "升级 venv 内 pip" -Action { & $venvPython -m pip install --upgrade pip | Out-Host })) {
    Write-Info "请手动重试: & '$venvPython' -m pip install --upgrade pip"
    return $false
  }

  Write-Info "执行命令: & '$venvPython' -m pip install -r '$RequirementsPath'"
  try {
    & $venvPython -m pip install -r $RequirementsPath | Out-Host
    Write-Ok "Python 依赖安装完成"
    return $true
  }
  catch {
    Write-ErrorLog "Python 依赖安装失败: $($_.Exception.Message)"
    Write-Info "虚拟环境已保留，可手动重试:"
    Write-Info "  & '$venvPython' -m pip install -r '$RequirementsPath'"
    return $false
  }
}

function Print-Summary {
  Write-Step -Number 7 -Message "输出初始化结果摘要"
  Write-Info "仓库根目录: $RepoRoot"
  Write-Info "Node 版本: $(if ($NodeVersion) { $NodeVersion } else { '未安装' })"
  Write-Info "pnpm 版本: $(if ($PnpmVersion) { $PnpmVersion } else { '未检测到' })"
  Write-Info "Python 版本: $(if ($PythonVersion) { $PythonVersion } else { '未安装' })"
  Write-Info "venv 路径: $VenvDir"
  Write-Info "后续启动命令: Set-Location '$RepoRoot'; pnpm dev:all"
  Write-Info "Python 激活命令: & '$VenvDir\Scripts\Activate.ps1'"
}

Write-Host "=== FormFlow Studio 环境初始化脚本 v$ScriptVersion ==="

Write-Step -Number 1 -Message "检测系统信息"
$osInfo = Get-CimInstance Win32_OperatingSystem
Write-Info "当前时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Write-Info "仓库根目录: $RepoRoot"
Write-Info "操作系统: $($osInfo.Caption)"
Write-Info "系统版本: $($osInfo.Version)"
Write-Info "PowerShell 版本: $($PSVersionTable.PSVersion)"
Write-Info "CPU 架构: $env:PROCESSOR_ARCHITECTURE"

Write-Step -Number 2 -Message "检测基础能力"
$invokeWebRequestPath = Get-CommandPath -Name "Invoke-WebRequest"
if ($invokeWebRequestPath) {
  Write-Ok "检测到 Invoke-WebRequest"
}
else {
  Write-Warn "未检测到 Invoke-WebRequest，在线版本查询将回退到内置默认值"
}

Write-Step -Number 3 -Message "检测 Node.js"
Detect-Node

Write-Step -Number 4 -Message "检测 Python"
Detect-Python

Write-Step -Number 5 -Message "安装 Node 依赖"
if (-not (Prepare-NodeDependencies)) {
  $OverallStatus = 1
}

Write-Step -Number 6 -Message "配置 Python venv 并安装依赖"
if (-not (Prepare-PythonDependencies)) {
  $OverallStatus = 1
}

Print-Summary
exit $OverallStatus
