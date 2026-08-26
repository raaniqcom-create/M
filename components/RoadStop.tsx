'use client';

import { GAP_WARN_KM, type RouteStop } from '@/lib/geo';
import { RouteButton } from './RouteButton';
import { FuelIcon } from './icons';

/** محطةٌ على الطريق — وما بعدها.
 *
 *  StationCard لا تصلح هنا: تفترض منتجاتٍ وازدحاماً وساعات دوامٍ وصفّاً في
 *  القاعدة، وهذه لا تملك شيئاً من ذلك ولا يُدَّعى أنها تملكه. بطاقةٌ تعرض ما
 *  نعرفه فقط: أين هي، وكم تبعد عن التالية، وكيف تصلها.
 *
 *  والفجوة تُرسم بندَاً مستقلاً بينها وبين تاليتها — لا حاشيةً في زاوية. من
 *  يعبر الصحراء لا يقرأ الحواشي. */
export function RoadStop({ stop, last }: { stop: RouteStop; last: boolean }) {
  const gap = stop.toNextKm ?? 0;
  const warn = !last && gap >= GAP_WARN_KM;

  return (
    <>
      <article className="relative flex gap-3 pr-5">
        {/* الخطّ الرأسي والنقطة: المسار يُقرأ بالعين قبل النصّ */}
        <span className="absolute right-0 top-0 h-full w-px bg-brand-100" aria-hidden="true" />
        <span
          className="absolute -right-[5px] top-4 h-[11px] w-[11px] rounded-full border-2 border-white bg-brand"
          aria-hidden="true"
        />

        <div className="card w-full p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13.5px] font-bold leading-snug text-slate-800">{stop.name}</h3>
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-extrabold text-brand-900">
              كم {Math.round(stop.atKm)}
            </span>
          </div>

          <p className="mt-0.5 text-[10.5px] text-slate-400">
            {stop.city}
            {' · '}
            على بُعد {stop.offRoadM} م من الطريق
            {stop.toNextKm != null && ` · ${Math.round(stop.toNextKm)} كم إلى التالية`}
          </p>

          {/* ما لا نعرفه يُقال، ولا يُترك للقارئ ليفترضه */}
          <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[10px] leading-relaxed text-slate-500">
            محطة على الطريق — لم تنضمّ إلى المنصّة بعد، فلا نعرف منتجاتها ولا دوامها.
          </p>

          <div className="mt-2">
            <RouteButton lat={stop.lat} lng={stop.lng} stationName={stop.name} />
          </div>
        </div>
      </article>

      {warn && (
        <div className="relative pr-5">
          <span className="absolute right-0 top-0 h-full w-px bg-traffic-red/30" aria-hidden="true" />
          <div className="rounded-xl border-2 border-traffic-red bg-red-50 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-traffic-red">
              <FuelIcon className="h-4 w-4 shrink-0" />
              {Math.round(gap)} كم بلا محطة نعرفها
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-red-900/80">
              املأ خزّانك هنا. وقد توجد محطاتٌ لا نعرفها — لكنّا لا نَعِدك بها.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
