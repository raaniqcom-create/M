'use client';

import { GAP_SEVERE_KM, GAP_WARN_KM, type RouteStop } from '@/lib/geo';
import { RouteButton } from './RouteButton';
import { StationCard } from './StationCard';
import { FuelIcon } from './icons';

/** محطةٌ على الطريق — وما بعدها.
 *
 *  **وبطاقتان لا واحدة.**
 *
 *  أكثرُ ما على الطرق نقاطٌ من خرائطَ مفتوحة: لا صاحبَ لها عندنا ولا التزام،
 *  فلا تُعرض إلا موقعاً. وبعضُها محطاتٌ **معتمدة** في المنصّة، صاحبُها يُعلن
 *  توفّره ويُحاسَب عليه — وهذه تستحقّ بطاقتها الكاملة: منتجاتها ودوامُها
 *  وازدحامُها ورقمُها.
 *
 *  والفرقُ يُقال بصراحة لا بالإهمال: المعتمدةُ بشارةٍ خضراء، وغيرُها بشريطٍ
 *  أحمر على حافّتها مكتوبٌ عليه «غير معتمدة». فلا يظنّ المسافرُ أن ما لا
 *  نعرف عنه شيئاً مثلُ ما نضمن عنه.
 *
 *  والرقمُ يطابق رقمَها على الخريطة، فتُقرأ النقطة والبطاقة معاً. */
export function RoadStop({
  stop,
  index,
  last,
  fromCity,
}: {
  stop: RouteStop;
  index: number;
  last: boolean;
  /** منطلقُ الرحلة — يفتح رقمَ المحطات المُخفية لمن صرّح بسفره */
  fromCity?: string;
}) {
  const gap = stop.toNextKm ?? 0;
  const warn = !last && gap >= GAP_WARN_KM;
  const severe = gap >= GAP_SEVERE_KM;
  const left = stop.side > 0;
  const approved = stop.approved;

  /** حقائقُ الطريق — كم على المسار، وبُعدٌ عن الحافّة، وأيّ جانب.
   *
   *  لا مكانَ لها داخل StationCard، ولا تُكتب في خانة distanceKm فيها: تلك
   *  مسافةٌ مستقيمة من موقع القارئ، وهذه مسافةٌ على الطريق من نقطة انطلاقه.
   *  رقمان مختلفان، ووضعُ أحدهما مكان الآخر كذبٌ صامت. */
  const facts = (
    <p className="text-[10.5px] text-slate-500">
      كم <b className="tabular-nums text-slate-700">{Math.round(stop.atKm)}</b>
      {' · '}
      {stop.offRoadM} م عن الطريق
      {' · '}
      <span className={left ? 'font-bold text-amber-800' : 'font-bold text-brand-700'}>
        {left ? 'يسار اتجاهك' : 'يمين اتجاهك'}
      </span>
      {stop.toNextKm != null && ` · ${Math.round(stop.toNextKm)} كم إلى التالية`}
    </p>
  );

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

        {approved ? (
          /* ── معتمدة: بطاقةُ المنصّة كاملةً ──────────────────────────────
             وStationCard جذرُها ‎.card‎ بحاشيتها، فلا تُلفّ في ‎.card‎ ثانية —
             حدّان وحاشيتان على بطاقةٍ واحدة. */
          <div className="mr-3 w-full space-y-1.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2}
                  strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                معتمدة في المنصّة
              </span>
              {facts}
            </div>
            <StationCard station={approved} fromCity={fromCity} />
          </div>
        ) : (
          /* ── غير معتمدة: ما نعرفه فقط، وشريطٌ يقول حدَّه ──────────────── */
          <div className="card road-carded mr-3 w-full p-3">
            <h3 className="text-[13.5px] font-bold leading-snug text-slate-800">{stop.name}</h3>
            <p className="mt-0.5 text-[10.5px] text-slate-500">{stop.city}</p>
            <div className="mt-0.5">{facts}</div>

            {/* حدُّ ما نعرضه يُقال، ولا يُترك للقارئ ليفترضه. ولا تُذكر
                المنتجات ولا الدوام: ذكرُهما — ولو نفياً — يُحيي توقّعاً
                أخرجه المالك من نطاق هذه الصفحة. */}
            <p className="mt-1.5 rounded-lg bg-brand-50/60 px-2 py-1 text-[10px] leading-relaxed text-slate-600">
              موقعُها على طريقك — وهذا كلّ ما نعرضه هنا اليوم.{' '}
              <b>وقريباً تُضاف المحطات كاملةً إلى النظام بإذن الله.</b>
            </p>

            <div className="mt-2">
              <RouteButton lat={stop.lat} lng={stop.lng} stationName={stop.name} />
            </div>

            <span className="road-stamp" aria-hidden="true">
              غير معتمدة
            </span>
            <span className="sr-only">هذه المحطة غير معتمدة في المنصّة — موقعها فقط معروض.</span>
          </div>
        )}
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
