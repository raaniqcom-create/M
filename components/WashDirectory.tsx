'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CITY_NAMES } from '@/lib/cities';
import { isOpenNow } from '@/lib/hours';
import { distanceKm } from '@/lib/stations';
import { quietPosition } from '@/lib/vote';
import { bgdDate, iqd, offerLeft, pct, rankWashes, readFavs, toggleFav, type WashAd, type WashOffer, type WashPublic } from '@/lib/wash';
import { WashHeader } from './WashHeader';
import { WashCard } from './WashCard';
import { WashAdsSlider, adHref } from './WashAdsSlider';
import { EMPTY_FILTERS, WashFilterSheet, WASH_KINDS, chipCls, kindMatches, sheetFilterCount, type WashFilters } from './WashFilterSheet';
import { SearchIcon, SlidersIcon, SpinnerIcon, WashIcon } from './icons';

type Svc = { id: string; wash_id: string; name: string; price: number; sort: number };
type Offer = Pick<WashOffer, 'id' | 'wash_id' | 'title' | 'description' | 'ends_at' | 'starts_at' | 'service_id' | 'offer_price' | 'discount_pct'>;
type Sort = 'rank' | 'near' | 'rating';
const FIRST = 6;

/** بحثٌ عربيٌّ متسامح: الهمزاتُ والتاءُ المربوطة والألفُ المقصورة تتساوى. */
const norm = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652]/g, '').toLowerCase();

