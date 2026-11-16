@echo off
title beecord safe mode
rem Starts Discord without beecord plugins and themes (the beecord settings tab still works).
rem Use it when a plugin makes Discord freeze or crash. Leave safe mode in Discord: Settings > beecord > Status.
cd /d "%~dp0"
echo delete this file (or use the button in beecord ^> Status) to leave safe mode> "%~dp0..\safe-mode"
echo Safe mode is ON. Restarting Discord...
taskkill /f /im Discord.exe >nul 2>&1
timeout /t 2 /nobreak >nul
start "" "%LOCALAPPDATA%\Discord\Update.exe" --processStart Discord.exe
echo Done. To leave safe mode: Discord Settings ^> beecord ^> Status ^> Leave safe mode.
pause
