'use client';

import { useEffect, useState } from 'react';
import { baghdadDate } from '@/lib/board';
import { RATION, dayParity, PARITY_LABEL, shortDate, turnFor } from '@/lib/ration';

/** سطرُ الفرديّ والزوجيّ فوق الجدول — **لمن كتب لوحتَه فقط**.
 *
 *  «اربط الجدولَ بنظام الزوجيّ والفرديّ بالنسبة لمن يبحث فقط عن طريق لوحة
 *  السيّارة، وباقي الأمور تبقى كما هي» — صاحبُ المنصّة. فمن لم يكتب لوحتَه
 *  لا يرى شيئاً هنا، ومن كتبها يقرأ فوق جدول اليوم المعروض: أهو دورُه فيه. */
export function PlateTurnBadge({ day, dark = false }: { day: string; dark?: boolean }) {
  const [digit, setDigit] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('plate-last');
      if (saved !== null && /^\d$/.test(saved)) setDigit(Number(saved));
    } catch {
      /* تصفّحٌ خاصّ */
    }
  }, []);

  if (!RATION.active || digit === null || day < RATION.from) return null;
  const turn = turnFor(String(digit), day);
  if (!turn) return null;

  const when = day === baghdadDate() ? 'اليوم' : day === baghdadDate(1) ? 'غداً' : `يوم ${shortDate(day)}`;
  const ok = turn.todayOk;
  const cls = dark
    ? ok
      ? 'bg-white/20 text-white'
      : 'bg-amber-300/30 text-amber-50'
    : ok
      ? 'border border-brand-100 bg-brand-50 text-brand-800'
      : 'border border-amber-200 bg-amber-50 text-amber-900';

  return (
    <p className={`rounded-xl px-3.5 py-2 text-[12px] font-bold leading-relaxed ${cls}`}>
      {ok
        ? `✅ البنزين ${when} (${PARITY_LABEL[dayParity(day)]}): دورُك — لوحتُك تنتهي بـ${digit}.`
        : `⏳ البنزين ${when} (${PARITY_LABEL[dayParity(day)]}): ليس دورَك — دورُك ${
            turn.nextOk === baghdadDate(1) ? 'غداً' : `يوم ${shortDate(turn.nextOk)}`
          }. الكازُ والغازُ لا يخصّهما القرار.`}
    </p>
  );
}
