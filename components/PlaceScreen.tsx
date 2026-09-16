'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PRODUCT_LABELS } from '@/lib/products';
import { normalizeName } from '@/lib/nearbyFuel';
import { officialFor } from '@/lib/officialStations';
import { roadCoords, wazeUrl } from '@/lib/scheduleRoute';
import { baghdadDate, loadSchedule, type ScheduleRow } from '@/lib/scheduleData';
import { MapPinIcon, SpinnerIcon } from './icons';

/** صفحةُ مكانٍ من جدول التوزيع — لمحطةٍ ليست مسجّلةً في المنصّة.
 *
 *  «يضغط عليه يخرج صفحةٌ داخل المنصّة تحتوي على اسم المحطة، العنوان، رقم
 *  الهاتف إن كان ظاهراً، الطريق لها، منتجات اليوم المعلنة بالجدول» — صاحبُ
 *  المنصّة، ١٦ أيلول. المسجّلةُ لها صفحتُها (/station/[id])؛ وهذه لغيرها:
 *  ما نعرفه من القائمة الرسميّة ومساعدِ الطريق والجدول، ولا شيءَ يُخترع. */
export function PlaceScreen() {
  const params = useSearchParams();
  const name = (params.get('n') ?? '').trim();
  const city = (params.get('c') ?? '').trim() || null;
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);

  useEffect(() => {
    if (!name) return;
    let alive = true;
    const key = normalizeName(name);
    loadSchedule()
      .then((all) => {
        if (!alive) return;
        setRows(all.filter((r) => normalizeName(r.station_name) === key && (!city || !r.city || r.city === city)));
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [name, city]);

  if (!name) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لا محطةَ في الرابط. <a href="/schedule" className="font-bold text-brand underline">جدول التوزيع</a>
      </main>
    );
  }

  const official = officialFor(name);
  const address = official?.address ?? null;
  const coords = roadCoords(name, city);
  const today = baghdadDate();
  const days = new Map<string, ScheduleRow[]>();
  for (const r of rows ?? []) (days.get(r.for_date) ?? days.set(r.for_date, []).get(r.for_date)!).push(r);

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <article className="card p-5">
        <p className="text-[11px] font-bold text-slate-400">{official ? 'محطة رسميّة' : 'من جدول التوزيع'}</p>
        <h1 className="mt-1 text-lg font-extrabold leading-snug text-brand-900">{official?.name ?? name}</h1>
        {(city || official?.city) && (
          <p className="mt-0.5 text-[12px] text-slate-500">{official?.city ?? city}</p>
        )}

        <dl className="mt-4 space-y-2.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">العنوان</dt>
            <dd className="text-left font-bold text-slate-800">{address ?? 'غير مسجّل بعد'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">الهاتف</dt>
            <dd className="text-left font-bold text-slate-800">
              {/* لا رقمَ لغير المسجّلة: الرقمُ يُعرض حين يسجّل صاحبُها محطتَه. */}
              <span className="text-slate-400">غير متاح — المحطة ليست مسجّلة في المنصّة</span>
            </dd>
          </div>
        </dl>

        {coords ? (
          <a
            href={wazeUrl(coords.lat, coords.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 w-full"
          >
            <MapPinIcon className="h-4 w-4" />
            الطريق لها
          </a>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
            لا موقعَ مسجّلاً لهذه المحطة بعد، فلا طريقَ يُرسم إليها.
          </p>
        )}
      </article>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-bold">المنتجات المعلنة في الجدول</h2>
        {rows === null ? (
          <div className="flex justify-center py-6">
            <SpinnerIcon className="h-5 w-5 text-brand" />
          </div>
        ) : days.size === 0 ? (
          <p className="mt-2 text-xs text-slate-400">لا شيءَ معلناً لها اليوم أو غداً.</p>
        ) : (
          [...days.entries()].map(([d, rs]) => (
            <div key={d} className="mt-3">
              <p className="text-[11.5px] font-bold text-slate-500">
                {d === today ? 'اليوم' : d === baghdadDate(1) ? 'غداً' : d}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {rs.map((r) => (
                  <li key={r.id} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-800">
                    {PRODUCT_LABELS[r.product]}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
          إعلانٌ رسميٌّ مسبق وقد يتغيّر؛ المحطاتُ المسجّلة في المنصّة تحدّث حالتها بنفسها.
        </p>
      </section>

      <a href="/register" className="btn-ghost mt-4 w-full">
        أنت من إدارة هذه المحطة؟ سجّلها مجّاناً ليظهر رقمك وحالتك
      </a>
    </main>
  );
}
