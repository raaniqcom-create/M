@echo off
chcp 65001 >nul
title نشر دوال المحطة التقنية
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════════
echo    نشر دالتي الاشعارات على Supabase
echo ════════════════════════════════════════════════════
echo.
echo  هذا يمنع المحطات المغلقة من ارسال اشعارات.
echo  شرطه: ان تكون قد نفذت SQL في لوحة Supabase اولا.
echo.
pause

echo.
echo  [1/2] تسجيل الدخول الى Supabase...
echo  ستفتح نافذة المتصفح — وافق منها، ثم عد الى هنا.
echo.
call npx --yes supabase login
if errorlevel 1 goto failed

echo.
echo  [2/2] نشر الدالتين...
echo.
call npx --yes supabase functions deploy notify notify-favorites --project-ref snlafcvuoxpxcdbtinsy
if errorlevel 1 goto failed

echo.
echo ════════════════════════════════════════════════════
echo    تم النشر بنجاح
echo ════════════════════════════════════════════════════
echo.
echo  للتأكد: افتح لوحة محطة مغلقة واضغط "تأكيد".
echo  يجب ان تقول: "محطتك مغلقة الان — حفظت الحالة، ولم يرسل اشعار."
echo.
pause
exit /b 0

:failed
echo.
echo ════════════════════════════════════════════════════
echo    لم يكتمل النشر
echo ════════════════════════════════════════════════════
echo.
echo  انسخ اخر سطور الخطأ اعلاه وارسلها — بلا اي رمز او توكن.
echo.
pause
exit /b 1
