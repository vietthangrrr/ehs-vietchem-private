@echo off
setlocal
cd /d "%~dp0"
set "EHS_HOME_DIR=%USERPROFILE%\VIETCHEM_EHS"
echo =====================================================
echo  NHAN DU LIEU TU BAN EHS CU -> PERSISTENT DATA STORE
echo  Target: %EHS_HOME_DIR%
echo =====================================================
echo Hay tat app cu va app moi truoc khi tiep tuc.
set /p "OLD=Dan duong dan thu muc app cu (thu muc co data\ehs.sqlite): "
if "%OLD%"=="" exit /b 1
if exist "%EHS_HOME_DIR%\Data\ehs.sqlite" (
  echo Persistent database da ton tai.
  set /p "ANS=Ban co chac muon backup roi thay bang data ban cu? (Y/N): "
  if /I not "%ANS%"=="Y" exit /b 0
  node scripts\adopt-legacy-data.mjs "%OLD%" --replace
) else (
  node scripts\adopt-legacy-data.mjs "%OLD%"
)
if errorlevel 1 (
  echo Migration data that bai. Khong khoi dong app moi.
  pause
  exit /b 1
)
echo Xong. Chay start-windows.bat de app tu migrate schema.
pause
