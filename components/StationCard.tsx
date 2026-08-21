import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  activeTrafficLevel,
  trafficSource,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  expectedLabel,
} from '@/lib/products';
import { StationActions } from './StationActions';
import { isFresh, isOpenNow, PERIOD_LABELS, statusNote } from '@/lib/hours';
import { agoLabel } from '@/lib/freshness';
import type { StationWithStatus } from '@/types/database';
import { RouteButton } from './RouteButton';
import { StarIcon } from './icons';
import { PhoneIcon } from './icons';

/** One station in the list.
 *
 *  Rebuilt after a user asked whether the card was crowded. It was, and the
 *  arithmetic said so: on a 390px screen the name row had 270px, of which two
 *  `shrink-0` pills and their gaps took 112px — 41% — leaving the name about
 *  158px and making it the only element that could shrink. So the longest
 *  station names were the ones truncated, while both pills repeated facts
 *  already on screen: the kind is a search filter, and "closed" was printed
 *  again three lines below from the same boolean.
 *
 *  Now the name owns its line. What a person came to find — the fuel — sits
 *  directly under it, and everything about opening hours is said once. */
export function StationCard({
  station,
  isFavorite,
  onToggleFavorite,
  tinted = false,
}: {
  station: StationWithStatus;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Every other card sits on a faint green wash so a long list stays
   *  readable without drawing a divider between each pair. */
  tinted?: boolean;
}) {
  const byProduct = new Map(station.products.map((p) => [p.product, p]));
  const open = isOpenNow(station);
  const level = activeTrafficLevel(station, station.traffic);
  // Says something in both directions now. It used to appear only when the
  // station was shut, so the line vanished exactly when the station was worth
  // driving to — and «تغلق بعد 20 دقيقة» is the one fact that changes a
  // decision at the end of the day.
  const status = statusNote(station);

  // Three states the old card collapsed into one sentence, and got wrong in
  // both directions: it printed «لم تُحدَّث حالة الوقود بعد» for a *closed*
  // station whose data was minutes old (a false claim about reporting, not
  // about hours), and printed nothing at all — a silent gap — for an open
  // station whose data had gone stale. They are separate facts now.
  const rows = PRODUCT_ORDER.map((p) => byProduct.get(p)).filter(Boolean);
  // أحدث لمسة على اللوح — لا «هل لديه ما يُعلن».
  //
  // كان المقياس everReported = ثمّة متوفر أو متوقع، فمحطةٌ حدّثت قبل أربع ساعات
  // وأفرغت منتجاتها تُقال لها «لم تُحدَّث حالة الوقود بعد». وهي حدّثت، وأخبرت
  // بالصدق أن لا شيء لديها — فعوقبت على صدقها بنصٍّ يتّهمها بالإهمال.
  const newest = rows.reduce<string | null>(
    (a, r) => (r!.updated_at && (!a || r!.updated_at > a) ? r!.updated_at : a),
    null
  );
  // المعلن القديم يُقال ولا يُحذف.
  //
  // كان يُسقَط من العرض تماماً، فتضيع المعلومة كلها ويظهر بدلها سطرٌ عامّ «آخر
  // تحديث قديم». وصفحة المحطة كانت تعرضه أخضرَ كأنه اليوم — فالسطحان يقولان
  // شيئين مختلفين عن المحطة نفسها. والصواب بينهما: يُعرض ما أُعلن مع عمره
  // صريحاً، فلا يُخدع القارئ ولا يُحرَم خبراً قد ينفعه.
  const shown = PRODUCT_ORDER.filter((product) => {
    const row = byProduct.get(product);
    if (!row) return false;
    return row.is_available || !!row.expected_at;
  });

  return (
    <article className={`card p-4 ${tinted ? 'border-brand-100 bg-brand-50/60' : ''}`}>
      {/* The name gets the whole line. Nothing shares it but the star, which
          is fixed-width — so no station name is truncated to make room for a
          label the reader did not ask for. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-snug">{station.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {station.city} — {station.address}
          </p>
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'إلغاء متابعة هذه المحطة' : 'تابع هذه المحطة ليصلك إشعارها'}
            title={isFavorite ? 'تتابعها — يصلك إشعارها' : 'تابعها ليصلك إشعار توفّر الوقود'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200 ${
              isFavorite
                ? 'border-brand bg-brand-50 text-brand'
                : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <StarIcon filled={isFavorite} />
          </button>
        )}
      </header>

      {/* The answer people opened the app for. Only what they can act on: in
          stock, or announced as arriving. A wall of struck-through "not
          available" chips is noise. */}
      {shown.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-1.5">
          {shown.map((product) => {
            const row = byProduct.get(product)!;
            const inStock = row.is_available && open && isFresh(row.updated_at);
            const stale = row.is_available && !isFresh(row.updated_at);
            const lane = station.productTraffic?.find((t) => t.product === product);
            // Lane traffic reads majority_level straight off the view and so
            // never passed through the closed-station guard in
            // activeTrafficLevel. Closed means no dot, same rule.
            const laneLevel = open ? lane?.majority_level : null;

            return (
              <li
                key={product}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  inStock
                    ? 'bg-brand-100 text-brand'
                    : stale
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                {laneLevel && (
                  <span
                    title={`الازدحام: ${TRAFFIC_LABELS[laneLevel]}`}
                    className={`h-2 w-2 shrink-0 rounded-full ${TRAFFIC_COLORS[laneLevel].dot}`}
                  />
                )}
                {PRODUCT_LABELS[product]}
                {stale && !row.expected_at && (
                  <span className="mr-1 font-normal">· {agoLabel(row.updated_at)}</span>
                )}
                {!inStock && row.expected_at && (
                  <span className="mr-1 font-bold">
                    · {expectedLabel(row.expected_at)}
                    {row.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Said once، وفرعان لا أربعة.
       *
       *  كانت ثمّة حالة «آخر تحديث قديم» بصيغتين حسب وجود الرقم — وقد صارت
       *  الشارات نفسها تحمل عمرها («بانزين عادي · قبل ٣ أيام»)، فتكرارها هنا
       *  حشوٌ يقول ما قيل. ولم يبقَ إلا حالتان صادقتان: لم تنشر قطّ، أو نشرت
       *  ولا شيء لديها. */}
      {open && !shown.length && (
        <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
          {!newest
            ? 'لم تُحدَّث حالة الوقود بعد'
            : isFresh(newest)
              ? 'لا يوجد وقود متوفر الآن'
              : `لا وقود معلن · آخر تحديث ${agoLabel(newest)}`}
        </p>
      )}

      {(level || station.distanceKm !== undefined) && (
        <div className="mt-2 flex items-center gap-2">
          {level && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
            >
              <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
              {TRAFFIC_LABELS[level]}
              {trafficSource(station, station.traffic) === 'station'
                ? ' · من المحطة'
                : agoLabel(station.traffic?.last_vote_at) &&
                  ` · ${agoLabel(station.traffic?.last_vote_at)}`}
            </span>
          )}
          {station.distanceKm !== undefined && (
            <span className="ms-auto text-xs text-slate-400">
              {station.distanceKm.toFixed(1)} كم
            </span>
          )}
        </div>
      )}

      <p
        className={`mt-3 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
          status.tone === 'closed'
            ? 'bg-slate-100 text-slate-600'
            : status.tone === 'soon'
              ? 'bg-amber-50 font-bold text-amber-800'
              : 'bg-brand-50 text-brand-900'
        }`}
      >
        {status.text}
      </p>

      <p className="sr-only">
        المتوفر:{' '}
        {PRODUCT_ORDER.filter((p) => byProduct.get(p)?.is_available)
          .map((p) => PRODUCT_LABELS[p])
          .join('، ') || 'لا شيء'}
      </p>

      <StationActions
        phone={station.phone}
        hours={{
          is_24h: station.is_24h,
          opens_at: station.opens_at,
          closes_at: station.closes_at,
          temp_closed: station.temp_closed,
        }}
        lat={station.lat}
        lng={station.lng}
        stationId={station.id}
        stationName={station.name}
      />
    </article>
  );
}
