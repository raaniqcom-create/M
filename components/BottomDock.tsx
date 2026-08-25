'use client';

import { useEffect, useState } from 'react';
import { useSiteStats } from '@/lib/useSiteStats';
import { NewsTicker } from './NewsTicker';
import { CrosshairIcon, ListIcon, MapIcon, SearchIcon, UserIcon } from './icons';
import type { StationWithStatus } from '@/types/database';

/** خمسة أزرار في متناول الإبهام، والشريط المتحرك تحتها.
 *
 *  وهذا ما حلّ خلافاً في التصميم: كنتُ أقترح حذف عدّادَي الزوار والمتصلين
 *  والشريط المتحرك لأنها تحتلّ أعلى الشاشة قبل أن يرى القارئ محطةً واحدة.
 *  ونقلُها إلى الأسفل يُبقيها ولا يكلّف الشاشة الأولى بكسلاً — وهو أفضل من
 *  حذفها، لأنها كانت تُقرأ فعلاً حين تُقرأ.
 *
 *  والعدّاد يتبدّل كل ثلاث ثوانٍ بين المتصلين والزوار. وهو المؤقّت نفسه
 *  الذي حُذف من الترويسة — لكنه هنا داخل مكوّنٍ لا يحمل غير رقمه، فيُعاد
 *  رسم شارةٍ واحدة لا الصفحة كلها ببطاقاتها ومحطاتها. الفرق ليس في المدّة
 *  بل في اتّساع ما يُعاد رسمه. */
export function BottomDock({
  view,
  near,
  stationCount,
  onList,
  onMap,
  onNear,
  onSearch,
  onAccount,
  stations,
  showTicker = true,
}: {
  view: 'list' | 'map';
  near: boolean;
  stationCount: number;
  onList: () => void;
  onMap: () => void;
  onNear: () => void;
  onSearch: () => void;
  onAccount: () => void;
  stations: StationWithStatus[];
  showTicker?: boolean;
}) {
  const { visits, online } = useSiteStats();
  const [flip, setFlip] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFlip((f) => f + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const live = flip % 2 === 0;
  const value = live ? online : visits;
  const word = live ? 'متصل' : 'زائر';

  const listActive = view === 'list' && !near;
  const mapActive = view === 'map' && !near;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,.07)]">
      <div className="mx-auto grid max-w-md grid-cols-5 overflow-visible">
        <Tab label="بحث وفلاتر" onClick={onSearch}>
          <SearchIcon className="h-5 w-5" />
        </Tab>

        <Tab label="قائمة" active={listActive} onClick={onList}>
          <ListIcon className="h-5 w-5" />
        </Tab>

        {/* في الوسط، وأكبر، وأخضر.
          *
          *  «أقرب محطة» ليست وجهاً ثالثاً للعرض بل الجواب المباشر على السؤال
          *  الذي يُفتح التطبيق من أجله: أين أجد وقوداً قريباً الآن؟ وستّة
          *  آلاف من سبعة آلاف زائر بلا اشتراك — لا مدينةَ محفوظة لهم، فالقُرب
          *  هو ما يخدمهم وحده. فيأخذ موضع الإبهام ولونَ المنصّة. */}
        <Tab label="أقرب محطة" active={near} onClick={onNear} hero>
          <CrosshairIcon className="h-7 w-7" />
        </Tab>

        <Tab label="خريطة" active={mapActive} onClick={onMap} badge={stationCount}>
          <MapIcon className="h-5 w-5" />
        </Tab>

        {/* رقمٌ واحد يتبدّل، لا رقمان متجاوران. والنقطة تنبض للمتصلين
            وحدهم — «زائر» رقمٌ تراكمي لا حالة لحظية، ونبضُه يكذب. */}
        <Tab label={`${value ?? '—'} ${word}`} onClick={onAccount} muted>
          <span key={flip} className="flex items-center gap-1 animate-[fade-slide_.45s_ease]">
            {live && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-blink" />}
            <UserIcon className="h-5 w-5" />
          </span>
        </Tab>
      </div>

      {showTicker && <NewsTicker stations={stations} />}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  );
}

function Tab({
  label,
  children,
  onClick,
  active = false,
  badge,
  muted = false,
  hero = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: number;
  muted?: boolean;
  /** الزرّ الأوسط: قرصٌ أخضر مرفوع، لا أيقونةٌ رمادية كأخواتها. */
  hero?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex min-h-[52px] flex-col items-center justify-end gap-1 px-0.5 pb-2 transition-colors ${hero ? 'pt-2' : 'pt-2'} ${
        hero ? 'text-brand-700' : active ? 'text-brand' : 'text-slate-500'
      }`}
    >
      {active && !hero && (
        <span className="absolute inset-x-[22%] top-0 h-[2.5px] rounded-b-[3px] bg-brand" />
      )}
      {badge != null && badge > 0 && (
        <span className="absolute top-1 end-[calc(50%-21px)] rounded-full bg-brand px-1.5 text-[8.5px] font-extrabold leading-[1.5] text-white">
          {badge}
        </span>
      )}
      {hero ? (
        <span
          className={`-mt-5 grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_6px_16px_rgba(22,163,74,.45)] ring-4 ring-white transition-colors ${
            active ? 'bg-brand-700' : 'bg-brand'
          }`}
        >
          {children}
        </span>
      ) : (
        children
      )}
      <span
        className={`text-[9px] font-bold leading-tight ${muted ? 'tabular-nums' : ''}`}
        dir={muted ? 'rtl' : undefined}
      >
        {label}
      </span>
    </button>
  );
}
