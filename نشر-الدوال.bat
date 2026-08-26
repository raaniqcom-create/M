@echo off
chcp 65001 >nul
title نشر دوال المحطة التقنية
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════════
echo    نشر دوال المحطة التقنية على Supabase
echo ════════════════════════════════════════════════════
echo.
echo  سينشر ثلاث دوال:
echo.
echo    notify            - لا اشعار من محطة مغلقة
echo                        + الباب الذي يجعل البوت يعلن للجميع
echo    notify-favorites  - لا اشعار من محطة مغلقة (مسار البوتات)
echo    telegram          - البوت يعلن لكل المشتركين
echo                        + يعرف الاغلاق المؤقت
echo.
echo  اضغط اي زر للبدء، او اغلق النافذة للالغاء.
echo.
pause >nul

echo.
echo  [1/2] تسجيل الدخول الى Supabase...
echo.
echo  ستفتح نافذة المتصفح. وافق منها، ثم عد الى هنا وانتظر.
echo  (اذا كنت مسجلا من قبل، سيتخطاها فورا)
echo.
call npx --yes supabase login
if errorlevel 1 goto failed

echo.
echo  [2/2] نشر الدوال الثلاث... قد تستغرق دقيقة.
echo.
call npx --yes supabase functions deploy notify notify-favorites telegram --project-ref snlafcvuoxpxcdbtinsy
if errorlevel 1 goto failed

echo.
echo ════════════════════════════════════════════════════
echo    تم النشر بنجاح
echo ════════════════════════════════════════════════════
echo.
echo  للتاكد، جرب هذين:
echo.
echo   1) افتح لوحة محطة مغلقة واضغط "تاكيد"
echo      يجب ان يقول: "محطتك مغلقة الان - حفظت الحالة، ولم يرسل اشعار."
echo.
echo   2) بدل منتجا من بوت تيليجرام
echo      يجب ان يصل الاشعار الى هاتفك ايضا، لا الى تيليجرام وحده.
echo.
pause
exit /b 0

:failed
echo.
echo ════════════════════════════════════════════════════
echo    لم يكتمل النشر
echo ════════════════════════════════════════════════════
echo.
echo  انسخ اخر سطور الخطا اعلاه وارسلها.
echo  لا ترسل اي رمز او توكن - رسالة الخطا وحدها تكفي.
echo.
pause
exit /b 1
