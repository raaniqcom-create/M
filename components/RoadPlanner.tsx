'use client';

import { useMemo, useState } from 'react';
import {
  ENDPOINTS,
  GAP_WARN_KM,
  ON_ROAD_M,
  ROUTES,
  kmBetween,
  stopsOnRoute,
  waysFor,
  type RouteDef,
} from '@/lib/geo';
import { RoadStop } from './RoadStop';
import { FuelIcon, MapPinIcon, SpinnerIcon } from './icons';

/** مساعد الطريق.
 *
 *  «مسافرٌ من الرمادي إلى بغداد» يريد جواباً واحداً: أين أُعبّئ، وأين لا
 *  أستطيع. والميزة كلّها مبنيّة على أن الجواب الثاني أثمن من الأول.
 *
 *  والاتجاه ليس تفصيلاً. الطرق السريعة مزدوجة، والمحطة على جانبٍ لا تُخدم
 *  القادم من الجهة الأخرى — فالذهاب والعودة قائمتان مختلفتان، لا قائمةٌ
 *  واحدة تُقرأ من الطرفين. قِيس على طريق بغداد: محطتان ذهاباً، وأربعٌ عودةً. */
export function RoadPlanner() {
  const [routeId, setRouteId] = useState<string>('rmd-bgd');

  const route: RouteDef | undefined = ROUTES.find((r) => r.id === routeId);
  const origin = route ? ENDPOINTS[route.from] : undefined;
  const dest = route ? ENDPOINTS[route.to] : undefined;

  const stops = useMemo(
    () => (route && origin ? stopsOnRoute(route, origin) : []),
    [route, origin]
  );

  const totalKm = useMemo(
    () => (origin && dest ? kmBetween(origin, dest) : 0),
    [origin, dest]
  );

  const hasGeometry = route ? waysFor(route).length > 0 : false;

  // الفجوة بعد آخر محطة: أخطر ما في الرحلة، ولا تظهر بين بندين لأن لا بند
  // بعدها. فتُحسب هنا وتُعرض في ذيل القائمة.
  const tailGap = stops.length ? totalKm - stops[stops.length - 1].atKm : totalKm;

  return (
    <div className="space-y-3">
      <section className="card p-4">
        <label htmlFor="route" className="text-xs font-bold text-slate-600">
          إلى أين أنت مسافر؟
        </label>
        <select
          id="route"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
        >
          {ROUTES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.from} ← {r.to}
            </option>
          ))}
        </select>

        {route?.note && <p className="mt-2 text-[11px] text-slate-400">{route.note}</p>}

        {/* الاتجاه يُقال صراحةً: من لا يعرف أن القائمة تخصّ جهةً واحدة قد
            يقصد محطةً على الجانب المقابل ولا يستطيع بلوغها. */}
        <p className="mt-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-brand-900">
          المعروض محطات <b>هذا الاتجاه وحده</b> — الطريق مزدوج، ومحطةُ الجهة المقابلة لا
          تبلغها. وقائمة العودة تختلف.
        </p>
      </section>

      {!hasGeometry ? (
        <div className="card p-6 text-center">
          <SpinnerIcon className="mx-auto h-5 w-5 text-brand" />
          <p className="mt-2 text-xs text-slate-500">لا هندسةَ لهذا الطريق بعد.</p>
        </div>
      ) : (
        <>
          <section className="card flex items-center justify-between gap-2 p-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <MapPinIcon className="h-4 w-4 text-brand" />
              {Math.round(totalKm)} كم
            </span>
            <span className="text-xs font-bold text-slate-700">
              {stops.length === 0
                ? 'لا محطة معروفة'
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

          <div className="space-y-3">
            {stops.map((s, i) => (
              <RoadStop key={`${s.name}-${i}`} stop={s} last={i === stops.length - 1} />
            ))}
          </div>

          {stops.length > 0 && tailGap >= GAP_WARN_KM && (
            <div className="rounded-xl border-2 border-traffic-red bg-red-50 p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-traffic-red">
                <FuelIcon className="h-4 w-4 shrink-0" />
                {Math.round(tailGap)} كم بلا محطة حتى {route?.to}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-red-900/80">
                آخر فرصةٍ نعرفها هي المحطة أعلاه.
              </p>
            </div>
          )}

          <p className="px-1 text-[10px] leading-relaxed text-slate-400">
            المعروض محطاتٌ على حافّة الطريق ضمن {ON_ROAD_M} متراً، من بيانات خرائط مفتوحة —
            إرشاديّ لا التزاميّ. ومحطات داخل المدن لا تظهر هنا؛ اطلبها من الرئيسة.
          </p>
        </>
      )}
    </div>
  );
}
