'use client';

import { useEffect, useMemo, useState } from 'react';
import { FuelIcon } from './icons';
import { StoryViewer } from './StoryViewer';
import { ageLabel } from '@/lib/hours';
import { isSeen, isVideo, storiesFor, type PlatformStoryRow, type TomorrowNoticeRow } from '@/lib/stories';
import { supabase } from '@/lib/supabase';
import type { AlertChoice } from '@/lib/alerts';
import type { OpenAnnouncement } from '@/lib/announcements';
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
  announced = [],
}: {
  stations: StationWithStatus[];
  choice: AlertChoice | null;
  /** أخبارُ المحطات غير المسجّلة — حلقاتٌ حمراء بين الخضراء. */
  announced?: OpenAnnouncement[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  // حالاتُ المنصّة من القاعدة — تكتبها الإدارةُ من «الحالات» بلا بناء.
  const [platform, setPlatform] = useState<PlatformStoryRow[]>([]);
  // تنبيهاتُ «التوزيع غداً لا اليوم» — RLS يُبقي النشطَ المرسَلَ غيرَ المنتهي.
  const [tomorrow, setTomorrow] = useState<TomorrowNoticeRow[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from('platform_stories')
      .select('id, title, lines, image_url, href, label, published_at, pinned')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(5)
      .then(({ data }) => alive && data && setPlatform(data as PlatformStoryRow[]));
    supabase
      .from('announcements')
      .select('id, title, body, subject, origin_city, cities, product, sent_at')
      .eq('kind', 'tomorrow')
      .order('sent_at', { ascending: false })
      .limit(10)
      .then(({ data }) => alive && data && setTomorrow(data as TomorrowNoticeRow[]));
    return () => {
      alive = false;
    };
  }, []);
  // «رُئيت» تُقرأ من localStorage — فتُعاد الحسبةُ بعد الإغلاق لتصير الحلقةُ رماديّة.
  const [tick, setTick] = useState(0);
  const stories = useMemo(
    () => storiesFor(stations, choice, announced, platform, tomorrow),
    [stations, choice, announced, platform, tomorrow, tick] // eslint-disable-line react-hooks/exhaustive-deps
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
          const red = s.kind === 'announced';
          const amber = s.kind === 'tomorrow';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`حالة ${s.name} — ${amber ? 'التوزيع غداً' : red ? 'أُعلن' : 'أُكّد'} ${ageLabel(s.at)}`}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`flex h-[60px] w-[60px] items-center justify-center rounded-full p-[3px] ${
                  seen
                    ? 'bg-slate-200'
                    : amber
                      ? 'bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200'
                      : red
                        ? 'bg-gradient-to-tr from-red-700 via-red-500 to-rose-300'
                        : 'bg-gradient-to-tr from-brand-700 via-brand to-emerald-300'
                }`}
              >
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white">
                  {s.kind === 'platform' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.news?.image_url && !isVideo(s.news.image_url) ? s.news.image_url : '/icons/icon-192.png'} alt="" width={48} height={48} className={`h-full w-full object-cover ${seen ? 'opacity-60 grayscale' : ''}`} />
                  ) : (
                    <FuelIcon className={`h-6 w-6 ${seen ? 'text-slate-400' : amber ? 'text-amber-500' : red ? 'text-traffic-red' : 'text-brand'}`} />
                  )}
                </span>
              </span>
              <span
                className={`w-full truncate text-center text-[10.5px] font-bold ${
                  seen ? 'text-slate-400' : amber ? 'text-amber-700' : red ? 'text-traffic-red' : 'text-slate-700'
                }`}
              >
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
