'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AVG_KMH,
  GAP_WARN_KM,
  ON_ROAD_M,
  TRIP_POINTS,
  kmBetween,
  minutesFor,
  resolveRoutes,
  stopsFor,
  type LatLng,
} from '@/lib/geo';
import { RoadStop } from './RoadStop';
import type { GapSpan } from './RoadMap';
import { FuelIcon, MapPinIcon, SearchIcon, SpinnerIcon } from './icons';

// Leaflet يلمس window وقت الاستيراد — فلا يُصدَّر ساكناً.
const RoadMap = dynamic(() => import('./RoadMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-2xl bg-brand-50">
      <SpinnerIcon className="h-6 w-6 text-brand" />
    </div>
  ),
});

/** مساعد الطريق.
 *
 *  ثلاث خطوات لا شاشة واحدة: من أين، وإلى أين، ثم ابحث. والخريطة تسبق
 *  القائمة لأن السؤال الأول بصريّ — «كيف يبدو طريقي؟» — والقائمة جوابُ
 *  السؤال الثاني: «أين أقف؟».
 *
 *  والاتجاه ليس تفصيلاً: الطرق مزدوجة، ومحطةُ جانبٍ لا تُخدم القادم من الجهة
 *  الأخرى. قِيس على طريق بغداد فكان محطتين ذهاباً وأربعاً عودةً — وطابق ذلك
 *  ذاكرة من يقطعه يومياً. */
