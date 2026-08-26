'use client';

/** آخر حاجز: ما يسقط في التخطيط الجذري نفسه.
 *
 *  error.tsx يلتقط ما يسقط داخل الصفحة، ولا يلتقط ما يسقط في التخطيط الذي
 *  يحويها — وذاك بالضبط ما يُنتج شاشةً بيضاء لا شيء فيها إطلاقاً.
 *
 *  ولذلك يحمل هذا الملفّ وسمَي html وbody بنفسه: التخطيط الذي كان يوفّرهما
 *  هو الذي سقط. وأنماطُه مكتوبة في السطر لا بأصناف — ملفّ الأنماط قد يكون
 *  جزءاً ممّا لم يُحمَّل. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>تعذّر تشغيل التطبيق</h1>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.8, color: '#475569', maxWidth: '30rem' }}>
          حدث خلل في هذا الجهاز أو المتصفّح. بياناتك ومحطاتك سليمة على الخادم.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '6px',
            minHeight: '48px',
            padding: '0 28px',
            border: 0,
            borderRadius: '12px',
            background: '#16a34a',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 800,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          أعد المحاولة
        </button>
        {/* السبب مكتوبٌ ليُنسخ في رسالة إلى الإدارة: بلا نصّ الخطأ يبقى
            التشخيص تخميناً، وهذه الشاشة تظهر على أجهزةٍ لا نملكها. */}
        <p
          dir="ltr"
          style={{
            marginTop: '18px',
            fontSize: '11px',
            lineHeight: 1.7,
            color: '#94a3b8',
            wordBreak: 'break-word',
            maxWidth: '30rem',
          }}
        >
          {error?.message || 'unknown error'}
          {error?.digest ? ` · ${error.digest}` : ''}
        </p>
      </body>
    </html>
  );
}
