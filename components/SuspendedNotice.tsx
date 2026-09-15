'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { plural } from '@/lib/freshness';
import { SUSPENDED_LABEL, silentFor, type Silent } from '@/lib/silence';

/** بطاقةُ صاحب المحطة حين تكون موقوفةً بسبب عدم النشر — أوّلَ ما يراه.
 *
 *  «عندما يدخل يُطلب منه تحديث المنتجات»، و«كم شخصاً ظهرت له موقوفة» أداةُ
 *  الحرص. الزرُّ ينزل به إلى لوحة المنتجات وزرِّ النشر الأخضر. */
export function SuspendedNotice({ station }: { station: Silent & { id: string } }) {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      .rpc('silence_seen_count', { p_station: station.id })
      .then(({ data }) => alive && setSeen(typeof data === 'number' ? data : 0));
    return () => {
      alive = false;
    };
  }, [station.id]);

  return (
    <section className="rounded-2xl border-2 border-traffic-red bg-red-50 p-4" role="alert">
      <p className="text-[13.5px] font-extrabold text-traffic-red">{SUSPENDED_LABEL}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
        محطتك تظهر للناس رماديّةً موقوفة، لأنّها لم تنشر حالتها {silentFor(station)}.
        {seen !== null && seen > 0 && (
          <>
            {' '}
            رآها موقوفةً <b className="text-traffic-red">{plural(seen, 'شخصٌ واحد', 'شخصان', 'أشخاص', 'شخصاً')}</b> حتى الآن.
          </>
        )}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
        حدّث المنتجات واضغط الزرَّ الأخضر — ولو لتقول «لا وقود» — فتعود محطتك فوراً ويُصفَّر العدّاد.
      </p>
      <a href="#products-panel" className="btn-primary mt-3 w-full">
        حدّث المنتجات الآن
      </a>
    </section>
  );
}
