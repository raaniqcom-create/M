'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { num } from '@/lib/num';
import { displayPhone, isValidIraqiMobile } from '@/lib/phone';
import { distanceKm } from '@/lib/stations';
import { quietPosition } from '@/lib/vote';
import {
  BADGE_LABELS,
  BADGE_TONE,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  at12,
  bgdDate,
  bookingHref,
  dateLine,
  distanceLabel,
  hoursLine,
  iqd,
  loyaltyLine,
  offerLeft,
  pct,
  ratingParts,
  readFavs,
  readMyBookings,
  serviceIconKey,
  servicePrice,
  toggleFav,
  washBadge,
  type WashOffer,
  type WashPublic,
  type WashReview,
  type WashService,
} from '@/lib/wash';
import { seenWash } from '@/lib/washViews';
import { RouteCell } from './WashBookingScreen';
import { CalendarIcon, ClockIcon, HeartIcon, MapPinIcon, PhoneIcon, SERVICE_ICON, ShareIcon, SpinnerIcon, StarIcon, TagIcon, WashIcon, XIcon } from './icons';

type Slot = { slot: string; free: number };
type Stamps = { stamps: number; free: number; target: number };

/** رقمُ الشريحة الظاهرة في قائمةٍ أفقيّة — scrollLeft سالبٌ في RTL فيُؤخذ مطلقُه. */
const slideIndex = (el: HTMLElement) => Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth));

