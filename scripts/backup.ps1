# 备份本地数据库到 backups/
# 用法：powershell -ExecutionPolicy Bypass -File scripts/backup.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$bin  = "D:\APP\PostgreSQL\bin"
$dir  = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file  = Join-Path $dir "checkin-$stamp.sql"

& "$bin\pg_dump.exe" -h 127.0.0.1 -p 5433 -U postgres -d checkin --no-owner --no-privileges -f $file
if ($LASTEXITCODE -ne 0) { throw "备份失败" }

$size = [math]::Round((Get-Item $file).Length / 1KB, 1)
Write-Host "已备份：$file ($size KB)"

# 只保留最近 14 份
Get-ChildItem $dir -Filter "checkin-*.sql" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 14 | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "已清理旧备份：$($_.Name)"
  }
