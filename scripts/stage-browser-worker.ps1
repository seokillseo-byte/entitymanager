$ErrorActionPreference = "Stop"
$repoRoot = Join-Path $PSScriptRoot ".."
$destination = Join-Path $repoRoot "apps\desktop\src-tauri\resources\browser-worker"
$workerBundle = Join-Path $repoRoot "apps\browser-worker\dist\worker.cjs"
$nodeVersion = "22.21.0"
$archive = Join-Path $env:RUNNER_TEMP "entitymanager-node-win-x64.zip"
$extractRoot = Join-Path $env:RUNNER_TEMP "entitymanager-node-win-x64"
if (-not (Test-Path $workerBundle)) { throw "Browser Worker bundle is missing. Run pnpm browser-worker:build first." }
Remove-Item $destination -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$url = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
Write-Host "Downloading portable Node.js $nodeVersion for Browser Worker..."
Invoke-WebRequest -Uri $url -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $extractRoot -Force
$nodeExe = Join-Path $extractRoot "node-v$nodeVersion-win-x64\node.exe"
if (-not (Test-Path $nodeExe)) { throw "Portable node.exe was not found after extraction." }
Copy-Item $nodeExe (Join-Path $destination "node.exe") -Force
Copy-Item $workerBundle (Join-Path $destination "worker.cjs") -Force
$playwrightPackage = (& pnpm --filter "@entitymanager/browser-worker" exec node -e "console.log(require.resolve('playwright-core/package.json'))" | Select-Object -Last 1).Trim()
if (-not (Test-Path $playwrightPackage)) { throw "Could not resolve playwright-core package for staging." }
$playwrightRoot = Split-Path $playwrightPackage -Parent
$runtimeModules = Join-Path $destination "node_modules"
New-Item -ItemType Directory -Path $runtimeModules -Force | Out-Null
Copy-Item $playwrightRoot (Join-Path $runtimeModules "playwright-core") -Recurse -Force
Set-Content -Path (Join-Path $destination "ENTITYMANAGER_WORKER_VERSION.txt") -Value "0.1.0 / Node $nodeVersion"
Write-Host "Browser Worker staged at $destination"
