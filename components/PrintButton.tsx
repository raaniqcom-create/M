'use client';

/** زرُّ طباعة — مكوّنٌ صغيرٌ لأن الصفحةَ التي يقف فيها خادميّة.
 *
 *  `app/privacy/page.tsx` تُصدّر `metadata`، فهي مكوّنٌ خادميّ لا يمرّر
 *  `onClick`. وتحويلُ الصفحة كلِّها إلى `'use client'` كان سيُسقط عنوانَ
 *  الصفحة ووصفَها من الحزمة — ثمنٌ باهظٌ لزرّ. */
export function PrintButton({ label = 'طباعة الصفحة' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide btn-ghost mt-4 px-5 text-[12.5px]"
    >
      {label}
    </button>
  );
}
