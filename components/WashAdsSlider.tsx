'use client';
import { useEffect, useRef, useState } from 'react';
import type { WashAd } from '@/lib/wash';

/** Allow same-origin paths and HTTP(S), never executable advertisement URLs. */
export const adHref = (ad: Pick<WashAd, 'url' | 'wash_id'>): string => {
  const value = ad.url?.trim();
  if (value && !/[\\\u0000-\u0020]/.test(value)) {
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try { const u = new URL(value); if (u.protocol === 'https:' || u.protocol === 'http:') return u.href; } catch { /* Use detail fallback. */ }
  }
  return ad.wash_id ? `/wash/detail/?id=${encodeURIComponent(ad.wash_id)}` : '/wash/';
};

/** Manual carousel: no surprise movement while reading or keyboard navigation. */
export function WashAdsSlider({ ads }: { ads: WashAd[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); track.current?.scrollTo({ left: 0 }); }, [ads.map(a => a.id).join(',')]);
  function go(i: number) {
    const el = track.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    const delta = child.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollBy({ left: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (!ads.length) return null;
  return <section className="wash-ads" aria-label="عروض وإعلانات المغاسل" aria-roledescription="عارض شرائح">
    <div ref={track} className="wash-ad-track" onScroll={() => {
      const el = track.current; if (!el) return;
      let nearest = 0, distance = Infinity;
      Array.from(el.children).forEach((child, i) => { const d = Math.abs(child.getBoundingClientRect().left - el.getBoundingClientRect().left); if (d < distance) { nearest = i; distance = d; } });
      setIndex(nearest);
    }}>
      {ads.map((ad, i) => { const href = adHref(ad); const ext = /^https?:/.test(href);
        return <article key={ad.id} className="wash-ad" role="group" aria-label={`${i + 1} من ${ads.length}`}>
          {/* بلا صور: شريحةٌ بهويّة المنصّة (تدرّجٌ أخضر وعلامةُ المغسلة) — صورةُ الإعلان كانت رسمةَ سيارةٍ نشازاً. */}
          <img className="wash-ad-mark" src="/wash/mark-t.png" alt="" aria-hidden />
          <div className="wash-ad-copy"><span>{ad.id === 'promo' ? 'لأصحاب المغاسل' : ad.sponsored ? 'إعلان ممول' : 'من المغاسل'}</span><h2>{ad.title}</h2>{ad.description && <p>{ad.description}</p>}<a href={href} tabIndex={index === i ? 0 : -1} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}>{ad.id === 'promo' ? 'سجّل الآن' : 'استعرض التفاصيل'} ←</a></div>
        </article>;
      })}
    </div>
    {ads.length > 1 && <div className="wash-ad-dots">{ads.map((ad, i) => <button key={ad.id} type="button" onClick={() => go(i)} aria-label={`عرض الإعلان ${i + 1}`} aria-current={index === i}><span /></button>)}</div>}
  </section>;
}
