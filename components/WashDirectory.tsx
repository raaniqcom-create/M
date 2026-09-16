'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CITY_NAMES } from '@/lib/cities';
import { isOpenNow, openingLine } from '@/lib/hours';
import { distanceKm } from '@/lib/stations';
import { quietPosition } from '@/lib/vote';
import { iqd, rankWashes, ratingLine, type WashPublic } from '@/lib/wash';
import { RouteButton } from './RouteButton';
import { CarIcon, FuelIcon, SearchIcon, SpinnerIcon } from './icons';

const TONE = {
  open: 'bg-brand-50 text-brand-700',
  soon: 'bg-amber-50 text-amber-800',
  closed: 'bg-slate-100 text-slate-500',
} as const;

/** دليلُ المغاسل: بطاقةٌ لكلّ مغسلةٍ معتمدة، ومرشّحان لا أكثر. */
export function WashDirectory() {
  const [rows, setRows] = useState<WashPublic[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [city, setCity] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [offerOnly, setOfferOnly] = useState(false);
  const [q, setQ] = useState('');
  /** موقعُ القارئ إن كان الإذنُ ممنوحاً أصلاً — لا سؤالَ من تلقاء الصفحة. */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    void quietPosition().then(setHere);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase
      .from('washes_public')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        else setRows((data ?? []) as WashPublic[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const all = rows ?? [];
  const cities = CITY_NAMES.filter((c) => all.some((w) => w.city === c));
  const needle = q.trim();
  const shown = rankWashes(
    all
      .filter((w) => (!city || w.city === city) && (!openOnly || isOpenNow(w)) && (!offerOnly || w.has_offer))
      .filter((w) => !needle || w.name.includes(needle) || w.address.includes(needle))
      .map((w) => ({ ...w, distanceKm: here ? distanceKm(here, w) : null }))
  );

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
      on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
    }`;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mx-auto flex w-fit items-center gap-2 text-brand-700">
        <FuelIcon className="h-6 w-6" />
        <span className="text-base font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="mt-6 text-center text-xl font-extrabold text-slate-800">غسل السيارات</h1>
      <p className="mt-1 text-center text-xs text-slate-500">مغاسل الأنبار — احجز موعدك مجّاناً داخل التطبيق</p>

      <label className="relative mt-5 block">
        <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="field pr-9" placeholder="ابحث باسم المغسلة أو المنطقة" aria-label="بحث" />
      </label>
      <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label="المدينة"
          className="min-h-[34px] shrink-0 rounded-full border border-slate-200 bg-white px-3 text-[11.5px] font-bold text-slate-700"
        >
          <option value="">كل الأنبار</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly((v) => !v)} className={chip(openOnly)}>
          مفتوحة الآن
        </button>
        <button type="button" aria-pressed={offerOnly} onClick={() => setOfferOnly((v) => !v)} className={chip(offerOnly)}>
          فيها عرض
        </button>
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
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>{all.length === 0 ? 'لا مغاسل بعد.' : 'لا مغسلةَ تطابق هذا الاختيار.'}</p>
          {all.length === 0 && (
            <a href="/wash/register/" className="mt-2 inline-block font-bold text-brand underline">
              سجّل مغسلتك
            </a>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {shown.map((w) => {
            const o = openingLine(w);
            return (
              <li key={w.id}>
                <article className="card overflow-hidden">
                  {w.thumb_url || w.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.thumb_url ?? w.image_url ?? ''} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-400">
                      <CarIcon className="h-12 w-12" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-extrabold leading-snug text-slate-800">{w.name}</h2>
                      {w.featured && (
                        <span className="shrink-0 rounded-full bg-brand text-white px-2 py-0.5 text-[10.5px] font-bold">مميّز</span>
                      )}
                      {w.paused && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
                          متوقّفة عن الحجز
                        </span>
                      )}
                      {w.has_offer && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                          عرض
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {w.city} · {w.address}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px]">
                      {ratingLine(w.rating_avg, w.rating_n) && <span className="font-bold text-amber-600">{ratingLine(w.rating_avg, w.rating_n)}</span>}
                      {w.distanceKm != null && <span className="text-slate-500">يبعد عنك {w.distanceKm < 1 ? 'أقلّ من كيلومتر' : `${Math.round(w.distanceKm)} كم`}</span>}
                      {w.from_price != null && <span className="text-slate-500">يبدأ من {iqd(w.from_price)}</span>}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px]">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${TONE[o.tone]}`}>{o.badge}</span>
                      <span className="text-slate-500">{o.detail}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <a href={`/wash/detail/?id=${w.id}`} className="btn-primary flex-1">
                        احجز موعداً
                      </a>
                      <div className="w-28">
                        <RouteButton lat={w.lat} lng={w.lng} compact />
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <a href="/wash/register/" className="mt-8 block text-center text-[11.5px] text-slate-400 underline">
        صاحب مغسلة؟ سجّلها باشتراكٍ شهريّ
      </a>
    </main>
  );
}
