'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ANBAR_CITIES, CITY_NAMES } from '@/lib/cities';
import { readChoice } from '@/lib/alerts';
import { num } from '@/lib/num';
import { useWashConfig } from '@/lib/washConfig';
import { WashVehiclePicker } from './WashVehiclePicker';
import { isOpenNow } from '@/lib/hours';
import { distanceKm } from '@/lib/stations';
import { quietPosition } from '@/lib/vote';
import {
  servicePrice,
  VEHICLE_TYPES,
  bgdDate,
  iqd,
  offerLeft,
  pct,
  rankWashes,
  readFavs,
  readMyBookings,
  readSize,
  toggleFav,
  bookingHref,
  type MyBooking,
  type VehicleCounts,
  type WashAd,
  type WashOffer,
  type WashPublic,
} from '@/lib/wash';
import { WashHeader } from './WashHeader';
import { WashCard } from './WashCard';
import { WashAdsSlider, adHref } from './WashAdsSlider';
import { EMPTY_FILTERS, WashFilterSheet, WASH_KINDS, kindMatches, sheetFilterCount, type WashFilters } from './WashFilterSheet';
import { WashUIIcon as Icon } from './WashUIIcon';

type Svc = { id: string; wash_id: string; name: string; price: number; prices?: Record<string, number> | null; sort: number };
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
  const [retry, setRetry] = useState(0);
  const [partial, setPartial] = useState(false);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);
  /** حجمُ سيّارته المحفوظُ على الجهاز — يُقرأ في أثرٍ لا أثناء الرسم كي يبقى التصديرُ الساكنُ ثابتاً. */
  const [size, setSize] = useState<VehicleCounts>({});

  const [q, setQ] = useState('');
  const [f, setF] = useState<WashFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [sort, setSort] = useState<Sort>('rank');
  const [showAll, setShowAll] = useState(false);
  /** موقعُ القارئ: بلا سؤالٍ عند الفتح، ويُسأل مرّةً عند ضغط «الأقرب». */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const asking = useRef(false);

  const cfg = useWashConfig();
  /** مدينةُ الزائر للإعلان: مدينةُ الفلتر، وإلّا مدينةُ تنبيهات الوقود، وإلّا أقربُ مدينةٍ لموقعه. */
  const [homeCity, setHomeCity] = useState('');
  const [reach, setReach] = useState<number | null>(null);
  /** حجزٌ مكتملٌ لم يُقيَّم بعد — بانرُ «قيّم غسلتك». */
  const [toRate, setToRate] = useState<MyBooking | null>(null);
  const heroTrack = useRef<HTMLDivElement>(null);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    setFavs(readFavs());
    setSize(readSize());
    setHomeCity(readChoice()?.cities?.[0] ?? '');
    void quietPosition().then((p) => p && setHere(p)).catch(() => undefined);
    const mine = readMyBookings();
    if (!mine.length) return;
    // الحدودُ نفسُها في review_wash: مكتملٌ خلال 14 يوماً ولم يُقيَّم.
    const byPhone = new Map<string, string[]>();
    for (const b of mine) byPhone.set(b.phone, [...(byPhone.get(b.phone) ?? []), b.code]);
    void Promise.all([...byPhone].map(([phone, codes]) => supabase.rpc('wash_my_bookings', { p_codes: codes.slice(0, 20), p_phone: phone }))).then((res) => {
      const rows = res.flatMap((r) => (r.data ?? []) as { code: string; status: string; starts_at: string; reviewed?: boolean; wash: string; wash_id: string }[]);
      const r = rows.find((x) => x.status === 'completed' && x.reviewed === false && Date.now() - new Date(x.starts_at).getTime() < 14 * 864e5);
      const local = r && mine.find((b) => b.code === r.code);
      if (local) setToRate({ ...local, wash: r.wash, wash_id: r.wash_id, starts_at: r.starts_at });
    }).catch(() => undefined);
  }, []);

  const promoCity = f.city || homeCity || (here ? ANBAR_CITIES.reduce((a, c) => (distanceKm(here, c) < distanceKm(here, a) ? c : a)).name : '');
  useEffect(() => {
    if (!promoCity) return;
    let alive = true;
    setReach(null);
    void supabase.rpc('watchers_by_city', { p_cities: [promoCity] }).then(({ data }) => {
      if (alive) setReach((data as { city: string; watchers: number }[] | null)?.[0]?.watchers ?? null);
    });
    return () => { alive = false; };
  }, [promoCity]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setFailed(false);
    setPartial(false);
    setRows(null);
    setServices([]); setAds([]); setOffers([]); setNextSlots(undefined);
    Promise.allSettled([
      supabase.from('washes_public').select('*').order('name').range(0, 199).abortSignal(controller.signal),
      supabase.from('wash_services').select('id,wash_id,name,price,prices,sort,active').eq('active', true).range(0, 999).abortSignal(controller.signal),
      supabase.from('wash_ads_public').select('*').range(0, 49).abortSignal(controller.signal),
      supabase.from('wash_offers').select('id,wash_id,title,description,ends_at,starts_at,service_id,offer_price,discount_pct').eq('active', true).range(0, 199).abortSignal(controller.signal),
      supabase.rpc('wash_next_slot_all').abortSignal(controller.signal),
    ]).then(([wr, sr, ar, or, nr]) => {
      const w = wr.status === 'fulfilled' ? wr.value : { data: null, error: true };
      const s = sr.status === 'fulfilled' ? sr.value : { data: null, error: true };
      const a = ar.status === 'fulfilled' ? ar.value : { data: null, error: true };
      const o = or.status === 'fulfilled' ? or.value : { data: null, error: true };
      const n = nr.status === 'fulfilled' ? nr.value : { data: null, error: true };
      if (!alive) return;
      if (w.error) {
        setFailed(true);
        return;
      }
      setPartial(!!(s.error || a.error || o.error || n.error));
      setRows((w.data ?? []) as WashPublic[]);
      setServices(((s.data ?? []) as Svc[]).sort((x, y) => x.sort - y.sort));
      setAds(((a.data ?? []) as WashAd[]).sort((x, y) => y.priority - x.priority));
      setOffers((o.data ?? []) as Offer[]);
      if (!n.error) setNextSlots(Object.fromEntries(((n.data ?? []) as { wash_id: string; slot: string }[]).map((r) => [r.wash_id, r.slot])));
    }).catch(() => { if (alive) setFailed(true); }).finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [retry]);

  useEffect(() => { setShowAll(false); }, [q, f, onlyFavs, sort]);

  function nearest() {
    if (sort === 'near') return setSort('rank');
    if (here) return setSort('near');
    if (!navigator.geolocation) return setGeoMsg('تحديدُ الموقع غير متاحٍ على هذا الجهاز.');
    if (asking.current) return;
    asking.current = true;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        asking.current = false;
        setLocating(false);
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoMsg('');
        setSort('near');
      },
      () => {
        asking.current = false;
        setLocating(false);
        setGeoMsg('تعذّر تحديد موقعك — فعّل خدمة الموقع وأعد المحاولة.');
      },
      { maximumAge: 60_000, timeout: 8_000 }
    );
  }

  const sizePicked = VEHICLE_TYPES.filter((v) => (size[v] ?? 0) > 0);
  const vehicle = sizePicked.length === 1 ? sizePicked[0] : null;
  const pricedServices = services.map(s => ({ ...s, price: servicePrice(s, vehicle) }));
  const all = (rows ?? []).map(w => {
    const list = pricedServices.filter(s => s.wash_id === w.id);
    return { ...w, from_price: list.length ? Math.min(...list.map(s => s.price)) : w.from_price };
  });
  const svcOf = new Map<string, Svc[]>();
  for (const s of pricedServices) svcOf.set(s.wash_id, [...(svcOf.get(s.wash_id) ?? []), s]);
  const cities = Array.from(new Set([...CITY_NAMES.filter(c => all.some(w => w.city === c)), ...all.map(w => w.city)])).filter(Boolean);
  const kinds = WASH_KINDS.map((k) => k.label).filter((k) => services.some((s) => kindMatches(k, s.name)));
  const needle = norm(q.trim());
  const area = norm(f.area.trim());

  const filtered = all
    .filter(
      (w) =>
        (!onlyFavs || favs.includes(w.id)) &&
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
  // إعلانُ المنصّة الأوّل: «سجّل مغسلتك» بعدد مشتركي مدينة الزائر — مدفوعٌ فوق ألف، ومجّانيٌّ لفترةٍ دونها.
  // ponytail: بلا صفٍّ في القاعدة؛ يُنقل إلى wash_ads حين يلزم تعديلُ النصّ بلا نشر.
  const paid = (reach ?? 0) >= 1000;
  const promo: WashAd | null = promoCity && reach != null ? {
    id: 'promo', kind: 'banner', sponsored: false, priority: 101, city: promoCity, image_url: null, wash_id: null, offer_id: null, starts_at: null, ends_at: null,
    title: `سجّل مغسلتك في ${promoCity}`,
    description: `أضف خدماتك ليراها ${num(reach)} مشترك في ${promoCity} — ${paid ? `اشتراك يبدأ من ${iqd(cfg?.plans[0]?.price_iqd ?? 40000)} شهرياً` : 'مجاناً لفترة محدودة'}`,
    url: `/wash/register/?city=${encodeURIComponent(promoCity)}&promo=${paid ? 'paid' : 'free'}`,
  } : null;
  const slides = promo ? [promo, ...banners] : banners;
  // حين تظهر شريحةُ الإعلان (بعد وصول العدد) يبقى المتصفّحُ مثبّتاً على الشريحة القديمة — نعيده إلى الأولى.
  const hasPromo = !!promo;
  useEffect(() => { if (hasPromo) heroTrack.current?.scrollTo({ left: 0 }); }, [hasPromo]);
  const adOffers = ads.filter((a) => a.kind === 'offer' && (!f.city || !a.city || a.city === f.city));
  const today = bgdDate();
  const byId = new Map(all.map((w) => [w.id, w]));
  const liveOffers = offers.filter((o) => byId.has(o.wash_id) && (!f.city || byId.get(o.wash_id)?.city === f.city) && (!o.starts_at || o.starts_at.slice(0, 10) <= today) && (!o.ends_at || o.ends_at.slice(0, 10) >= today));
  /** سعرُ الخدمة قبل العرض: خدمتُه إن حُدّدت، وإلّا أرخصُ خدمات المغسلة. */
  const baseOf = (o: Offer): number | null => {
    const list = svcOf.get(o.wash_id) ?? [];
    const s = o.service_id ? list.find((x) => x.id === o.service_id) : undefined;
    if (s) return s.price;
    return list.length ? Math.min(...list.map((x) => x.price)) : null;
  };

  const sheetN = sheetFilterCount(f);
  const toggle = (k: 'openNow' | 'hasOffer') => setF((x) => ({ ...x, [k]: !x[k] }));

  function scrollToResults() { document.getElementById('discover')?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
  function favoriteView() { setOnlyFavs(x => !x); requestAnimationFrame(scrollToResults); }
  function saveFavorite(id: string) {
    toggleFav(id);
    setFavs(readFavs());
  }
  return <main dir="rtl" lang="ar" className="wash-page">
    <WashHeader city={f.city} onCity={() => setSheet(true)} onFavorites={favoriteView} favorites={onlyFavs} />
    <div className="wash-content">
      <div className="wash-welcome"><div><p>اهتمام يليق بسيارتك</p><h1>نظافة تفرق. ووقت لك.</h1></div><span><Icon name="pin" size={15}/>{f.city ? `الأنبار · ${f.city}` : 'العراق · الأنبار'}</span></div>
      {/* الشريحةُ الأولى لأصحاب المغاسل حين تُعرف مدينةُ الزائر وعددُ مشتركيها؛ وبعدها البطاقةُ الغامرة. */}
      <div className="wash-hero-track" ref={heroTrack} onScroll={() => { const el = heroTrack.current; if (el) setHeroIdx(Math.round(Math.abs(el.scrollLeft) / el.clientWidth) === 0 ? 0 : 1); }}>
      {promo && <section className="wash-hero wash-hero-promo" aria-label="سجّل محطتك">
        <img className="wash-hero-mark" src="/wash/mark-t.png" alt="" aria-hidden />
        <div className="wash-hero-copy"><span className="wash-hero-kicker"><span/>لأصحاب المغاسل — المستفيدون الأوّلون</span><h2>سجّل محطتك<br/><em>وكن من المستفيدين الأوّلين.</em></h2><p><b className="wash-reach"><span>{num(reach ?? 0)}</span><small>مشترك</small></b><br/>من مدينة {promoCity} يرون عروضك — أرسلها بضغطة واحدة!</p><a className="wash-hero-cta" href={promo.url ?? '/wash/register/'}>سجّل هسّة وحوّل محطتك إلى محطة تقنية<Icon name="arrow"/></a></div>
      </section>}
      <section className="wash-hero" aria-labelledby="hero-title">
        <img className="wash-hero-photo" src="/wash/wash-hero.jpg" alt="العناية بغسل سيارة بالرغوة" fetchPriority="high" />
        <div className="wash-hero-copy"><span className="wash-hero-kicker"><span/>كل تفصيلة تستاهل اهتمام</span><h2 id="hero-title">إحساس السيارة الجديدة،<br/><em>مع كل غسلة.</em></h2><p>مغاسل تختارها، أسعار تقارنها،<br/>وموعد يناسب يومك.</p><button className="wash-hero-cta" onClick={scrollToResults}>اكتشف مغسلتك<Icon name="arrow"/></button></div>
        <div className="wash-hero-caption"><img src="/wash/mark.png" alt="" /><div><b>عناية تبدأ من أول تفصيلة</b><small>غسل · تنظيف داخلي · تلميع</small></div></div>
      </section>
      </div>
      {promo && <div className="wash-ad-dots wash-hero-dots">{[0, 1].map((i) => <button key={i} type="button" aria-label={i === 0 ? 'إعلان أصحاب المغاسل' : 'الترحيب'} aria-current={heroIdx === i} onClick={() => { const el = heroTrack.current; const c = el?.children[i] as HTMLElement | undefined; if (el && c) el.scrollBy({ left: c.getBoundingClientRect().left - el.getBoundingClientRect().left, behavior: 'smooth' }); }}><span /></button>)}</div>}
      <div className="wash-search-bar"><Icon name="search" size={22}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="أي مغسلة تبحث عنها؟" aria-label="بحث"/><button className="wash-search-location" onClick={()=>setSheet(true)}><Icon name="pin" size={18}/>{f.city||'اختر المدينة'}<Icon name="down" size={14}/></button><button className="wash-search-filter" aria-label="الفلاتر" aria-haspopup="dialog" aria-expanded={sheet} onClick={()=>setSheet(true)}><Icon name="filter"/>{sheetN>0&&<span>{sheetN}</span>}</button></div>
      <WashVehiclePicker value={size} onChange={setSize}/>
      <div className="wash-service-heading"><h2>أي عناية تحتاجها؟</h2><span>اختر الخدمة الأقرب لاحتياجك</span></div>
      <div className="wash-service-tabs" aria-label="أنواع الغسل"><button aria-pressed={f.kinds.length===0} onClick={()=>setF(x=>({...x,kinds:[]}))}><Icon name="grid"/>كل الخدمات</button>{kinds.map(k=><button key={k} aria-pressed={f.kinds.includes(k)} onClick={()=>setF(x=>({...x,kinds:x.kinds.includes(k)?[]:[k]}))}><Icon name={k==='داخلي'?'car':k==='تلميع'?'check':'drop'}/>{k==='شامل'?'غسل شامل':k==='داخلي'?'تنظيف داخلي':k==='خارجي'?'غسل خارجي':k}</button>)}</div>
      <WashAdsSlider ads={slides}/>
      {toRate && <a className="wash-rate-nudge" href={bookingHref(toRate.code, toRate.phone)}><Icon name="star" size={22} filled/><span><b>كيف كانت غسلتك في {toRate.wash}؟</b><small>قيّمها بنجمة واحدة — يساعد غيرك على الاختيار</small></span><Icon name="arrow" size={18}/></a>}
      <section id="discover" className="wash-discover" aria-labelledby="results-title">
        <div className="wash-section-heading"><div className="wash-heading-group"><span className="wash-step">02</span><div><h2 id="results-title">{onlyFavs?'اختياراتك المفضلة':'مغسلتك الجاية هنا'}</h2><p>{rows===null?'نبحث لك عن المغاسل…':`${shown.length.toLocaleString('ar-IQ')} مغسلة تطابق اختيارك`}</p></div></div><label className="wash-sort-label">ترتيب حسب<select aria-label="ترتيب المغاسل" value={sort} onChange={e=>{if(e.target.value==='near')nearest();else setSort(e.target.value as Sort)}}><option value="rank">المقترحة لك</option><option value="near">الأقرب إليك</option><option value="rating">الأعلى تقييماً</option></select></label></div>
        <div className="wash-chips"><button aria-pressed={f.openNow} onClick={()=>toggle('openNow')}><span className="wash-open-dot"/>مفتوحة الآن</button><button aria-pressed={sort==='near'} aria-busy={locating} disabled={locating} onClick={nearest}><Icon name="route" size={16}/>{locating?'جارٍ تحديد الموقع…':'الأقرب إليك'}</button><button aria-pressed={f.hasOffer} onClick={()=>toggle('hasOffer')}><Icon name="tag" size={16}/>عروض متاحة</button><button aria-pressed={onlyFavs} onClick={favoriteView}><Icon name="heart" size={16}/>المفضلة</button>{(sheetN>0||q||f.openNow||f.hasOffer)&&<button className="wash-reset" onClick={()=>{setF(EMPTY_FILTERS);setQ('')}}>مسح الفلاتر<Icon name="close" size={14}/></button>}</div>
        {geoMsg&&<p className="wash-notice" role="status">{geoMsg}</p>}
        {partial&&<p className="wash-notice" role="status">تعذّر تحميل بعض الخدمات أو العروض. <button onClick={()=>setRetry(x=>x+1)}>إعادة المحاولة</button></p>}
        {failed?<div className="wash-empty" role="alert"><Icon name="route" size={38}/><h3>تعذّر الاتصال بالمغاسل</h3><p>تحقق من اتصالك بالإنترنت وحاول مرة أخرى.</p><button className="wash-primary" onClick={()=>setRetry(x=>x+1)}>إعادة المحاولة</button></div>:rows===null?<div className="wash-skeleton-grid" role="status" aria-label="جارٍ تحميل المغاسل">{[0,1,2].map(i=><div key={i} className="wash-skeleton"/>)}</div>:shown.length===0?<div className="wash-empty"><Icon name="search" size={38}/><h3>{onlyFavs?'مفضّلتك تنتظر اختياراتك':'ما لقينا مغسلة بهذا الاختيار'}</h3><p>{onlyFavs?'اضغط القلب على المغسلة لتعود إليها بسهولة.':'جرّب تغيير المدينة أو تخفيف شروط البحث.'}</p><button className="wash-primary" onClick={()=>{setQ('');setF(EMPTY_FILTERS);setOnlyFavs(false);setSort('rank')}}>استعرض المغاسل</button></div>:<ul className="wash-results">{visible.map(w=><li key={w.id}><WashCard w={w} services={svcOf.get(w.id)??[]} nextSlot={w.next_slot} fav={favs.includes(w.id)} onFav={saveFavorite}/></li>)}</ul>}
        {shown.length>FIRST&&<button className="wash-load-more" onClick={()=>setShowAll(x=>!x)}>{showAll?'عرض أقل':`استعرض بقية المغاسل (${shown.length-FIRST})`}<Icon name="down" size={17}/></button>}
        <p className="wash-pricing-note">الأسعار تبدأ من السعر المعروض. عند غياب سعر مخصص لحجم السيارة، يظهر السعر الأساسي؛ السعر النهائي يتأكد عند الحجز.</p>
      </section>
      {(liveOffers.length>0||adOffers.length>0)&&<section className="wash-offers" id="wash-offers"><div className="wash-section-heading"><div><h2>عناية أكثر، بسعر أقل</h2><p>العروض المتاحة في المغاسل</p></div><Icon name="tag" size={24}/></div><div className="wash-offers-grid">
      {liveOffers.map(o=>{const base=baseOf(o);const left=offerLeft(o.ends_at);return <article className="wash-offer" key={o.id}><span className="wash-offer-label"><Icon name="tag" size={16}/>{byId.get(o.wash_id)?.name}</span><h3>{o.title}</h3>{o.description&&<p>{o.description}</p>}<div className="wash-offer-price">{o.offer_price!=null?<><strong>{iqd(o.offer_price)}</strong>{base!=null&&base>o.offer_price&&<del>{iqd(base)}</del>}</>:o.discount_pct!=null&&<strong>خصم {pct(o.discount_pct)}</strong>}{left&&<small>{left}</small>}</div><a className="wash-primary" href={`/wash/book/?id=${encodeURIComponent(o.wash_id)}&offer=${encodeURIComponent(o.id)}&service=${encodeURIComponent(o.service_id??'')}`}>استفد من العرض<Icon name="arrow" size={16}/></a></article>})}
      {adOffers.map(a=>{const href=adHref(a);const ext=/^https?:/.test(href);return <article className="wash-offer" key={a.id}>{a.sponsored&&<span className="wash-offer-label">إعلان ممول</span>}<h3>{a.title}</h3>{a.description&&<p>{a.description}</p>}<a href={href} className="wash-primary" target={ext?'_blank':undefined} rel={ext?'noopener noreferrer':undefined}>تفاصيل العرض<Icon name="arrow" size={16}/></a></article>})}</div></section>}
      <section className="wash-partner"><div className="wash-partner-icon"><Icon name="car" size={33}/></div><div><span>لأصحاب المغاسل</span><h2>مغسلتك تستحق أن يكتشفها الجميع.</h2><p>صفحة خاصة، إدارة حجوزات، ووصول أسهل لعملائك.</p></div><a href="/wash/register/">أضف مغسلتك<Icon name="arrow" size={18}/></a></section>
      <footer className="wash-footer"><span><img src="/wash/logo.png" alt="المغسلة التقنية" /><small>من المحطة التقنية · الأنبار</small></span><a href="/login/">دخول أصحاب المغاسل<Icon name="arrow" size={14}/></a></footer>
    </div>
    <nav className="wash-bottom-nav" aria-label="تنقل الموبايل"><button aria-current={!onlyFavs?'page':undefined} onClick={()=>{setOnlyFavs(false);window.scrollTo({top:0,behavior:'smooth'})}}><Icon name="home"/><span>الرئيسية</span></button><button aria-current={onlyFavs?'page':undefined} onClick={favoriteView}><Icon name="heart"/><span>المفضلة</span></button><a href="/wash/mine/"><Icon name="calendar"/><span>حجوزاتي</span></a><a href="/wash/size/"><Icon name="car"/><span>سياراتي</span></a></nav>
    <WashFilterSheet open={sheet} onClose={()=>setSheet(false)} value={f} onApply={setF} cities={cities} kinds={kinds}/>
  </main>;
}
