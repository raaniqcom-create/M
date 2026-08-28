'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isFresh } from '@/lib/hours';
import { BellRingIcon, CheckIcon } from './icons';
import type { Station, StationProduct } from '@/types/database';

/** How many people are waiting on this station, said to its owner.
 *
 *  The numbers are real, read from `alerts`. A fabricated count was asked for —
 *  one that would drift up and down to look alive — and the real one is larger
 *  than the example given: 614 subscribers in Ramadi against a suggested 343.
 *  So invention would have bought a smaller number at the price of the last
 *  line of the message it appears in, which promises trust. A count that is
 *  ever caught being invented takes every other figure on the platform down
 *  with it.
 *
 *  Two tones, because two situations. Red when today has gone unreported: the
 *  people are there and hearing nothing. Green when it has: the same people,
 *  named as a reason to keep going rather than a reason to feel guilty.
 *
 *  **و`muted` لئلّا يحمرَّ لوحان معاً.** فوقها الآن بطاقةُ الركود، وهي تقول
 *  الأهمَّ وتحمل الفعلَ نفسَه. ولوحان أحمران متجاوران يُقرآن عتاباً مضاعفاً
 *  على غلطةٍ واحدة، فيسقط أثرُهما معاً. فحين تظهر تلك يبقى هذا على وجهه
 *  الهادئ: العددُ خبرٌ نافع في الحالين. */
export function AudienceBanner({
  station,
  products,
  muted = false,
}: {
  station: Station;
  products: StationProduct[];
  muted?: boolean;
}) {
  const [audience, setAudience] = useState<{ watchers: number; followers: number } | null>(null);

  useEffect(() => {
    supabase
      .rpc('station_audience', { p_station: station.id })
      .then(({ data }) => data && setAudience(data as { watchers: number; followers: number }));
  }, [station.id]);

  // Nothing to say until the number is known — a banner that reads «0 شخص»
  // while loading argues against itself.
  if (!audience || audience.watchers === 0) return null;

  const updatedToday = products.some(
    (p) => p.updated_at && isFresh(p.updated_at) && new Date(p.updated_at).toDateString() === new Date().toDateString()
  );

  const n = audience.watchers.toLocaleString('en-US');
  const f = audience.followers;

  if (!updatedToday && !muted) {
    return (
      <section className="rounded-2xl border-2 border-traffic-red bg-red-50 p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-traffic-red">
          <BellRingIcon className="h-5 w-5 shrink-0" />
          {n} شخص ينتظرون خبرك اليوم
        </p>
        <p className="mt-2 text-xs leading-relaxed text-red-900">
          {n} مشتركاً في <b>{station.city}</b> فعّلوا التنبيهات ليعرفوا أين يتوفّر
          الوقود
          {f > 0 ? <> ، ومنهم <b>{f}</b> يتابعون <b>{station.name}</b> بعينها</> : null}.
          ولم تُحدَّث حالة منتجاتك اليوم بعد، فلا يصلهم عنك شيء.
        </p>
        <p className="mt-2 rounded-lg bg-white/70 p-2.5 text-xs font-bold leading-relaxed text-red-900">
          تحديثٌ واحد يكفي — ضغطة على المنتج المتوفّر، فيصلهم الإشعار في اللحظة
          نفسها بلا أي خطوة أخرى منك.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-brand-900">
        <CheckIcon className="h-5 w-5 shrink-0 text-brand" />
        {updatedToday ? `خبرك وصل اليوم إلى ${n} شخص` : `${n} شخص ينتظرون خبرك`}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-brand-900/90">
        نؤكّد لك أن <b>{n}</b> مشتركاً في <b>{station.city}</b> على المحطة التقنية
        يهتمّون بما يتوفّر في <b>{station.name}</b>
        {f > 0 ? <> ، و<b>{f}</b> منهم يتابعونك بعينك</> : null}.{' '}
        {updatedToday ? 'حدّثتَ اليوم فوصلهم خبرك.' : 'وضغطةُ التأكيد أعلاه تُوصله إليهم.'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-brand-800">
        {updatedToday
          ? 'استمرّ على هذا: أنت تكسب زبائنك، ونحن نكسب ثقتهم.'
          : 'أنت تكسب زبائنك، ونحن نكسب ثقتهم — والأمر ضغطةٌ واحدة.'}
      </p>
    </section>
  );
}
