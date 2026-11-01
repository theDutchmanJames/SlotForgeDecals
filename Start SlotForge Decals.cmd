@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  echo Dependencies are missing. Install Node.js, then run npm install in this folder.
  pause
)
