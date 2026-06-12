@echo off
chcp 65001 >nul
title He thong Check-in Su kien
cd /d "%~dp0"
echo ============================================
echo   HE THONG CHECK-IN SU KIEN
echo   Mo trinh duyet vao: http://localhost:3000
echo   (Dong cua so nay de tat he thong)
echo ============================================
start http://localhost:3000
node server.js
pause
