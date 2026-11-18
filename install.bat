@echo off
title beecord installer
rem Requires Node.js (https://nodejs.org). Extract this whole folder first, then double-click install.bat.
echo Installing beecord...
echo.
node "%~dp0data\install.js"
if errorlevel 1 (
  echo.
  echo === Install failed. Make sure Node.js is installed ^(https://nodejs.org^), then run install.bat again. ===
)
echo.
echo Done. If Discord is open, it will restart to apply beecord.
pause
