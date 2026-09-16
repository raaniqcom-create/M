'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WashAd } from '@/lib/wash';

/** وجهةُ الإعلان: رابطُه، وإلّا صفحةُ المغسلة، وإلّا الدليل. */
export const adHref = (ad: Pick<WashAd, 'url' | 'wash_id'>): string =>
  ad.url || (ad.wash_id ? `/wash/detail/?id=${ad.wash_id}` : '/wash/');

const AUTO_MS = 4500;

/** بانراتُ الرئيسية (wash_ads kind=banner): شريحةٌ غامرةٌ **تتقلّب تلقائياً** كلَّ بضع ثوانٍ، وتتوقّف
 *  عند اللمس. الموقّتُ حركةُ واجهةٍ لا استعلامَ قاعدة — يحترم prefers-reduced-motion. */
export function WashAdsSlider({ ads }: { ads: WashAd[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  /** إيقافُ التقلّب أثناء لمس المستخدم أو تحويم مؤشّره — كي لا يقفز تحت إصبعه. */
  const held = useRef(false);

  const goTo = useCallback((k: number) => {
    const el = track.current;
    if (!el) return;
    const child = el.children[k] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft * (el.scrollLeft <= 0 && el.scrollWidth > el.clientWidth ? -1 : 1) - 0, behavior: 'smooth' });
    // RTL: scrollLeft سالب. نعتمد scrollIntoView لتفادي حساب الاتجاه.
    child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (held.current || document.hidden) return;
      setI((prev) => {
        const next = (prev + 1) % ads.length;
        goTo(next);
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [ads.length, goTo]);

  if (ads.length === 0) return null;

  return (
    <section className="mt-6" aria-label="إعلانات">
      <div
        ref={track}
        onScroll={() => {
          const el = track.current;
          if (el && ads.length > 1) setI(Math.min(ads.length - 1, Math.round(Math.abs(el.scrollLeft) / ((el.scrollWidth - el.clientWidth) / (ads.length - 1)))));
        }}
        onPointerDown={() => (held.current = true)}
        onPointerUp={() => (held.current = false)}
        onPointerCancel={() => (held.current = false)}
        onMouseEnter={() => (held.current = true)}
        onMouseLeave={() => (held.current = false)}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {ads.map((ad) => {
          const href = adHref(ad);
          const ext = /^https?:/.test(href);
          return (
            <article
              key={ad.id}
              className={`relative aspect-[16/9] w-full shrink-0 snap-center overflow-hidden rounded-[26px] shadow-lift ${
                ad.image_url ? 'bg-slate-200' : 'bg-[linear-gradient(135deg,#14532d,#15803d,#22a555)]'
              }`}
            >
              {ad.image_url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ad.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/45 to-black/10" />
                </>
              )}
              {ad.sponsored && (
                <span className="absolute start-3.5 top-3.5 rounded-full bg-slate-900/70 px-2.5 py-1 text-[10.5px] font-bold text-white backdrop-blur">إعلان</span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-5 text-white [text-shadow:0_1px_10px_rgba(0,0,0,.45)]">
                <h3 className="text-[19px] font-black leading-snug">{ad.title}</h3>
                {ad.description && <p className="mt-1 line-clamp-2 max-w-[85%] text-[12.5px] font-medium text-white/90">{ad.description}</p>}
                <a
                  href={href}
                  target={ext ? '_blank' : undefined}
                  rel={ext ? 'noopener noreferrer' : undefined}
                  className="mt-3 inline-flex min-h-[42px] w-fit items-center rounded-full bg-white px-5 text-[13px] font-extrabold text-brand-800 shadow-sm transition active:scale-95 [text-shadow:none]"
                >
                  احجز الآن
                </a>
              </div>
            </article>
          );
        })}
      </div>
      {ads.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {ads.map((ad, k) => (
            <button
              key={ad.id}
              type="button"
              aria-label={`إعلان ${k + 1}`}
              aria-current={k === i}
              onClick={() => {
                setI(k);
                goTo(k);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? 'w-5 bg-brand' : 'w-1.5 bg-slate-300'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
