@echo off
rem beecord themed installer (opens the dark imgui-style window).
rem Needs Node.js (nodejs.org) and Discord launched at least once.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -Sta -WindowStyle Hidden -File "%~dp0installer\beecord-setup.ps1"
