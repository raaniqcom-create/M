'use client';

import { useEffect } from 'react';

/** ما يُعرض حين يسقط شيء — بدل الشاشة البيضاء.
 *
 *  المشروع كان بلا حاجز خطأ إطلاقاً. وخطأٌ واحد في أي مكوّن — واجهةٌ غائبة عن
 *  متصفّح قديم، حقلٌ ناقص في صفّ، شبكةٌ ترمي في غير موضعها — يُفكّك شجرة React
 *  كلها فيرى المستخدم بياضاً. ولا رسالة ولا زرّ ولا سبب: لا يعرف أهو هاتفه أم
 *  شبكته أم المنصّة، فيحذف التطبيق.
 *
 *  وهذا حاجز Next.js نفسه، لا شيئاً مبتكَراً — ملفٌّ باسمٍ محفوظ في مجلّد
 *  المسار، والإطار يلتقطه ويعرضه مكان ما سقط. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // يُطبع في سجلّ المتصفّح ليُقرأ عند التشخيص. ولا يُرسل إلى أحد: النصّ قد
    // يحمل مسارات وبيانات، وإرسالها بلا إذنٍ ليس من شأننا.
    console.error('[muhta] سقط عرض الصفحة:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50">
        <svg
          className="h-7 w-7 text-traffic-red"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
      </div>

      <h1 className="mt-4 text-lg font-extrabold text-slate-800">تعذّر عرض الصفحة</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        حدث خلل مؤقّت في هذا الجهاز. بياناتك ومحطاتك سليمة — أعد المحاولة.
      </p>

      <button type="button" onClick={reset} className="btn-primary mt-6 w-full">
        أعد المحاولة
      </button>
      <a href="/" className="btn-ghost mt-2 w-full">
        العودة إلى الرئيسة
      </a>

      {/* رمزُ الخطأ إن وُجد: يُقرأ في رسالةٍ إلى الإدارة فيُعرف أيّ بناءٍ سقط. */}
      {error.digest && (
        <p className="mt-6 text-[10px] text-slate-300" dir="ltr">
          {error.digest}
        </p>
      )}
    </main>
  );
}
