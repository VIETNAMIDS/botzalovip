@echo off
echo 🔄 Đang restart bot để load lệnh Liên Quân mới...
echo.

REM Tìm và kill process node hiện tại
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul

echo ✅ Đã dừng bot cũ
echo 🚀 Đang khởi động bot mới...
echo.

REM Khởi động bot
start "Zeid Bot" cmd /k "node index.js"

echo ✅ Bot đã được restart!
echo 🎮 Bây giờ bạn có thể dùng lệnh: lienquan, lq, aov
echo.
pause
