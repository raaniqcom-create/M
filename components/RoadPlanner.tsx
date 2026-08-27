'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  withApproved,
  GAP_SEVERE_KM,
  GAP_WARN_KM,
  ON_ROAD_M,
  TRIP_POINTS,
  durationText,
  loadRoutes,
  minutesFor,
  routesBetween,
  stopsFor,
  type RoadRoute,
} from '@/lib/geo';
import { loadStations } from '@/lib/stations';
import type { StationWithStatus } from '@/types/database';
import { RoadStop } from './RoadStop';
import type { GapSpan } from './RoadMap';
import { FuelIcon, MapPinIcon, SearchIcon, SpinnerIcon } from './icons';

// Leaflet يلمس window وقت الاستيراد — فلا يُصدَّر ساكناً.
const RoadMap = dynamic(() => import('./RoadMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-2xl bg-brand-50">
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
 *  والمسارات مُحسَّبةٌ سلفاً بمحرّك توجيهٍ حقيقي، لا مخيوطةً من مراجع الطرق.
 *  والفرق ليس تجميلاً: الرمادي ← كبيسة كانت تُرسم داخل الرمادي. */
export function RoadPlanner() {
  const [from, setFrom] = useState('الرمادي');
  const [to, setTo] = useState('بغداد');
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null);
  const [showStops, setShowStops] = useState(false);
  /** أيّ الطرق حين يصل أكثر من واحد — السريع أوّلاً، والقديم خيارٌ يُعرض. */
  const [roadIdx, setRoadIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  /** المحطات المعتمدة في المنصّة — تُطابَق بالإحداثيات فتصير بطاقاتٍ كاملة */
  const [approved, setApproved] = useState<StationWithStatus[]>([]);

  // الشبكة تُحمَّل مرّةً واحدة عند فتح الصفحة — لا عند كل بحث. و684 ك.ب
  // تصل ~50 مضغوطة، فالانتظار جزءٌ من فتح الصفحة لا من كل ضغطة.
  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {
        if (alive) setLoadErr('تعذّر تحميل شبكة الطرق. تحقّق من اتصالك ثم أعد فتح الصفحة.');
      });
    // **سقوطُها لا يُسقط الصفحة.** المحطات المعتمدة زيادةٌ على التغطية لا
    // شرطٌ لها: إن تعذّر جلبُها بقيت الرحلةُ كاملةً وبقيت البطاقاتُ كما هي
    // — «غير معتمدة» جميعاً. وهو أصدق من صفحةٍ فارغة.
    loadStations()
      .then((s) => {
        if (alive) setApproved(s);
      })
      .catch(() => {
        /* التغطيةُ تكفي وحدها */
      });

    return () => {
      alive = false;
    };
  }, []);

  const roads: RoadRoute[] = useMemo(
    () => (query && ready ? routesBetween(query.from, query.to) : []),
    [query, ready]
  );
  const route: RoadRoute | null = roads[roadIdx] ?? roads[0] ?? null;
  const stops = useMemo(
    () => (route ? withApproved(route, stopsFor(route), approved) : []),
    [route, approved]
  );

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

  /** عكسُ الرحلة — والنتيجة ليست نفسها معكوسة.
   *
   *  الطرق مزدوجة، ومسارُ العودة يسلك الجانب الآخر ويمرّ بمخارجَ أخرى. قِيس
   *  على طريق بغداد فاختلف عدد المحطات ذهاباً وعودة — وطابق ذلك ذاكرة من
   *  يقطعه يومياً. فالزرّ ليس اختصاراً بل رحلةٌ ثانية. */
  function swap() {
    setFrom(to);
    setTo(from);
    setShowStops(false);
    setRoadIdx(0);
    if (query) setQuery({ from: to, to: from });
  }

  return (
    <div className="space-y-3">
      <section className="card space-y-3 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="block">
            <span className="text-[11px] font-bold text-slate-600">من أين تنطلق؟</span>
            <span className="mt-1.5 flex items-center gap-1.5 rounded-xl border-2 border-brand/40 bg-white px-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="نقطة الانطلاق"
                className="h-10 w-full bg-transparent text-[13px] font-bold text-slate-800 outline-none"
              >
                {TRIP_POINTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <button
            type="button"
            onClick={swap}
            aria-label="اعكس الرحلة"
            title="اعكس الرحلة"
            className="mb-[1px] flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-white text-slate-600 transition-colors active:bg-brand-50"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" />
            </svg>
          </button>

          <label className="block">
            <span className="text-[11px] font-bold text-slate-600">إلى أين وجهتك؟</span>
            <span className="mt-1.5 flex items-center gap-1.5 rounded-xl border-2 border-[#2563eb]/40 bg-white px-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2563eb]" aria-hidden="true" />
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="الوجهة"
                className="h-10 w-full bg-transparent text-[13px] font-bold text-slate-800 outline-none"
              >
                {TRIP_POINTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={search}
          disabled={from === to || !ready}
          className="btn-primary w-full disabled:opacity-60"
        >
          {ready ? <SearchIcon className="h-4 w-4" /> : <SpinnerIcon className="h-4 w-4" />}
          {ready ? 'ابحث عن الطريق' : 'يُحمّل شبكة الطرق…'}
        </button>
        {from === to && (
          <p className="text-center text-[11px] text-slate-500">اختر وجهةً غير نقطة الانطلاق.</p>
        )}
        {loadErr && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-[11px] font-bold text-traffic-red">
            {loadErr}
          </p>
        )}
      </section>

      {/* **الطريق يُختار لا يُفرض.**
          بين الرمادي وبغداد طريقان، والفرق جوهريّ: القديم يمرّ بمراكز
          البلدات فتظهر محطاتُها، والسريع يلتفّ حولها. ومن يعرف طريقه أدرى
          بأيّهما يسلك — فيُعرض الاختيار بأسماء الطرق التي يعرفها، ومعها
          طولُها وزمنُها وعددُ محطاتها، فيكون الاختيار على بيّنة. */}
      {roads.length > 1 && (
        <section className="card p-2">
          <p className="px-1 pb-1.5 text-[10.5px] font-bold text-slate-500">
            طريقان بين المدينتين — اختر ما تسلك
          </p>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${roads.length}, minmax(0,1fr))` }}
          >
            {roads.map((r, i) => (
              <button
                key={r.ref + i}
                type="button"
                onClick={() => {
                  setRoadIdx(i);
                  setShowStops(false);
                }}
                aria-pressed={i === roadIdx}
                className={`rounded-xl border-2 px-2 py-2 text-center transition-colors ${
                  i === roadIdx
                    ? 'border-brand bg-brand text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <span className="block text-[12px] font-extrabold leading-tight">{r.label}</span>
                <span
                  className={`mt-0.5 block text-[10px] font-bold tabular-nums ${
                    i === roadIdx ? 'text-white/80' : 'text-slate-400'
                  }`}
                >
                  {Math.round(r.km)} كم · {durationText(r.min)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {query && ready && roads.length === 0 && (
        <div className="card p-5 text-center">
          <p className="text-sm font-bold text-slate-700">لا نعرف طريقاً بين هاتين</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            لم يُحسب مسارٌ لهذه الرحلة. جرّب مدينةً أخرى، أو أبلغنا لنضيفها.
          </p>
        </div>
      )}

      {route && (
        <>
          <section className="card p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="flex min-w-0 items-center gap-1.5 text-brand-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
                <span className="truncate">{route.from}</span>
              </span>
              <span className="shrink-0 text-center text-slate-700">
                {Math.round(route.km)} كم
                <span className="mx-1 text-slate-300">·</span>
                {durationText(route.min)}
              </span>
              <span className="flex min-w-0 items-center justify-end gap-1.5 text-[#2563eb]">
                <span className="truncate">{route.to}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2563eb]" />
              </span>
            </div>
            {route.via.length > 0 && (
              <p className="mt-1.5 truncate text-[10.5px] text-slate-500">
                عبر {route.via.join(' ← ')}
              </p>
            )}
          </section>

          <RoadMap route={route} stops={stops} gaps={gaps} />

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
                  محطات هذا الطريق
                </span>
                <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  {stops.some((s) => s.approved) && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-white">
                      {stops.filter((s) => s.approved).length} معتمدة
                    </span>
                  )}
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

              {stops.length > 0 && <Leg km={stops[0].atKm} label="أول محطة" />}

              {stops.map((s, i) => (
                <div key={`${s.name}-${i}`} className="space-y-3">
                  <RoadStop
                    stop={s}
                    index={i + 1}
                    last={i === stops.length - 1}
                    fromCity={route.from}
                  />
                  {s.toNextKm != null && s.toNextKm < GAP_WARN_KM && (
                    <Leg km={s.toNextKm} label="المحطة التالية" />
                  )}
                </div>
              ))}

              {stops.length > 0 && tailGap >= GAP_WARN_KM && (
                <div
                  className={`rounded-xl border-2 p-3 ${
                    tailGap >= GAP_SEVERE_KM
                      ? 'border-traffic-red bg-red-100'
                      : 'border-amber-400 bg-amber-50'
                  }`}
                >
                  <p
                    className={`flex items-center gap-1.5 text-[12px] font-extrabold ${
                      tailGap >= GAP_SEVERE_KM ? 'text-traffic-red' : 'text-amber-800'
                    }`}
                  >
                    <FuelIcon className="h-4 w-4 shrink-0" />
                    {Math.round(tailGap)} كم بلا محطة حتى {route.to}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-red-900/80">
                    آخر فرصةٍ نعرفها هي المحطة أعلاه.
                  </p>
                </div>
              )}

              <p className="px-1 text-[10px] leading-relaxed text-slate-500">
                المعروض <b>تغطيةٌ فقط</b>: أين تقف المحطات على طريقك، لا ما تبيعه ولا متى
                تفتح. مصدرها خرائط مفتوحة، ضمن {ON_ROAD_M} متراً من حافّة الطريق — إرشاديّ لا
                التزاميّ. والمسافة والزمن من محرّك توجيهٍ حقيقي، بلا حساب سيطرةٍ ولا ازدحام.
                ومحطات داخل المدن لا تظهر هنا؛ اطلبها من الصفحة الرئيسة.
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
      <span className="flex items-center gap-1.5 rounded-full border border-dashed border-brand-200 bg-brand-50/60 px-3 py-1 text-[11px] font-bold text-slate-700">
        <svg
          className="h-3 w-3 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        خلال {durationText(minutesFor(km))} · {Math.round(km)} كم
      </span>
    </div>
  );
}
