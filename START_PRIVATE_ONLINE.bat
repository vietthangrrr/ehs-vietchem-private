@echo off
setlocal
cd /d "%~dp0"
set "EHS_HOME_DIR=%USERPROFILE%\VIETCHEM_EHS"
echo ========================================================
echo  VIETCHEM EHS CP7.0A - PERSONAL PRIVATE ONLINE
echo  Access: Tailscale only - no public Internet exposure
echo  Data:   %EHS_HOME_DIR%
echo ========================================================
echo [1/2] Private-online preflight...
node scripts\personal-online-preflight.mjs
if errorlevel 1 (
  echo.
  echo Private Online chua san sang. Xem loi phia tren.
  echo Doc: TAILSCALE_SETUP_VN.md
  pause
  exit /b 1
)
echo [2/2] Starting private EHS server...
node scripts\start-personal-private.mjs
pause
