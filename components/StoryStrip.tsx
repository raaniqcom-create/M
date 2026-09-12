'use client';

import { useEffect, useMemo, useState } from 'react';
import { FuelIcon } from './icons';
import { StoryViewer } from './StoryViewer';
import { ageLabel } from '@/lib/hours';
import { isSeen, storiesFor } from '@/lib/stories';
import type { AlertChoice } from '@/lib/alerts';
import type { StationWithStatus } from '@/types/database';

/** شريطُ «حالة المحطة» — حلقاتٌ خضراء بأسماءٍ قصيرة، كحالات إنستغرام.
 *
 *  طلبُ صاحب المنصّة: «دائرةٌ بالأخضر مع اسم المحطة فقط، وعند الدخول صورةُ
 *  إعلان توفّر المنتج، وتنتهي عند النفاد وتبقى ٢٤ ساعة، ولكلّ حسابٍ حسب
 *  اهتماماته». والقصصُ تُشتقّ في `lib/stories.ts` من المحطات التي تحملها
 *  الصفحةُ أصلاً — فلا جلبَ ولا تخزين. */
export function StoryStrip({
  stations,
  choice,
  withNews = true,
}: {
  stations: StationWithStatus[];
  choice: AlertChoice | null;
  /** قصّةُ «جديد المحطة» أوّلَ الشريط — تُحجب في المعاينة عن غير الإدارة. */
  withNews?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  // «رُئيت» تُقرأ من localStorage — فتُعاد الحسبةُ بعد الإغلاق لتصير الحلقةُ رماديّة.
  const [tick, setTick] = useState(0);
  const stories = useMemo(
    () => storiesFor(stations, choice).filter((s) => withNews || s.kind !== 'platform'),
    [stations, choice, withNews, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (open === null) setTick((t) => t + 1);
  }, [open]);

  if (!stories.length) return null;

  return (
    <>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-3 overflow-x-auto px-4 pt-1" aria-label="حالة المحطات">
        {stories.map((s, i) => {
          const seen = isSeen(s.id, s.at);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`حالة ${s.name} — أُكّد ${ageLabel(s.at)}`}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`flex h-[60px] w-[60px] items-center justify-center rounded-full p-[3px] ${
                  seen ? 'bg-slate-200' : 'bg-gradient-to-tr from-brand-700 via-brand to-emerald-300'
                }`}
              >
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white">
                  {s.kind === 'platform' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/icons/icon-192.png" alt="" width={48} height={48} className={`h-full w-full ${seen ? 'opacity-60 grayscale' : ''}`} />
                  ) : (
                    <FuelIcon className={`h-6 w-6 ${seen ? 'text-slate-400' : 'text-brand'}`} />
                  )}
                </span>
              </span>
              <span className={`w-full truncate text-center text-[10.5px] font-bold ${seen ? 'text-slate-400' : 'text-slate-700'}`}>
                {s.short}
              </span>
            </button>
          );
        })}
      </div>

      {open !== null && (
        <StoryViewer stories={stories} start={open} stations={stations} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
