'use client';

import { useEffect, useRef } from 'react';
import { SUSPENDED_LABEL, silentFor } from '@/lib/silence';
import { recordSuspendedSeen } from '@/lib/silenceViews';
import type { StationWithStatus } from '@/types/database';

/** الموقوفاتُ بسبب عدم النشر — قسمٌ رماديٌّ بعنوانٍ أحمر في الرئيسية.
 *
 *  تُعدّ مشاهدةً حين يدخل القسمُ الشاشةَ فعلاً (IntersectionObserver)، لا حين
 *  تُبنى الصفحة: من لم يمرّر إليه لم «يقرأ أنّها موقوفة». */
export function SuspendedList({ stations }: { stations: StationWithStatus[] }) {
  const ref = useRef<HTMLElement>(null);
  const ids = stations.map((s) => s.id).join(',');

  useEffect(() => {
    const el = ref.current;
    if (!el || !ids) return;
    if (typeof IntersectionObserver === 'undefined') {
      void recordSuspendedSeen(ids.split(','));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void recordSuspendedSeen(ids.split(','));
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ids]);

  if (!stations.length) return null;

  return (
    <section
      ref={ref}
      className="card border-slate-200 bg-slate-100 p-3"
      aria-label="محطات موقوفة بسبب عدم النشر"
    >
      <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold text-traffic-red">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-traffic-red">موقوفة</span>
        {SUSPENDED_LABEL}
        <span className="text-[11px] font-bold text-slate-400">({stations.length})</span>
      </h2>
      <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">
        محطاتٌ لم تنشر حالتها منذ أكثر من ثلاثة أيام، فلا يُعتمد على ما فيها.
      </p>
      <ul className="mt-1 divide-y divide-slate-200">
        {stations.map((s) => (
          <li key={s.id}>
            <a
              href={`/station/${s.id}`}
              className="flex min-h-[44px] items-center justify-between gap-2 py-1.5"
            >
              <span className="min-w-0 truncate text-[12.5px] font-bold text-slate-500">
                {s.name} <span className="font-normal text-slate-400">· {s.city}</span>
              </span>
              <span className="shrink-0 text-[10.5px] font-extrabold text-traffic-red">
                {silentFor(s)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