/** الرئيسيةُ /wash/: رأسٌ، بحثٌ ومرشّحات، بانرات، بطاقاتُ المغاسل، عروضُ اليوم، ودعوةُ أصحاب المغاسل. */
export function WashDirectory() {
  const [rows, setRows] = useState<WashPublic[] | null>(null);
  const [services, setServices] = useState<Svc[]>([]);
  const [ads, setAds] = useState<WashAd[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  /** wash_id → أقربُ موعدٍ اليوم؛ undefined قبل الجلب فتبقى الشارةُ «مفتوحة». */
  const [nextSlots, setNextSlots] = useState<Record<string, string> | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);

  const [q, setQ] = useState('');
  const [f, setF] = useState<WashFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [sort, setSort] = useState<Sort>('rank');
  const [showAll, setShowAll] = useState(false);
  /** موقعُ القارئ: بلا سؤالٍ عند الفتح، ويُسأل مرّةً عند ضغط «الأقرب». */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState('');
  const asking = useRef(false);

  useEffect(() => {
    setFavs(readFavs());
    void quietPosition().then((p) => p && setHere(p));
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from('washes_public').select('*').order('name').range(0, 199),
      supabase.from('wash_services').select('id,wash_id,name,price,sort,active').eq('active', true).range(0, 999),
      supabase.from('wash_ads_public').select('*').range(0, 49),
      supabase.from('wash_offers').select('id,wash_id,title,description,ends_at,starts_at,service_id,offer_price,discount_pct').eq('active', true).range(0, 199),
      supabase.rpc('wash_next_slot_all'),
    ]).then(([w, s, a, o, n]) => {
      if (!alive) return;
      if (w.error) {
        setFailed(true);
        return;
      }
      setRows((w.data ?? []) as WashPublic[]);
      setServices(((s.data ?? []) as Svc[]).sort((x, y) => x.sort - y.sort));
      setAds(((a.data ?? []) as WashAd[]).sort((x, y) => y.priority - x.priority));
      setOffers((o.data ?? []) as Offer[]);
      if (!n.error) setNextSlots(Object.fromEntries(((n.data ?? []) as { wash_id: string; slot: string }[]).map((r) => [r.wash_id, r.slot])));
    });
    return () => {
      alive = false;
    };
  }, []);

  function nearest() {
    if (sort === 'near') return setSort('rank');
    if (here) return setSort('near');
    if (!navigator.geolocation) return setGeoMsg('تحديدُ الموقع غير متاحٍ على هذا الجهاز.');
    if (asking.current) return;
    asking.current = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        asking.current = false;
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoMsg('');
        setSort('near');
      },
      () => {
        asking.current = false;
        setGeoMsg('تعذّر تحديد موقعك — فعّل خدمة الموقع وأعد المحاولة.');
      },
      { maximumAge: 60_000, timeout: 8_000 }
    );
  }

  const all = rows ?? [];
  const svcOf = new Map<string, Svc[]>();
  for (const s of services) svcOf.set(s.wash_id, [...(svcOf.get(s.wash_id) ?? []), s]);
  const cities = CITY_NAMES.filter((c) => all.some((w) => w.city === c));
  const kinds = WASH_KINDS.map((k) => k.label).filter((k) => services.some((s) => kindMatches(k, s.name)));
  const needle = norm(q.trim());
  const area = norm(f.area.trim());

  const filtered = all
    .filter(
      (w) =>
        (!f.city || w.city === f.city) &&
        (!area || norm(w.area ?? '').includes(area) || norm(w.address).includes(area)) &&
        (!f.maxPrice || (w.from_price != null && w.from_price <= f.maxPrice)) &&
        (f.kinds.length === 0 || f.kinds.some((k) => (svcOf.get(w.id) ?? []).some((s) => kindMatches(k, s.name)))) &&
        (!f.minRating || Number(w.rating_avg ?? 0) >= f.minRating) &&
        (!f.openNow || isOpenNow(w)) &&
        (!f.bookable || (!w.paused && !w.temp_closed && svcOf.has(w.id))) &&
        (!f.hasOffer || w.has_offer) &&
        (!needle || [w.name, w.area ?? '', w.city, w.address, ...(svcOf.get(w.id) ?? []).map((s) => s.name)].some((t) => norm(t).includes(needle)))
    )
    .map((w) => ({ ...w, distanceKm: here ? distanceKm(here, w) : null, next_slot: nextSlots ? (nextSlots[w.id] ?? null) : undefined }));
  const ranked = rankWashes(filtered);
  const shown =
    sort === 'near'
      ? [...ranked].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      : sort === 'rating'
        ? [...ranked].sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0) || (b.rating_n ?? 0) - (a.rating_n ?? 0))
        : ranked;
  const visible = showAll ? shown : shown.slice(0, FIRST);

  const banners = ads.filter((a) => a.kind === 'banner' && (!f.city || !a.city || a.city === f.city));
  const adOffers = ads.filter((a) => a.kind === 'offer');
  const today = bgdDate();
  const byId = new Map(all.map((w) => [w.id, w]));
  const liveOffers = offers.filter((o) => byId.has(o.wash_id) && (!o.starts_at || o.starts_at.slice(0, 10) <= today) && (!o.ends_at || o.ends_at.slice(0, 10) >= today));
  /** سعرُ الخدمة قبل العرض: خدمتُه إن حُدّدت، وإلّا أرخصُ خدمات المغسلة. */
  const baseOf = (o: Offer): number | null => {
    const list = svcOf.get(o.wash_id) ?? [];
    const s = o.service_id ? list.find((x) => x.id === o.service_id) : undefined;
    if (s) return s.price;
    return list.length ? Math.min(...list.map((x) => x.price)) : null;
  };

  const sheetN = sheetFilterCount(f);
  const toggle = (k: 'openNow' | 'hasOffer') => setF((x) => ({ ...x, [k]: !x[k] }));

  return (
    <main className="mx-auto max-w-md px-4 pb-24">
      <WashHeader />

      {/* بحثٌ عائمٌ يتراكب على أسفل الرأس الغامر — نمطُ تطبيقات الحجز */}
      <div className="relative z-10 -mt-9">
        <label className="relative block rounded-2xl bg-white p-1 shadow-lift ring-1 ring-slate-200/70">
          <SearchIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-h-[52px] w-full rounded-xl border-0 bg-transparent pl-3 pr-11 font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-0"
            placeholder="ابحث باسم المغسلة أو المنطقة"
            aria-label="بحث"
          />
        </label>
      </div>

      <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto">
        <button type="button" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)} className={`${chipCls(sheetN > 0)} flex shrink-0 items-center gap-1`}>
          <SlidersIcon className="h-3.5 w-3.5" />
          كل المحطات
          {sheetN > 0 && <span className="rounded-full bg-white px-1.5 text-[10px] text-brand-700">{sheetN}</span>}
        </button>
        <button type="button" aria-pressed={f.openNow} onClick={() => toggle('openNow')} className={`${chipCls(f.openNow)} shrink-0`}>
          مفتوحة الآن
        </button>
        <button type="button" aria-pressed={sort === 'near'} onClick={nearest} className={`${chipCls(sort === 'near')} shrink-0`}>
          الأقرب
        </button>
        <button type="button" aria-pressed={f.hasOffer} onClick={() => toggle('hasOffer')} className={`${chipCls(f.hasOffer)} shrink-0`}>
          فيها عرض
        </button>
        <button type="button" aria-pressed={sort === 'rating'} onClick={() => setSort((s) => (s === 'rating' ? 'rank' : 'rating'))} className={`${chipCls(sort === 'rating')} shrink-0`}>
          الأعلى تقييماً
        </button>
      </div>
      {geoMsg && (
        <p role="status" className="mt-2 text-[12px] text-amber-700">
          {geoMsg}
        </p>
      )}

      <WashFilterSheet open={sheet} onClose={() => setSheet(false)} value={f} onApply={setF} cities={cities} kinds={kinds} />

      <WashAdsSlider ads={banners} />

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-[19px] font-black tracking-tight text-slate-900">{here ? 'مغاسل قريبة منك' : 'المغاسل'}</h2>
        {shown.length > FIRST && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="min-h-[44px] px-2 text-[12px] font-bold text-brand-700">
            {showAll ? 'عرض أقل' : 'عرض الكل'}
          </button>
        )}
      </div>

      {failed ? (
        <p role="alert" className="mt-8 text-center text-sm text-slate-500">
          تعذّر التحميل — تحقّق من الاتصال وأعد المحاولة.
        </p>
      ) : rows === null ? (
        <div className="flex justify-center py-12">
          <SpinnerIcon className="h-6 w-6 text-brand" />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">لا مغسلةَ تطابق هذا الاختيار.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {visible.map((w) => (
            <li key={w.id}>
              <WashCard
                w={w}
                services={svcOf.get(w.id) ?? []}
                nextSlot={w.next_slot}
                fav={favs.includes(w.id)}
                // الحالةُ من قيمة toggleFav لا من إعادة القراءة — فالتخزينُ قد يفشل في التصفّح الخاصّ.
                onFav={(id) => {
                  const on = toggleFav(id);
                  setFavs((v) => (on ? [id, ...v.filter((x) => x !== id)] : v.filter((x) => x !== id)));
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {(liveOffers.length > 0 || adOffers.length > 0) && (
        <section className="mt-9">
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">عروض اليوم</h2>
          <ul className="mt-3 space-y-3">
            {liveOffers.map((o) => {
              const base = baseOf(o);
              const left = offerLeft(o.ends_at);
              return (
                <li key={o.id} className="rounded-2xl bg-brand-600/90 pb-[5px]">
                  {/* الشفةُ الخضراء تحت البطاقة — لغةُ البطاقات نفسُها في القسم كلِّه. */}
                  <article className="card p-4">
                    <p className="text-[12px] text-slate-500">{byId.get(o.wash_id)?.name}</p>
                    <h3 className="mt-0.5 text-base font-extrabold text-slate-800">{o.title}</h3>
                    {o.description && <p className="mt-1 text-sm text-slate-600">{o.description}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      {o.offer_price != null ? (
                        <>
                          {base != null && base > o.offer_price && <span className="text-slate-400 line-through">بدلاً من {iqd(base)}</span>}
                          <b className="font-extrabold text-brand-700">الآن {iqd(o.offer_price)}</b>
                        </>
                      ) : (
                        o.discount_pct != null && <b className="font-extrabold text-brand-700">خصم {pct(o.discount_pct)}</b>
                      )}
                      {left && <span className="text-[12px] text-amber-700">{left}</span>}
                    </p>
                    <a href={`/wash/book/?id=${o.wash_id}&offer=${o.id}&service=${o.service_id ?? ''}`} className="btn-primary mt-3">
                      استفد من العرض
                    </a>
                  </article>
                </li>
              );
            })}
            {adOffers.map((a) => {
              const href = adHref(a);
              const ext = /^https?:/.test(href);
              return (
                <li key={a.id} className="rounded-2xl bg-brand-600/90 pb-[5px]">
                  <article className="card overflow-hidden">
                    {a.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image_url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    )}
                    <div className="p-4">
                      {a.sponsored && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10.5px] font-bold text-white">إعلان</span>}
                      <h3 className="mt-1 text-base font-extrabold text-slate-800">{a.title}</h3>
                      {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
                      <a href={href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined} className="btn-primary mt-3">
                        استفد من العرض
                      </a>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="relative mt-9 overflow-hidden rounded-[26px] bg-[linear-gradient(140deg,#0c3a21,#14532d_45%,#15803d)] p-6 text-center text-white shadow-lift">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <WashIcon className="h-7 w-7 text-white" />
          </span>
          <h2 className="mt-3 text-[20px] font-black">لديك مغسلة سيارات؟</h2>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[13.5px] font-medium text-brand-100">انضم إلى المحطة التقنية واستقبل حجوزاتك إلكترونياً.</p>
          <a
            href="/wash/register/"
            className="mt-4 inline-flex min-h-[50px] w-full max-w-[300px] items-center justify-center rounded-2xl bg-white text-[15px] font-extrabold text-brand-800 shadow-sm transition active:scale-[0.98]"
          >
            سجّل مغسلتك
          </a>
          <p className="mt-3 text-[12px] font-medium text-brand-100/80">اشتراك شهري · إدارة حجوزات · عروض · صفحة خاصة لمغسلتك</p>
        </div>
      </section>
      <a href="/login/" className="mt-5 block text-center text-[12px] font-medium text-slate-400 underline underline-offset-2">
        صاحب مغسلة؟ الدخول إلى لوحتك
      </a>
    </main>
  );
}
