@echo off
setlocal
cd /d "%~dp0"
set "EHS_HOME_DIR=%USERPROFILE%\VIETCHEM_EHS"
node scripts\data-status.mjs
pause
