'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const THRESHOLD = 80;

/** سحبُ الشاشة إلى الأسفل يُحدّث الصفحة — كما في كلّ تطبيق.
 *
 *  WKWebView وWebView أندرويد لا يملكان هذا بأنفسهما، وطلبُ صاحب المنصّة
 *  صريح: «عند سحب الشاشة إلى الأسفل تتحدّث الصفحة». فيُقاس السحبُ باللمس من
 *  أعلى الصفحة (`scrollY === 0`)، وعند ثمانين بكسلاً يُعاد التحميل.
 *
 *  ولا يعمل فوق الخريطة ولا داخل نافذةٍ منبثقة: سحبُ الخريطة تنقّلٌ فيها لا
 *  تحديثٌ للصفحة، والمنبثقةُ تُمرَّر داخلها والصفحةُ خلفها ثابتة. وسحبُ
 *  المتصفّح الأصليُّ (كروم أندرويد) يُطفأ في `globals.css` كي لا يقع مرّتين.
 *
 *  ── كإنستغرام: دائرةٌ لا كلمات، فوق الحالات لا فوق الرأس ──────────────
 *  «بدل حرّر للتحديث ضع علامةَ التحميل فوق الحالات كما في إنستغرام، ويبقى
 *  المربّعُ الأخضر» — صاحبُ المنصّة. فالمؤشّرُ دائرةٌ بيضاء تدور، تُرسَم في
 *  فتحةٍ `#pull-refresh-slot` تضعها الرئيسيةُ تحت رأسها الأخضر فوق الحالات؛
 *  والفتحةُ تتّسع مع السحب فتنزل الحالاتُ تحتها. وصفحةٌ بلا فتحة (لا رأسَ
 *  أخضرَ لها) ترى الدائرةَ نفسَها أعلاها. */
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

  const ready = busy || pull >= THRESHOLD;
  // تكبر وتدور مع السحب، وتدور وحدَها حين يُحرَّر
  const ring = (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft ${ready ? 'animate-spin' : ''}`}
      style={ready ? undefined : { transform: `rotate(${pull * 3}deg) scale(${Math.max(0.4, Math.min(1, pull / THRESHOLD))})` }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="h-5 w-5 text-brand">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </span>
  );

  const slot = document.getElementById('pull-refresh-slot');
  if (slot) {
    const h = busy ? 56 : Math.min(pull, 56);
    return createPortal(
      <div className="flex items-end justify-center overflow-hidden pb-2" style={{ height: h }}>
        {ring}
      </div>,
      slot
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[95] flex justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', transform: `translateY(${busy ? 0 : pull - 48}px)` }}
    >
      {ring}
    </div>
  );
}
