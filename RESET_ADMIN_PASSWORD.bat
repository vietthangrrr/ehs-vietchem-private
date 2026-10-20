@echo off
setlocal
cd /d "%~dp0"
set "EHS_HOME_DIR=%USERPROFILE%\VIETCHEM_EHS"
echo VIETCHEM EHS - Reset admin password offline
set /p "NEWPW=Nhap mat khau moi (toi thieu 10 ky tu): "
node scripts\reset-admin.mjs "%NEWPW%"
pause
