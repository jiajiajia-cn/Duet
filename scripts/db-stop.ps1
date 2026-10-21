$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root ".pgdata"
$bin  = "D:\APP\PostgreSQL\bin"

& "$bin\pg_ctl.exe" status -D $data *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "数据库没在运行。"
  exit 0
}
& "$bin\pg_ctl.exe" stop -D $data -m fast -w
Write-Host "已停止。"
