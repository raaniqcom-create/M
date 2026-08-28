@echo off
chcp 65001 >nul
title نشر دوال المحطة التقنية
cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════════
echo    نشر دوال المحطة التقنية على Supabase
echo ════════════════════════════════════════════════════
echo.
echo  ملاحظة: الاداة كانت مسجلة بحساب اخر (GEO / BOTQ)
echo  لا يملك مشروع muhta - ولذلك لم يفتح المتصفح.
echo  سنخرج من ذلك الحساب اولا.
echo.
echo  اضغط اي زر للبدء، او اغلق النافذة للالغاء.
pause >nul

echo.
echo  [1/4] الخروج من الحساب الحالي...
echo.
echo y| call npx --yes supabase logout

echo.
echo  [2/4] تسجيل الدخول بحساب muhta...
echo.
echo  ستفتح نافذة المتصفح الان.
echo  * اذا لم تفتح: انسخ الرابط الذي سيظهر ادناه والصقه في المتصفح بنفسك.
echo  * تاكد انك داخل بحساب Supabase الذي يملك مشروع muhta.
echo.
call npx --yes supabase login
if errorlevel 1 goto failed

echo.
echo  [3/4] التحقق ان المشروع صار مرئيا...
echo.
call npx --yes supabase projects list | findstr /C:"snlafcvuoxpxcdbtinsy" >nul
if errorlevel 1 goto wrongaccount
echo  ✓ مشروع muhta مرئي.

echo.
echo  [4/4] نشر الدوال... قد تستغرق دقيقة.
echo.
call npx --yes supabase functions deploy notify notify-favorites telegram owner-daily admin-alert broadcast --project-ref snlafcvuoxpxcdbtinsy
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

:wrongaccount
echo.
echo ════════════════════════════════════════════════════
echo    الحساب لا يملك مشروع muhta
echo ════════════════════════════════════════════════════
echo.
echo  دخلت بحساب لا يظهر فيه المشروع snlafcvuoxpxcdbtinsy
echo.
echo  شغل الملف مرة اخرى، وانتبه في المتصفح الى اي بريد
echo  تدخل به - يجب ان يكون بريد الحساب الذي انشات به muhta.
echo.
pause
exit /b 1

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
