@echo off
setlocal
cd /d "%~dp0"
set "EHS_HOME_DIR=%USERPROFILE%\VIETCHEM_EHS"
set "HOST=127.0.0.1"
set "EHS_ENABLE_LEGAL_WATCH=0"
set "EHS_AUTO_BACKUP=1"
echo ========================================================
echo  VIETCHEM EHS CP7.0A - LOCAL FALLBACK
echo  URL: http://127.0.0.1:8787
echo  Data: %EHS_HOME_DIR%
echo ========================================================
node scripts\preflight.mjs
if errorlevel 1 (pause & exit /b 1)
node server.mjs
pause
