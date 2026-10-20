!macro ENTITYMANAGER_STOP_RUNTIME
  DetailPrint "Stopping EntityManager runtime before updating files..."

  ; Stop the Desktop process tree first. /T also closes the Browser Worker when
  ; it is still a child of EntityManager. A non-zero result is harmless when
  ; the app is already closed.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM EntityManager.exe'
  Sleep 1200

  ; The worker may survive a forced Desktop shutdown. Its exact PID is written
  ; to app data at launch, so stop that process before touching bundled files.
  ; This avoids killing unrelated Node.js applications on the machine.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$$pidFile = Join-Path $$env:LOCALAPPDATA ''com.entitymanager.desktop\browser-worker.pid''; if (Test-Path -LiteralPath $$pidFile) { $$workerPidText = (Get-Content -LiteralPath $$pidFile -Raw).Trim(); $$workerPid = 0; if ([int]::TryParse($$workerPidText, [ref]$$workerPid)) { Stop-Process -Id $$workerPid -Force -ErrorAction SilentlyContinue; Wait-Process -Id $$workerPid -Timeout 10 -ErrorAction SilentlyContinue } }"'
  Sleep 1200

  ; Builds before 311 could leave the bundled portable Node worker orphaned.
  ; Match its exact executable path so unrelated Node.js applications remain
  ; untouched. NSIS requires $$ for PowerShell's $ variables.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$$target = [System.IO.Path]::GetFullPath(''$INSTDIR\resources\browser-worker\node.exe''); Get-CimInstance Win32_Process -Filter ''Name = ''''node.exe'''''' | Where-Object { $$_.ExecutablePath -and ([System.IO.Path]::GetFullPath($$_.ExecutablePath) -eq $$target) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Sleep 2000
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro ENTITYMANAGER_STOP_RUNTIME
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro ENTITYMANAGER_STOP_RUNTIME
!macroend