/** صفحةُ المغسلة: معرضٌ، وبطاقةُ التعريف، والخدماتُ والعروض، وبطاقةُ الغسلات — والحجزُ في /wash/book/. */
export function WashDetail() {
  const id = useSearchParams().get('id') ?? '';
  const [wash, setWash] = useState<WashPublic | null | undefined>(undefined);
  /** فشلُ القراءة لا يعني «لا وجودَ لها» — تُفصل عن null كي لا نكذب على القارئ. */
  const [failed, setFailed] = useState(false);
  const [services, setServices] = useState<WashService[]>([]);
  const [offers, setOffers] = useState<WashOffer[]>([]);
  const [mine, setMine] = useState<ReturnType<typeof readMyBookings>>([]);
  const [fav, setFav] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  /** أقربُ موعدٍ حرٍّ اليوم — يُقرأ مرّةً عند فتح الصفحة (الشارةُ تحتاجه). */
  const [nextSlot, setNextSlot] = useState<string | null | undefined>(undefined);
  /** آخرُ التقييمات — تُجلب عند الضغط لا مع الصفحة. */
  const [reviews, setReviews] = useState<WashReview[] | null>(null);

  // المعرض
  const [slide, setSlide] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const galRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // بطاقةُ الغسلات
  const [stampsPhone, setStampsPhone] = useState('');
  const [stamps, setStamps] = useState<Stamps | null>(null);
  const [stampsBusy, setStampsBusy] = useState(false);

  async function loadReviews() {
    const { data } = await supabase.from('wash_reviews_public').select('id, wash_id, stars, comment, name, created_at').eq('wash_id', id).order('created_at', { ascending: false }).limit(5);
    setReviews((data as WashReview[] | null) ?? []);
  }

  useEffect(() => {
    if (!id) return;
    seenWash(id, 'view');
    setFav(readFavs().includes(id));
    setMine(readMyBookings().filter((b) => b.wash_id === id));
    try {
      setStampsPhone((JSON.parse(localStorage.getItem('wash-me') ?? '{}') as { phone?: string }).phone ?? '');
    } catch {
      /* تصفّحٌ خاصّ */
    }
    let alive = true;
    void quietPosition().then((p) => alive && setPos(p));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      supabase.from('washes_public').select('*').eq('id', id).maybeSingle(),
      supabase.from('wash_services').select('*').eq('wash_id', id).eq('active', true).order('sort').limit(50),
      supabase.from('wash_offers').select('*').eq('wash_id', id).eq('active', true).limit(20),
      supabase.rpc('wash_slots', { p_wash: id, p_day: bgdDate() }),
    ]).then(([w, s, o, sl]) => {
      if (!alive) return;
      if (w.error) {
        setFailed(true);
        return;
      }
      const today = bgdDate();
      setWash((w.data as WashPublic | null) ?? null);
      setServices((s.data ?? []) as WashService[]);
      setOffers(((o.data ?? []) as WashOffer[]).filter((x) => (!x.ends_at || x.ends_at.slice(0, 10) >= today) && (!x.starts_at || x.starts_at.slice(0, 10) <= today)));
      // فشلُ wash_slots يُبقي nextSlot=undefined فتبقى الشارةُ «مفتوحة» — لا «ممتلئة اليوم» كذباً.
      if (!sl.error) {
        const first = ((sl.data ?? []) as Slot[]).find((x) => x.free > 0);
        setNextSlot(first ? first.slot : null);
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // فتحُ المعرض الكبير على الصورة المضغوطة نفسِها.
  useEffect(() => {
    if (lightbox !== null) boxRef.current?.children[lightbox]?.scrollIntoView({ inline: 'start', block: 'nearest' });
  }, [lightbox]);

  /** إغلاقُ المعرض الكبير — تُزحلق المصغّراتُ إلى الصورة التي وصل إليها كي لا يكذب العدّاد. */
  function closeBox() {
    galRef.current?.children[slide]?.scrollIntoView({ inline: 'start', block: 'nearest' });
    setLightbox(null);
  }

  async function showStamps() {
    if (!wash || !isValidIraqiMobile(stampsPhone)) return;
    setStampsBusy(true);
    const { data } = await supabase.rpc('wash_stamps_for', { p_wash: wash.id, p_phone: displayPhone(stampsPhone) });
    setStampsBusy(false);
    const r = (Array.isArray(data) ? data[0] : data) as Stamps | null | undefined;
    setStamps(r ?? { stamps: 0, free: 0, target: wash.loyalty_target });
  }

  function share() {
    if (!wash) return;
    const url = location.href;
    if (navigator.share) void navigator.share({ title: wash.name, url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(url);
  }

  if (!id) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لا مغسلةَ في الرابط. <a href="/wash/" className="font-bold text-brand underline">دليل المغاسل</a>
      </main>
    );
  }
  if (failed) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500" role="alert">
        تعذّر التحميل — تحقّق من الاتصال وأعد المحاولة.
      </main>
    );
  }
  if (wash === undefined) {
    return (
      <main className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }
  if (wash === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لم نجد هذه المغسلة. <a href="/wash/" className="font-bold text-brand underline">دليل المغاسل</a>
      </main>
    );
  }

  const images = [wash.image_url, ...(wash.photos ?? [])].filter((u): u is string => !!u);
  const rating = ratingParts(wash.rating_avg, wash.rating_n);
  const badge = washBadge(wash, nextSlot);
  const dist = pos ? distanceLabel(distanceKm(pos, wash)) : null;
  const line = stamps ? loyaltyLine(stamps.stamps, stamps.target, stamps.free) : null;
  const minPrice = services.length ? Math.min(...services.map((s) => s.price)) : null;
  const cannot = wash.temp_closed ? 'المغسلة مغلقة مؤقّتاً' : wash.paused ? 'الحجوزات متوقّفة حاليّاً' : services.length === 0 ? 'لم تُضف المغسلة خدماتها بعد' : '';

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      {/* المعرض */}
      <div className="relative">
        {images.length === 0 ? (
          <div className="flex aspect-video items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
            <WashIcon className="h-12 w-12" />
          </div>
        ) : (
          <div ref={galRef} onScroll={(e) => setSlide(slideIndex(e.currentTarget))} className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto">
            {images.map((u, i) => (
              <button key={u} type="button" aria-label={`صورة ${i + 1}`} onClick={() => setLightbox(i)} className="w-full shrink-0 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" loading={i ? 'lazy' : undefined} className="aspect-video w-full rounded-2xl object-cover" />
              </button>
            ))}
          </div>
        )}
        {images.length > 1 && (
          <span dir="ltr" className="absolute bottom-2 end-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
            {slide + 1} / {images.length}
          </span>
        )}
      </div>

      {/* بطاقةُ التعريف */}
      <article className="card mt-3 p-4">
        <h1 className="text-lg font-extrabold leading-snug text-slate-800">{wash.name}</h1>
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-slate-700">
          <StarIcon className="h-4 w-4 text-amber-500" filled />
          {rating ? (
            <>
              <b>{rating.avg}</b>
              <span className="text-slate-400">·</span>
              {rating.count}
              {reviews === null && (
                <button type="button" onClick={loadReviews} className="-my-3 ms-1 px-1 py-3 text-[12px] font-bold text-brand-700 underline">
                  اعرض التقييمات
                </button>
              )}
            </>
          ) : (
            <span className="text-slate-500">لا تقييمات بعد</span>
          )}
        </p>
        {reviews && (
          <ul className="mt-2 space-y-1.5">
            {reviews.length === 0 && <li className="text-[12px] text-slate-400">لا تقييمات بعد.</li>}
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-50 px-3 py-2 text-[12px]">
                <span className="inline-flex gap-0.5 align-middle text-amber-500">
                  {Array.from({ length: r.stars }, (_, i) => (
                    <StarIcon key={i} className="h-3.5 w-3.5" filled />
                  ))}
                </span>
                <span className="ms-2 text-slate-400">{r.name}</span>
                {r.comment && <p className="mt-0.5 text-slate-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 flex items-center gap-1 text-[13px] font-bold text-slate-700">
          <MapPinIcon className="h-4 w-4 shrink-0 text-brand" />
          {wash.city} – {wash.area || wash.address}
        </p>
        {wash.area && <p className="ms-5 text-[12px] text-slate-500">{wash.address}</p>}
        {dist && <p className="ms-5 mt-0.5 text-[12px] text-slate-500">{dist} عن موقعك</p>}

        <p className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_TONE[badge]}`}>{BADGE_LABELS[badge]}</span>
          {hoursLine(wash)}
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('[data-route] a,[data-route] button')) seenWash(wash.id, 'route'); }}>
          {wash.phone ? (
            <a href={`tel:${wash.phone}`} onClick={() => seenWash(wash.id, 'call')} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-brand-50 text-[11px] font-bold text-brand-800">
              <PhoneIcon className="h-6 w-6" />
              اتصال
            </a>
          ) : (
            <span aria-disabled className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-[11px] font-bold text-slate-300">
              <PhoneIcon className="h-6 w-6" />
              اتصال
            </span>
          )}
          {/* زرُّ الطريق كما هو (Waze/Google) بوسم «موقع» — يُعاد تشكيلُه ليطابق الخانات الثلاث الأخرى. */}
          <RouteCell
            data-route
            lat={wash.lat}
            lng={wash.lng}
            compact
            className="rounded-xl bg-brand-50 text-brand-800 [&>div>button]:min-h-[64px] [&>div>button]:rounded-xl [&>div>div]:min-w-[11rem]"
            labelClass="flex-col text-[11px] font-bold"
          >
            <MapPinIcon className="h-6 w-6" />
            موقع
          </RouteCell>
          <button type="button" onClick={share} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-brand-50 text-[11px] font-bold text-brand-800">
            <ShareIcon className="h-6 w-6" />
            مشاركة
          </button>
          <button type="button" aria-pressed={fav} onClick={() => setFav(toggleFav(wash.id))} className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${fav ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-800'}`}>
            <HeartIcon className="h-6 w-6" filled={fav} />
            مفضلة
          </button>
        </div>
      </article>

      {/* الخدمات */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">الخدمات والأسعار</h2>
        {services.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-400">لم تُضف المغسلة خدماتها بعد.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {services.map((s) => {
              const Icon = SERVICE_ICON[serviceIconKey(s.name)];
              const prices = s.prices ?? {};
              const keys = VEHICLE_TYPES.filter((v) => typeof prices[v] === 'number');
              // بأسعارٍ لكلّ نوعٍ لا سعرَ واحد: البلاطةُ تقول «يبدأ من» أرخصِها — عبر servicePrice
              // على الأنواع كلِّها، لأنّ نوعاً بلا سعرٍ في الخريطة يُحسب بالسعر الأساسيّ لا بأدنى الخريطة.
              const from = keys.length ? Math.min(...VEHICLE_TYPES.map((v) => servicePrice(s, v))) : null;
              return (
                // الشفةُ الملوّنة: صندوقٌ أخضرُ خلف البلاطة يطلّ شريطاً من تحتها — بلون الشفة نفسِه في القسم كلِّه.
                <div key={s.id} className="rounded-[22px] bg-brand-600/90 pb-[4px]">
                  <a
                    href={`/wash/book/?id=${wash.id}&service=${s.id}`}
                    // h-full كي تتمدّد البلاطةُ البيضاءُ إلى ارتفاع الصفّ، وإلّا اتّسعت الشفةُ الخضراءُ تحت الأقصر.
                    className="flex h-full min-h-[136px] flex-col items-center rounded-[22px] bg-white px-3 py-3.5 text-center ring-1 ring-slate-200/70 transition active:scale-[0.98]"
                  >
                    <Icon className="h-8 w-8 text-brand-700" />
                    <p className="mt-2 line-clamp-2 text-[13px] font-extrabold leading-tight text-slate-800">{s.name}</p>
                    {/* وصفُ صاحب المغسلة — كان يختفي مع تحوّل القائمة إلى بلاطات. */}
                    {s.description && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{s.description}</p>}
                    <p className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-500">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {s.minutes} دقيقة
                    </p>
                    <p className="mt-auto pt-1.5 text-[13px] font-black text-brand-700">{from != null ? `يبدأ من ${iqd(from)}` : iqd(s.price)}</p>
                    {keys.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap justify-center gap-1">
                        {keys.slice(0, 3).map((v) => (
                          <li key={v} className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                            {VEHICLE_LABELS[v]} {num(prices[v])}
                          </li>
                        ))}
                      </ul>
                    )}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* العروض */}
      {offers.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
            <TagIcon className="h-4 w-4 text-amber-500" />
            عروض المغسلة
          </h2>
          <ul className="mt-2 space-y-2">
            {offers.map((o) => {
              const base = (o.service_id ? services.find((s) => s.id === o.service_id)?.price : null) ?? wash.from_price ?? minPrice;
              const left = offerLeft(o.ends_at);
              return (
                <li key={o.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-sm font-extrabold text-amber-900">{o.title}</p>
                  {o.description && <p className="mt-0.5 text-[12px] text-amber-800">{o.description}</p>}
                  <p className="mt-1.5 text-[13px]">
                    {o.offer_price != null ? (
                      <>
                        {base != null && <span className="text-slate-400 line-through">بدلاً من {iqd(base)}</span>} <b className="text-brand-700">الآن {iqd(o.offer_price)}</b>
                      </>
                    ) : o.discount_pct != null ? (
                      <b className="text-brand-700">خصم {pct(o.discount_pct)}</b>
                    ) : null}
                    {left && <span className="ms-2 text-[11px] text-slate-500">{left}</span>}
                  </p>
                  <a href={`/wash/book/?id=${wash.id}&service=${o.service_id ?? ''}&offer=${o.id}`} className="btn-primary mt-2 min-h-[40px] text-[12px]">
                    استفد من العرض
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {wash.loyalty_target > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
            <StarIcon className="h-4 w-4 text-amber-500" filled />
            بطاقة الغسلات — {wash.loyalty_target} غسلات و{wash.loyalty_target === 5 ? 'السادسة' : 'التالية'} مجّاناً
          </h2>
          <div className="mt-3 flex gap-2">
            <input type="tel" dir="ltr" inputMode="tel" placeholder="07XXXXXXXXX" value={stampsPhone} onChange={(e) => setStampsPhone(e.target.value)} className="field" aria-label="رقم الهاتف" />
            <button type="button" onClick={showStamps} disabled={stampsBusy || !isValidIraqiMobile(stampsPhone)} className="btn-ghost shrink-0">
              {stampsBusy ? <SpinnerIcon className="h-4 w-4" /> : 'اعرض بطاقتي'}
            </button>
          </div>
          {line && <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] font-bold text-brand-800">{line}</p>}
        </section>
      )}

      {mine.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="text-sm font-extrabold text-slate-800">حجوزاتي في هذه المغسلة</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-[13px]">
            {mine.map((b) => (
              <li key={b.code}>
                <a href={bookingHref(b.code, b.phone)} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                  <span className="text-slate-700">
                    {dateLine(b.starts_at)} · {at12(b.starts_at)}
                  </span>
                  <span className="font-mono font-bold text-brand-700" dir="ltr">
                    {b.code}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a href="/wash/mine/" className="mt-2 flex min-h-[44px] items-center justify-center text-[12px] font-bold text-brand-700 underline">
            كلّ حجوزاتي
          </a>
        </section>
      )}

      {/* شريطُ الحجز الثابت */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-md px-4 py-3">
          {cannot ? (
            <button type="button" disabled className="btn-primary w-full">
              {cannot}
            </button>
          ) : (
            <a href={`/wash/book/?id=${wash.id}`} className="btn-primary w-full">
              <CalendarIcon className="h-4 w-4" />
              احجز موعداً
            </a>
          )}
        </div>
      </div>

      {/* المعرضُ الكبير */}
      {lightbox !== null && (
        <div role="dialog" aria-modal="true" aria-label="الصور" onKeyDown={(e) => e.key === 'Escape' && closeBox()} className="fixed inset-0 z-50 bg-black/90">
          {/* التركيزُ على زرّ الإغلاق كي يصل Escape إلى الحوار لا إلى الصفحة خلفه. */}
          <button type="button" autoFocus onClick={closeBox} aria-label="إغلاق" className="absolute end-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" style={{ marginTop: 'env(safe-area-inset-top)' }}>
            <XIcon className="h-6 w-6" />
          </button>
          <div ref={boxRef} onScroll={(e) => setSlide(slideIndex(e.currentTarget))} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto">
            {images.map((u) => (
              <div key={u} className="flex h-full w-full shrink-0 snap-start items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <span dir="ltr" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-white" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
              {slide + 1} / {images.length}
            </span>
          )}
        </div>
      )}
    </main>
  );
}
