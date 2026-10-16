$ErrorActionPreference = "Stop"

$destination = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\resources\chromium"
$metadata = Invoke-RestMethod "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
$download = $metadata.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq "win64" } | Select-Object -First 1

if (-not $download) {
  throw "Chrome for Testing metadata did not contain a win64 download."
}

$archive = Join-Path $env:RUNNER_TEMP "entitymanager-chrome-win64.zip"
$extractRoot = Join-Path $env:RUNNER_TEMP "entitymanager-chrome-win64"

Remove-Item $destination -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $destination -Force | Out-Null

Write-Host "Downloading managed Chrome for Testing $($metadata.channels.Stable.version)..."
Invoke-WebRequest -Uri $download.url -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $extractRoot -Force
Copy-Item (Join-Path $extractRoot "chrome-win64\*") $destination -Recurse -Force

if (-not (Test-Path (Join-Path $destination "chrome.exe"))) {
  throw "Managed Chromium staging failed: chrome.exe is missing."
}

Set-Content -Path (Join-Path $destination "ENTITYMANAGER_RUNTIME_VERSION.txt") -Value $metadata.channels.Stable.version
Write-Host "Managed Chromium staged at $destination"
