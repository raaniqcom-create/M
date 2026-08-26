'use client';

import { GAP_SEVERE_KM, GAP_WARN_KM, type RouteStop } from '@/lib/geo';
import { RouteButton } from './RouteButton';
import { FuelIcon } from './icons';

/** محطةٌ على الطريق — وما بعدها.
 *
 *  StationCard لا تصلح هنا: تفترض منتجاتٍ وازدحاماً وساعات دوامٍ وصفّاً في
 *  القاعدة، وهذه لا تملك شيئاً من ذلك ولا يُدَّعى أنها تملكه. والمالك حسم
 *  الغرض: «نريد تغطية المحطات فقط» — أين تقف، لا ما تبيع.
 *
 *  والرقم يطابق رقمَها على الخريطة، فتُقرأ النقطة والبطاقة معاً.
 *
 *  والفجوة تُرسم بندَاً مستقلاً بينها وبين تاليتها — لا حاشيةً في زاوية. من
 *  يعبر الصحراء لا يقرأ الحواشي. */
export function RoadStop({
  stop,
  index,
  last,
}: {
  stop: RouteStop;
  index: number;
  last: boolean;
}) {
  const gap = stop.toNextKm ?? 0;
  const warn = !last && gap >= GAP_WARN_KM;
  const severe = gap >= GAP_SEVERE_KM;
  const left = stop.side > 0;

  return (
    <>
      <article className="relative flex gap-3 pr-5">
        {/* الخطّ الرأسي والرقم: المسار يُقرأ بالعين قبل النصّ */}
        <span className="absolute right-0 top-0 h-full w-px bg-brand-100" aria-hidden="true" />
        <span
          className={`absolute -right-[13px] top-3 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[2.5px] text-[12px] font-extrabold tabular-nums ${
            left ? 'border-brand bg-white text-brand-600' : 'border-white bg-brand text-white'
          }`}
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,.25)' }}
          aria-hidden="true"
        >
          {index}
        </span>

        <div className="card mr-3 w-full p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13.5px] font-bold leading-snug text-slate-800">{stop.name}</h3>
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-slate-700">
              كم {Math.round(stop.atKm)}
            </span>
          </div>

          <p className="mt-0.5 text-[10.5px] text-slate-500">
            {stop.city}
            {' · '}
            {stop.offRoadM} م عن الطريق
            {stop.toNextKm != null && ` · ${Math.round(stop.toNextKm)} كم إلى التالية`}
          </p>

          {/* الجانب يُعرض ولا يُخفي: على الطرق الصحراوية المفردة يخدم
              الجانبان الاتجاهين، وعلى المزدوجة يحتاج اليسارُ التفافاً. */}
          <p
            className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              left ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'
            }`}
          >
            {left ? 'يسار اتجاهك — قد تحتاج التفافاً' : 'يمين اتجاهك'}
          </p>

          {/* حدُّ ما نعرضه يُقال، ولا يُترك للقارئ ليفترضه.
              ولا تُذكر المنتجات ولا الدوام: ذكرُهما — ولو نفياً — يُحيي توقّعاً
              أخرجه المالك من نطاق هذه الصفحة. ولا يُقال «لم تنضمّ»، فقد تكون
              منضمّةً ولا نعرف؛ المعلوم هو ما نعرضه لا ما هي عليه. */}
          <p className="mt-1.5 rounded-lg bg-brand-50/60 px-2 py-1 text-[10px] leading-relaxed text-slate-600">
            موقعُها على طريقك — وهذا كلّ ما نعرضه هنا اليوم.{' '}
            <b>وقريباً تُضاف المحطات كاملةً إلى النظام بإذن الله.</b>
          </p>

          <div className="mt-2">
            <RouteButton lat={stop.lat} lng={stop.lng} stationName={stop.name} />
          </div>
        </div>
      </article>

      {warn && (
        <div className="relative pr-5">
          <span className="absolute right-0 top-0 h-full w-px bg-traffic-red/30" aria-hidden="true" />
          <div
            className={`rounded-xl border-2 p-3 ${
              severe ? 'border-traffic-red bg-red-100' : 'border-amber-400 bg-amber-50'
            }`}
          >
            <p
              className={`flex items-center gap-1.5 text-[12px] font-extrabold ${
                severe ? 'text-traffic-red' : 'text-amber-800'
              }`}
            >
              <FuelIcon className="h-4 w-4 shrink-0" />
              {Math.round(gap)} كم بلا محطة نعرفها
            </p>
            <p
              className={`mt-1 text-[10.5px] leading-relaxed ${
                severe ? 'text-red-900' : 'text-amber-900/80'
              }`}
            >
              {severe
                ? 'صحراءٌ مفتوحة. لا تدخلها بخزّانٍ ناقص، ولا وحدك ليلاً. وقد توجد محطاتٌ لا نعرفها — لكنّا لا نَعِدك بها.'
                : 'املأ خزّانك هنا. وقد توجد محطاتٌ لا نعرفها — لكنّا لا نَعِدك بها.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
