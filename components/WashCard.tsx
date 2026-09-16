'use client';

import { BADGE_LABELS, BADGE_TONE, distanceLabel, hoursLine, iqd, ratingParts, time12, washBadge, type WashPublic } from '@/lib/wash';
import { RouteButton } from './RouteButton';
import { HeartIcon, MapPinIcon, StarIcon, WashIcon } from './icons';

/** بطاقةُ مغسلةٍ في الدليل. الخدماتُ والموعدُ الأقربُ يصلان من الأب — جلبةٌ واحدةٌ للقائمة كلِّها لا لكلّ بطاقة. */
export function WashCard({
  w,
  services,
  nextSlot,
  fav,
  onFav,
}: {
  w: WashPublic;
  /** خدماتُها النشطةُ مرتّبةً بـsort — تُعرض ثلاثٌ. */
  services: { name: string; price: number }[];
  /** من wash_next_slot_all(): null = لا موعدَ اليوم، undefined = لم يُجلب. */
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
  // سطرُ الموعد يُخفى حين لا معنى له: مغلقةٌ أو متوقّفة.
  const slotLine =
    badge === 'available' ? 'متاح الآن' : badge === 'full' ? 'لا مواعيد اليوم' : (badge === 'open' || badge === 'busy') && nextSlot ? time12(nextSlot) : null;

  return (
    <article className="card overflow-hidden">
      <div className="relative">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-slate-100">
            <WashIcon className="h-12 w-12 text-slate-400" />
          </div>
        )}
        {(w.sponsored || w.featured || w.has_offer) && (
          <span
            className={`absolute start-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${
              w.sponsored ? 'bg-slate-800' : w.featured ? 'bg-brand' : 'bg-amber-500'
            }`}
          >
            {w.sponsored ? 'إعلان' : w.featured ? 'مميزة' : 'عرض'}
          </span>
        )}
        <button
          type="button"
          aria-pressed={fav}
          aria-label={fav ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة'}
          onClick={() => onFav(w.id)}
          className={`absolute end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft ${fav ? 'text-red-500' : 'text-slate-500'}`}
        >
          <HeartIcon className="h-5 w-5" filled={fav} />
        </button>
      </div>

      <div className="p-4">
        <h3 className="text-base font-extrabold leading-snug text-slate-800">{w.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          {rating ? (
            <span className="flex items-center gap-1">
              <StarIcon className="h-3.5 w-3.5 text-amber-500" filled />
              <b className="text-slate-800">{rating.avg}</b>
              <span>{rating.count}</span>
            </span>
          ) : (
            <span className="text-slate-400">لا تقييمات بعد</span>
          )}
          <span>{w.area ? `${w.city} – ${w.area}` : `${w.city} – ${w.address}`}</span>
          {dist && (
            <span className="flex items-center gap-0.5">
              <MapPinIcon className="h-3.5 w-3.5" />
              {dist}
            </span>
          )}
        </div>

        <p className="mt-2 flex items-center gap-2 text-[12px] text-slate-500">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_TONE[badge]}`}>{BADGE_LABELS[badge]}</span>
          {/* «مغلقة مؤقّتاً» مع «تفتح الساعة…» تناقضٌ — يُكتفى بالشارة. */}
          {badge !== 'temp_closed' && <span>{hoursLine(w)}</span>}
        </p>

        {w.from_price != null && (
          <p className="mt-2 text-sm text-slate-700">
            يبدأ من <b className="font-extrabold text-slate-800">{iqd(w.from_price)}</b>
          </p>
        )}
        {services.length > 0 && (
          <div className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto">
            {services.slice(0, 3).map((s, i) => (
              <span key={i} className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                {s.name} · {iqd(s.price)}
              </span>
            ))}
          </div>
        )}

        {slotLine && (
          <p className="mt-2 text-sm text-slate-600">
            {badge === 'available' || badge === 'full' ? (
              <b className={`font-extrabold ${badge === 'full' ? 'text-amber-700' : 'text-brand-700'}`}>{slotLine}</b>
            ) : (
              <>
                أقرب موعد <b className="font-extrabold text-brand-700">{slotLine}</b>
              </>
            )}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <a href={noBooking ? detail : `/wash/book/?id=${w.id}`} aria-disabled={noBooking} className={`btn-primary flex-1 ${noBooking ? 'opacity-50' : ''}`}>
            احجز موعداً
          </a>
          <a href={detail} className="btn-ghost px-3">
            التفاصيل
          </a>
          <div className="w-24 rounded-xl border border-brand-100 py-1">
            <RouteButton lat={w.lat} lng={w.lng} compact />
          </div>
        </div>
      </div>
    </article>
  );
}
