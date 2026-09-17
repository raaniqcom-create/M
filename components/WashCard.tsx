'use client';

import { BADGE_LABELS, BADGE_TONE, distanceLabel, hoursLine, iqd, ratingParts, time12, washBadge, type WashPublic } from '@/lib/wash';
import { RouteButton } from './RouteButton';
import { ClockIcon, HeartIcon, MapPinIcon, StarIcon, WashIcon } from './icons';

/** بطاقةُ مغسلةٍ كاملةٌ غامرة: صورةٌ كبيرةٌ بالاسم والتقييم فوقها، ثمّ السعرُ وأقربُ موعدٍ والحجز.
 *  الخدماتُ والموعدُ يصلان من الأب — جلبةٌ واحدةٌ للقائمة كلِّها لا لكلّ بطاقة. */
export function WashCard({
  w,
  services,
  nextSlot,
  fav,
  onFav,
}: {
  w: WashPublic;
  services: { name: string; price: number }[];
  nextSlot: string | null | undefined;
  fav: boolean;
  onFav: (id: string) => void;
}) {
  const img = w.thumb_url ?? w.image_url;
  const badge = washBadge(w, nextSlot);
  const rating = ratingParts(w.rating_avg, w.rating_n);
  const dist = distanceLabel(w.distanceKm);
  const noBooking = w.temp_closed || !!w.paused;
  const detail = `/wash/detail/?id=${w.id}`;
  const slotLine =
    badge === 'available' ? 'متاح الآن' : badge === 'full' ? 'لا مواعيد اليوم' : (badge === 'open' || badge === 'busy') && nextSlot ? time12(nextSlot) : null;
  const tagText = w.sponsored ? 'إعلان' : w.featured ? 'مميّزة' : w.has_offer ? 'عرض' : null;
  const tagCls = w.sponsored ? 'bg-slate-900/85 text-white' : w.featured ? 'bg-brand text-white' : 'bg-amber-500 text-white';

  return (
    // الشفةُ الخضراء: صندوقٌ بلون الهويّة خلف البطاقة يطلّ شريطاً من تحتها — البطاقةُ تبدو مرفوعةً لا ملصقة.
    <div className="rounded-[26px] bg-brand-600/90 pb-[5px] shadow-lift">
      <article className="overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200/70">
        {/* ── الصورةُ الغامرة: الاسمُ والتقييمُ فوق تدرّجٍ داكن (نمطُ تطبيقات الحجز) ── */}
        <div className="relative aspect-[7/5] w-full">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-slate-100 to-slate-200">
              <WashIcon className="h-14 w-14 text-slate-400" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/25 to-black/5" />

          {tagText && (
            <span className={`absolute start-3.5 top-3.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-sm ${tagCls}`}>{tagText}</span>
          )}
          <button
            type="button"
            aria-pressed={fav}
            aria-label={fav ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة'}
            onClick={() => onFav(w.id)}
            className={`absolute end-3.5 top-3.5 grid h-10 w-10 place-items-center rounded-full bg-white/85 shadow-sm ring-1 ring-white/60 backdrop-blur transition active:scale-90 ${fav ? 'text-red-500' : 'text-slate-600'}`}
          >
            <HeartIcon className="h-5 w-5" filled={fav} />
          </button>

          {/* أقربُ موعدٍ رقاقةٌ بارزةٌ على الصورة — أهمُّ ما يقرّر الحجز */}
          {slotLine && badge !== 'closed' && badge !== 'temp_closed' && badge !== 'paused' && (
            <span className={`absolute bottom-3.5 end-3.5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold shadow-sm ${badge === 'full' ? 'bg-white/90 text-amber-700' : 'bg-white/92 text-brand-700'}`}>
              <ClockIcon className="h-3.5 w-3.5" />
              {badge === 'available' || badge === 'full' ? slotLine : <>أقرب موعد {slotLine}</>}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-4 [text-shadow:0_1px_10px_rgba(0,0,0,.45)]">
            <h3 className="text-[19px] font-black leading-tight text-white">{w.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] font-semibold text-white/95">
              {rating ? (
                <span className="flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-amber-400" filled />
                  <b className="font-extrabold">{rating.avg}</b>
                  <span className="font-medium text-white/80">({rating.count})</span>
                </span>
              ) : (
                <span className="font-medium text-white/75">لا تقييمات بعد</span>
              )}
              <span className="flex items-center gap-1 font-medium text-white/90">
                <MapPinIcon className="h-3.5 w-3.5" />
                {w.area ? `${w.city} – ${w.area}` : w.city}
                {dist && <span className="text-white/75"> · {dist}</span>}
              </span>
            </div>
          </div>
        </div>

        {/* ── الجسم: الحالةُ والسعرُ والخدماتُ والحجز ── */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${BADGE_TONE[badge]}`}>{BADGE_LABELS[badge]}</span>
            {badge !== 'temp_closed' && <span className="text-[12px] font-medium text-slate-500">{hoursLine(w)}</span>}
          </div>

          {w.from_price != null && (
            <p className="mt-3 text-[13px] text-slate-500">
              يبدأ من <b className="text-[19px] font-black text-slate-900">{iqd(w.from_price)}</b>
            </p>
          )}
          {services.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
              {services.slice(0, 3).map((s, i) => (
                <span key={i} className="whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-800">
                  {s.name} · {iqd(s.price)}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <a
              href={noBooking ? detail : `/wash/book/?id=${w.id}`}
              aria-disabled={noBooking}
              className={`flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-brand text-[14px] font-extrabold text-white shadow-[0_6px_16px_rgba(21,128,61,0.28)] transition active:scale-[0.98] active:bg-brand-600 ${noBooking ? 'opacity-50' : ''}`}
            >
              احجز موعداً
            </a>
            <a
              href={detail}
              className="flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-100 px-4 text-[13px] font-bold text-slate-700 transition active:scale-[0.98] active:bg-slate-200"
            >
              التفاصيل
            </a>
            <div className="grid min-h-[48px] w-12 place-items-center rounded-2xl bg-slate-100">
              <RouteButton lat={w.lat} lng={w.lng} compact />
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
