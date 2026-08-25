import { PRODUCT_LABELS, PRODUCT_ORDER, TRAFFIC_COLORS, TRAFFIC_LABELS, activeTrafficLevel, expectedLabel, isOffered, isStaleOffer, trafficSource } from '@/lib/products';
import { formatTime, isFresh, isOpenNow, PERIOD_LABELS, statusNote } from '@/lib/hours';
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
function newestIsStale(newest: string | null): boolean {
  return !!newest && !isFresh(newest);
}

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
  // هل ما يُعرض كلّه خبرٌ فات عمره؟ يُقال مرّةً في عنوان الصفّ لا على كل شارة.
  const isStale = newestIsStale(newest);
  const shown = PRODUCT_ORDER.filter((product) => {
    const row = byProduct.get(product);
    if (!row) return false;
    return row.is_available || !!row.expected_at;
  });

  return (
    <article className={`card p-3 ${tinted ? 'border-brand-100 bg-brand-50/60' : ''}`}>
      {/* صفّان للقراءة، ثم صفٌّ واحد للفعل.
        *
        *  كانت الأفعال الثلاثة عموداً على اليسار: أزرارٌ مربّعة بلا أسماء،
        *  وبينها فراغٌ لأن صفوف النصّ يمينها أقصر منها. فصارت صفّاً واحداً
        *  بمستوى خطٍّ واحد، ولكلٍّ اسمُه — وأيقونةٌ بلا اسمٍ تُخمَّن، والتخمين
        *  يُبقي الإصبع معلّقاً. */}

      <div className="grid grid-cols-[1fr_auto] items-start gap-x-3">
        <h2 className="truncate text-[15px] font-bold leading-snug">{station.name}</h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold ${
            status.tone === 'closed'
              ? 'bg-slate-100 text-slate-600'
              : status.tone === 'soon'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-brand-100 text-brand-900'
          }`}
        >
          {open ? 'مفتوحة' : station.temp_closed ? 'مغلقة مؤقتاً' : 'مغلقة'}
        </span>

        <p className="truncate text-[11px] text-slate-500">
          {station.city} — {station.address}
          {station.distanceKm !== undefined && (
            <span className="text-slate-400"> · {station.distanceKm.toFixed(1)} كم</span>
          )}
        </p>
        <span dir="ltr" className="shrink-0 text-[9.5px] tabular-nums text-slate-400">
          {station.is_24h ? '24h' : `${formatTime(station.opens_at)} – ${formatTime(station.closes_at)}`}
        </span>
      </div>

      {/* المنتجات — بعرض البطاقة، فلا يقصّها عمودٌ ضيّق */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-slate-400">
          المنتجات{isStale ? ' — آخر إعلان قديم' : ''} :
        </span>
        {level && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-bold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
            {TRAFFIC_LABELS[level]}
          </span>
        )}
        {shown.length === 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {!newest ? 'لم تُحدَّث بعد' : 'لا يوجد الآن'}
          </span>
        ) : (
          shown.map((product) => {
            const row = byProduct.get(product)!;
            const inStock = isOffered(station, row);
            const stale = isStaleOffer(row);
            return (
              <span
                key={product}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  inStock
                    ? 'bg-brand-100 text-brand-900'
                    : stale
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                {PRODUCT_LABELS[product]}
                {stale && !row.expected_at && (
                  <span className="font-normal"> · {agoLabel(row.updated_at)}</span>
                )}
                {!inStock && row.expected_at && (
                  <span>
                    {' '}
                    · {expectedLabel(row.expected_at)}
                    {row.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>

      {/* ثلاثة أفعالٍ بمستوى خطٍّ واحد، ولكلٍّ اسمُه */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2.5">
        {onToggleFavorite ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            title={isFavorite ? 'تتابعها — يصلك إشعارها' : 'تابعها ليصلك إشعار توفّر الوقود'}
            className={`flex min-h-[34px] items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
              isFavorite
                ? 'bg-brand-50 text-traffic-yellow'
                : 'text-slate-500 active:bg-slate-50'
            }`}
          >
            <StarIcon filled={isFavorite} />
            محطة مثبتة لك
          </button>
        ) : (
          <span />
        )}

        <RouteButton
          compact
          lat={station.lat}
          lng={station.lng}
          stationId={station.id}
          stationName={station.name}
        />

        {/* الاتصال يخضع للدوام: رقمٌ يرنّ في بيتٍ نائم ليس خدمةً لأحد.
            ويبقى مكانه فيقول متى يعمل، بدل أن يختفي فيُظنّ أن لا رقم لها. */}
        {station.phone ? (
          open ? (
            <a
              href={`tel:${station.phone}`}
              className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg text-[10px] font-bold text-brand-700 active:bg-brand-50"
            >
              <PhoneIcon className="h-4 w-4" />
              الاتصال بالمحطة
            </a>
          ) : (
            <span
              title={`الاتصال متاح عند الفتح ${formatTime(station.opens_at)}`}
              className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg text-[10px] font-bold text-slate-300"
            >
              <PhoneIcon className="h-4 w-4" />
              الاتصال بالمحطة
            </span>
          )
        ) : (
          <span className="flex min-h-[34px] items-center justify-center text-[10px] text-slate-300">
            لا رقم معلن
          </span>
        )}
      </div>

      <p className="sr-only">
        {status.text} · المتوفر:{' '}
        {PRODUCT_ORDER.filter((p) => byProduct.get(p)?.is_available)
          .map((p) => PRODUCT_LABELS[p])
          .join('، ') || 'لا شيء'}
      </p>
    </article>
  );
}
