'use client';

import { useEffect, useState } from 'react';
import { SpinnerIcon } from './icons';

const THRESHOLD = 80;

/** سحبُ الشاشة إلى الأسفل يُحدّث الصفحة — كما في كلّ تطبيق.
 *
 *  WKWebView وWebView أندرويد لا يملكان هذا بأنفسهما، وطلبُ صاحب المنصّة
 *  صريح: «عند سحب الشاشة إلى الأسفل تتحدّث الصفحة». فيُقاس السحبُ باللمس من
 *  أعلى الصفحة (`scrollY === 0`)، وعند ثمانين بكسلاً يُعاد التحميل.
 *
 *  ولا يعمل فوق الخريطة ولا داخل نافذةٍ منبثقة: سحبُ الخريطة تنقّلٌ فيها لا
 *  تحديثٌ للصفحة، والمنبثقةُ تُمرَّر داخلها والصفحةُ خلفها ثابتة. وسحبُ
 *  المتصفّح الأصليُّ (كروم أندرويد) يُطفأ في `globals.css` كي لا يقع مرّتين. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let startY = 0;
    let active = false;

    const skip = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('.leaflet-container, [role="dialog"], textarea');

    const onStart = (e: TouchEvent) => {
      active = window.scrollY <= 0 && !skip(e.target);
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || busy) return;
      const d = e.touches[0].clientY - startY;
      // نصفُ المسافة: مقاومةٌ تجعل السحبَ محسوساً لا قفزاً
      setPull(d > 0 ? Math.min(d / 2, THRESHOLD + 20) : 0);
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      setPull((p) => {
        if (p >= THRESHOLD) {
          setBusy(true);
          window.location.reload();
          return p;
        }
        return 0;
      });
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    // والإلغاءُ (النظامُ أخذ اللمسة) يُلغي — لا يُحدّث.
    const onCancel = () => {
      active = false;
      setPull(0);
    };
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [busy]);

  if (pull <= 0 && !busy) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[95] flex justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', transform: `translateY(${busy ? 0 : pull - 48}px)` }}
    >
      <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-brand-800 shadow-soft">
        {busy || pull >= THRESHOLD ? (
          <>
            <SpinnerIcon className="h-4 w-4" />
            {busy ? 'جارٍ التحديث…' : 'حرّر للتحديث'}
          </>
        ) : (
          '↓ اسحب للتحديث'
        )}
      </span>
    </div>
  );
}
