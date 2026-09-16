'use client';

import { useRef, useState } from 'react';
import type { WashAd } from '@/lib/wash';

/** وجهةُ الإعلان: رابطُه، وإلّا صفحةُ المغسلة، وإلّا الدليل. */
export const adHref = (ad: Pick<WashAd, 'url' | 'wash_id'>): string =>
  ad.url || (ad.wash_id ? `/wash/detail/?id=${ad.wash_id}` : '/wash/');

/** بانراتُ الرئيسية (wash_ads kind=banner): شريحةٌ بعرض الشاشة تُسحب، ونقاطٌ تحتها. لا شيءَ يُرسم بلا إعلانات. */
export function WashAdsSlider({ ads }: { ads: WashAd[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  if (ads.length === 0) return null;

  return (
    <section className="mt-5" aria-label="إعلانات">
      <div
        ref={track}
        // scrollLeft سالبٌ في RTL — القيمةُ المطلقة تكفي. خطوةُ الشريحة = العرضُ + الفجوة، تُشتقّ من المسار لا تُفترض.
        onScroll={() => {
          const el = track.current;
          if (el && ads.length > 1) setI(Math.min(ads.length - 1, Math.round(Math.abs(el.scrollLeft) / ((el.scrollWidth - el.clientWidth) / (ads.length - 1)))));
        }}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {ads.map((ad) => {
          const href = adHref(ad);
          const ext = /^https?:/.test(href);
          return (
            <article
              key={ad.id}
              className={`relative aspect-video w-full shrink-0 snap-center overflow-hidden rounded-2xl shadow-soft ${
                ad.image_url ? 'bg-slate-200' : 'bg-gradient-to-br from-brand-50 to-brand-100'
              }`}
            >
              {ad.image_url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ad.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/20 to-transparent" />
                </>
              )}
              {ad.sponsored && (
                <span className="absolute start-3 top-3 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10.5px] font-bold text-white">إعلان</span>
              )}
              <div className={`absolute inset-x-0 bottom-0 p-4 ${ad.image_url ? 'text-white' : 'text-slate-800'}`}>
                <h3 className="text-base font-extrabold leading-snug">{ad.title}</h3>
                {ad.description && <p className={`mt-0.5 line-clamp-2 text-[12px] ${ad.image_url ? 'text-white/85' : 'text-slate-600'}`}>{ad.description}</p>}
                <a
                  href={href}
                  target={ext ? '_blank' : undefined}
                  rel={ext ? 'noopener noreferrer' : undefined}
                  className="btn-primary mt-2 inline-flex w-fit px-4 text-[13px]"
                >
                  احجز الآن
                </a>
              </div>
            </article>
          );
        })}
      </div>
      {ads.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {ads.map((ad, k) => (
            <span key={ad.id} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-brand' : 'w-1.5 bg-slate-300'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
