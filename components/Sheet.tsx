'use client';

import { useEffect } from 'react';

/** ورقةٌ تنزلق من أسفل الشاشة.
 *
 *  ثلاثة أشياء يخطئ فيها كل تنفيذٍ مرتجل، وهي هنا:
 *  · الخلفية تُغلقها، ومفتاح Escape كذلك — لا زرَّ إغلاقٍ وحده.
 *  · وتمرير الصفحة تحتها يُمنع، وإلا تحرّك ما خلف الورقة تحت الإبهام.
 *  · وتُركَّب دائماً وتُخفى بالإزاحة لا بالحذف، فتنزلق داخلةً وخارجة. */
export function Sheet({
  open,
  onClose,
  title,
  hint,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-slate-900/50 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        className={`fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[82%] max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-200" />
        <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
        {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
        <div className="mt-3">{children}</div>
      </div>
    </>
  );
}
