'use client';

import { useEffect, useState } from 'react';
import { PlateTurn } from './PlateTurn';
import { useAlertChoice } from '@/lib/alerts';
import { SpinnerIcon } from './icons';
import { loadCachedStations, loadStations } from '@/lib/stations';
import { RATION } from '@/lib/ration';
import type { StationWithStatus } from '@/types/database';

/** صفحةُ «دوري» تحمل المحطاتِ بنفسها — الرئيسيةُ تحملها والبطاقةُ هناك تأخذها
 *  منها؛ هنا لا رئيسيةَ، فتُجلب (ومن اللقطة المحفوظة أوّلاً إن وُجدت). */
export function DoriScreen() {
  // فارغةٌ عند الترطيب — الصفحةُ مُصدَّرةٌ ساكنةً، واللقطةُ المحفوظة تُقرأ بعده
  // لا في المُهيّئ، وإلّا اختلف ما بُني عمّا يُعرض.
  const [stations, setStations] = useState<StationWithStatus[] | null>(null);
  const [err, setErr] = useState(false);
  const { choice } = useAlertChoice();

  useEffect(() => {
    let alive = true;
    const cached = loadCachedStations();
    if (cached) setStations(cached.rows);
    loadStations()
      .then((rows) => alive && setStations(rows))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!RATION.active) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-bold text-slate-700">انتهى العملُ بنظام الفرديّ والزوجيّ.</p>
        <a href="/" className="btn-ghost mt-4 inline-flex px-6">
          المحطات الآن
        </a>
      </div>
    );
  }

  if (!stations) {
    return (
      <div className="flex justify-center py-10">
        {err ? (
          <p className="text-sm text-slate-500">تعذّر جلبُ المحطات — تحقّق من اتصالك.</p>
        ) : (
          <SpinnerIcon className="h-6 w-6 text-brand" />
        )}
      </div>
    );
  }

  return <PlateTurn stations={stations} choice={choice} />;
}