export function RoadPlanner() {
  const [from, setFrom] = useState('الرمادي');
  const [to, setTo] = useState('بغداد');
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null);
  const [showStops, setShowStops] = useState(false);
  /** أيّ الطرق حين يصل أكثر من واحد — السريع أولاً، والقديم خيارٌ يُعرض. */
  const [roadIdx, setRoadIdx] = useState(0);

  const routes = useMemo(() => (query ? resolveRoutes(query.from, query.to) : []), [query]);
  const route = routes[roadIdx] ?? routes[0] ?? null;
  const stops = useMemo(() => (route ? stopsFor(route) : []), [route]);

  /** بُعد نقطةٍ عن الانطلاق — تُستعمل لوضع الفجوات في مواضعها على الخطّ. */
  const distanceAt = useMemo(() => {
    const o = route?.origin;
    return (p: LatLng) => (o ? kmBetween(o, p) : 0);
  }, [route]);

  /** الفجوات: بين كل محطتين، وقبل الأولى، وبعد الأخيرة. */
  const gaps: GapSpan[] = useMemo(() => {
    if (!route) return [];
    const marks = [0, ...stops.map((s) => s.atKm), route.km];
    const out: GapSpan[] = [];
    for (let i = 0; i < marks.length - 1; i++) {
      const km = marks[i + 1] - marks[i];
      if (km >= GAP_WARN_KM) out.push({ fromKm: marks[i], toKm: marks[i + 1], km });
    }
    return out;
  }, [route, stops]);

  const tailGap = route && stops.length ? route.km - stops[stops.length - 1].atKm : 0;

  function search() {
    setShowStops(false);
    setRoadIdx(0);
    setQuery({ from, to });
  }

  return (
    <div className="space-y-3">
      <section className="card space-y-3 p-4">
        <div>
          <label htmlFor="from" className="text-xs font-bold text-slate-600">
            من أين تنطلق؟
          </label>
          <select
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            {TRIP_POINTS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="to" className="text-xs font-bold text-slate-600">
            إلى أين وجهتك؟
          </label>
          <select
            id="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
          >
            {TRIP_POINTS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button type="button" onClick={search} disabled={from === to} className="btn-primary w-full">
          <SearchIcon className="h-4 w-4" />
          ابحث عن الطريق
        </button>
        {from === to && (
          <p className="text-center text-[11px] text-slate-400">اختر وجهةً غير نقطة الانطلاق.</p>
        )}
      </section>

      {/* طريقان بين المدينتين — والفرق جوهريّ: السريع يلتفّ حول البلدات
          والقديم يمرّ بها. فيُعرض الاختيار بدل أن يُفرض واحدٌ صامتاً. */}
      {routes.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${routes.length}, minmax(0,1fr))` }}>
          {routes.map((r, i) => (
            <button
              key={r.ref}
              type="button"
              onClick={() => { setRoadIdx(i); setShowStops(false); }}
              aria-pressed={i === roadIdx}
              className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors ${
                i === roadIdx ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {query && !route && (
        <div className="card p-5 text-center">
          <p className="text-sm font-bold text-slate-700">لا نعرف طريقاً مباشراً بينهما</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            الطرق المتاحة تصل الأنبار ببغداد والمنافذ الحدودية. جرّب مدينةً على أحدها.
          </p>
        </div>
      )}

      {route && (
        <>
          <section className="card p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-brand-700">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                {route.from}
              </span>
              <span className="text-slate-400">
                {Math.round(route.km)} كم · ~{Math.round(route.km / AVG_KMH)} ساعة
              </span>
              <span className="flex items-center gap-1.5 text-[#2563eb]">
                {route.to}
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
              </span>
            </div>
            {route.note && <p className="mt-1.5 text-[10.5px] text-slate-400">{route.note}</p>}
          </section>

          <RoadMap path={route.path} stops={stops} gaps={gaps} distanceAt={distanceAt} />

          <p className="px-1 text-[10px] leading-relaxed text-slate-400">
            الخطّ يبدأ أخضرَ عند {route.from} وينتهي أزرقَ عند {route.to}.
            {gaps.length > 0 && ' والأحمر المتقطّع: امتدادٌ بلا محطة نعرفها.'}
          </p>

          {!showStops ? (
            <button type="button" onClick={() => setShowStops(true)} className="btn-primary w-full">
              <FuelIcon className="h-4 w-4" />
              أظهر المحطات على الطريق
              {stops.length > 0 && ` (${stops.length})`}
            </button>
          ) : (
            <>
              <section className="card flex items-center justify-between gap-2 p-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <MapPinIcon className="h-4 w-4 text-brand" />
                  محطات هذا الاتجاه وحده
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {stops.length === 0
                    ? 'لا محطة'
                    : stops.length === 1
                      ? 'محطة واحدة'
                      : stops.length === 2
                        ? 'محطتان'
                        : `${stops.length} محطة`}
                </span>
              </section>

              {stops.length === 0 && (
                <div className="rounded-xl border-2 border-traffic-red bg-red-50 p-4 text-center">
                  <FuelIcon className="mx-auto h-6 w-6 text-traffic-red" />
                  <p className="mt-2 text-sm font-extrabold text-traffic-red">
                    لا نعرف محطةً واحدة على هذا الطريق
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-red-900/80">
                    انطلق بخزّانٍ ممتلئ. وغيابُها من عندنا لا يعني غيابها من الطريق — لكنّا
                    لا نَعِدك بشيء لا نعرفه.
                  </p>
                </div>
              )}

              {/* أوّل محطة: كم يفصلها عن الانطلاق */}
              {stops.length > 0 && <Leg km={stops[0].atKm} label="أول محطة" />}

              {stops.map((s, i) => (
                <div key={`${s.name}-${i}`} className="space-y-3">
                  <RoadStop stop={s} last={i === stops.length - 1} />
                  {s.toNextKm != null && s.toNextKm < GAP_WARN_KM && (
                    <Leg km={s.toNextKm} label="المحطة التالية" />
                  )}
                </div>
              ))}

              {stops.length > 0 && tailGap >= GAP_WARN_KM && (
                <div className="rounded-xl border-2 border-traffic-red bg-red-50 p-3">
                  <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-traffic-red">
                    <FuelIcon className="h-4 w-4 shrink-0" />
                    {Math.round(tailGap)} كم بلا محطة حتى {route.to}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-red-900/80">
                    آخر فرصةٍ نعرفها هي المحطة أعلاه.
                  </p>
                </div>
              )}

              <p className="px-1 text-[10px] leading-relaxed text-slate-400">
                المعروض محطاتٌ على حافّة الطريق ضمن {ON_ROAD_M} متراً، من بيانات خرائط
                مفتوحة — إرشاديّ لا التزاميّ. والزمن تقديريّ بمتوسّط {AVG_KMH} كم/س، بلا
                حساب سيطرةٍ ولا ازدحام. ومحطات داخل المدن لا تظهر هنا؛ اطلبها من الرئيسة.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** سهمٌ متقطّع بين بطاقتين، وفيه الزمن.
 *
 *  المسافة وحدها لا تُقرأ: «22 كم» رقمٌ يحتاج قسمةً، و«خلال 20 دقيقة» جوابٌ
 *  مباشر. فالاثنان معاً — الزمن أوّلاً لأنه المقروء. */
function Leg({ km, label }: { km: number; label: string }) {
  return (
    <div className="flex items-center gap-2 pr-5" aria-label={`${label}: ${Math.round(km)} كم`}>
      <span
        className="h-8 w-px shrink-0 border-r-2 border-dashed border-brand-200"
        style={{ marginRight: '-1px' }}
        aria-hidden="true"
      />
      <span className="flex items-center gap-1.5 rounded-full border border-dashed border-brand-200 bg-brand-50/60 px-3 py-1 text-[11px] font-bold text-brand-900">
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        خلال {minutesFor(km)} دقيقة · {Math.round(km)} كم
      </span>
    </div>
  );
}
