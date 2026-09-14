'use client';

import { useEffect, useState } from 'react';
import { baghdadDate } from '@/lib/board';
import { PARITY_LABEL, RATION, dayParity, shortDate, turnFor } from '@/lib/ration';
import { CarIcon } from './icons';

/** سطرُ «دوري» في الرئيسية — سطرٌ واحد يفتح /dori، لا بطاقةٌ في وسط الصفحة.
 *
 *  «وجودُه في وسط الصفحة شكّك الجميعَ بعدم وجود وقود!» — صاحبُ المنصّة:
 *  بطاقةٌ بيضاء بحقلٍ فارغ حيث ينتظر القارئُ المحطاتِ تُقرأ «لا وقود». فصار
 *  سطراً بارتفاع زرّ: من كتب لوحتَه يرى دورَه اليوم، ومن لم يكتبها يُدعى —
 *  والبطاقةُ كاملةً في /dori. */
export function PlateTurnStrip() {
  const [digit, setDigit] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('plate-last');
      if (saved !== null && /^\d$/.test(saved)) setDigit(Number(saved));
    } catch {
      /* تصفّحٌ خاصّ */
    }
  }, []);

  if (!RATION.active) return null;
  const today = baghdadDate();
  const turn = digit === null ? null : turnFor(String(digit), today);

  const cls =
    'mb-3 flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-bold leading-snug';
  if (!turn) {
    return (
      <a href="/dori" className={`${cls} border-brand-100 bg-brand-50 text-brand-900`}>
        <CarIcon className="h-5 w-5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          اعرف دورك في البنزين — <span className="font-normal">أدخل رقم لوحتك مرّةً واحدة</span>
        </span>
        <span aria-hidden className="text-lg leading-none text-brand-700">‹</span>
      </a>
    );
  }
  const ok = turn.todayOk;
  return (
    <a
      href="/dori"
      className={`${cls} ${ok ? 'border-brand-100 bg-brand-50 text-brand-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
    >
      <CarIcon className={`h-5 w-5 shrink-0 ${ok ? 'text-brand' : 'text-amber-600'}`} />
      <span className="min-w-0 flex-1 leading-snug">
        {ok
          ? `✅ دورُك اليوم (${PARITY_LABEL[dayParity(today)]}) — لوحتُك تنتهي بـ${digit}`
          : `⏳ ليس دورَك اليوم — دورُك ${turn.nextOk === baghdadDate(1) ? 'غداً' : `يوم ${shortDate(turn.nextOk)}`}`}
      </span>
      <span className="shrink-0 text-[11px] font-bold text-brand-700">المحطات ‹</span>
    </a>
  );
}
