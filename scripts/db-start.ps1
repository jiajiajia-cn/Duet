# 启动项目自带的 PostgreSQL 实例（端口 5433，数据在 .pgdata/）
# 不需要管理员权限，和你系统里那个 PostgreSQL 18（5432）互不影响。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root ".pgdata"
$bin  = "D:\APP\PostgreSQL\bin"

if (-not (Test-Path $data)) {
  throw "找不到 .pgdata，请先运行 scripts/db-init.ps1"
}

& "$bin\pg_ctl.exe" status -D $data *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "数据库已在运行：postgresql://postgres@127.0.0.1:5433/checkin"
  exit 0
}

& "$bin\pg_ctl.exe" start -D $data -l (Join-Path $data "server.log") -w -t 60
Write-Host "已启动：postgresql://postgres@127.0.0.1:5433/checkin"
