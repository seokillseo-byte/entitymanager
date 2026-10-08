$ErrorActionPreference = "Stop"

$iconDir = "apps/desktop/src-tauri/icons"
$iconPath = Join-Path $iconDir "icon.ico"

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

if (Test-Path $iconPath) {
  Write-Host "Tauri icon already exists: $iconPath"
  exit 0
}

Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$background = [System.Drawing.Color]::FromArgb(19, 31, 54)
$brandBlue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))
$brandCyan = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(34, 211, 238))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 247, 255))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 208, 255))

$graphics.Clear($background)
$graphics.FillRectangle($brandBlue, 38, 38, 180, 180)
$graphics.FillRectangle($brandCyan, 38, 38, 180, 22)
$graphics.FillRectangle($white, 70, 82, 116, 28)
$graphics.FillRectangle($white, 70, 126, 116, 28)
$graphics.FillRectangle($muted, 70, 170, 82, 22)

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)

$stream.Dispose()
$icon.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Created Tauri icon: $iconPath"
