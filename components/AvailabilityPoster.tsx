'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { SpinnerIcon } from './icons';
import type { FuelProduct } from '@/types/database';

const SITE = 'muhta.online';
const SIZE = 1080;

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight = '800'
) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px Tajawal`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return size;
}

/** Poster a station posts the moment fuel lands — the headline is the product,
 *  because that is the only thing a driver scanning a feed will stop for. */
export function AvailabilityPoster({
  name,
  slug,
  products,
}: {
  name: string;
  slug: string | null;
  products: FuelProduct[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const link = slug ? `${SITE}/${slug}` : SITE;

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || products.length === 0) return;
    const c = canvas.getContext('2d');
    if (!c) return;

    await document.fonts.ready;

    const g = c.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#166534');
    g.addColorStop(0.6, '#15803d');
    g.addColorStop(1, '#22c55e');
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);

    const glow = c.createRadialGradient(SIZE / 2, 250, 0, SIZE / 2, 250, 700);
    glow.addColorStop(0, 'rgba(255,255,255,0.16)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, SIZE, SIZE);

    c.direction = 'rtl';
    c.textAlign = 'center';

    // "available now" badge
    c.fillStyle = '#fef08a';
    c.beginPath();
    c.roundRect(SIZE / 2 - 165, 96, 330, 78, 39);
    c.fill();
    c.fillStyle = '#713f12';
    c.font = '800 42px Tajawal';
    c.fillText('متوفر الآن', SIZE / 2, 150);

    // the products themselves, as the headline
    const labels = products.map((p) => PRODUCT_LABELS[p] ?? p);
    if (labels.length === 1) {
      const s = fitFont(c, labels[0], SIZE - 130, 104);
      c.fillStyle = '#ffffff';
      c.font = `800 ${s}px Tajawal`;
      c.fillText(labels[0], SIZE / 2, 320);
    } else {
      const start = 268;
      const step = labels.length > 3 ? 78 : 92;
      labels.slice(0, 5).forEach((label, i) => {
        const s = fitFont(c, label, SIZE - 200, labels.length > 3 ? 58 : 70);
        c.fillStyle = '#ffffff';
        c.font = `800 ${s}px Tajawal`;
        c.fillText(label, SIZE / 2, start + i * step);
      });
    }

    const afterList = labels.length === 1 ? 400 : 268 + Math.min(labels.length, 5) * 92;

    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '500 36px Tajawal';
    c.fillText('لدى', SIZE / 2, afterList + 60);

    const ns = fitFont(c, name, SIZE - 140, 62);
    c.fillStyle = '#ffffff';
    c.font = `800 ${ns}px Tajawal`;
    c.fillText(name, SIZE / 2, afterList + 135);

    // Baghdad time, so the post carries its own freshness
    const now = new Intl.DateTimeFormat('ar-IQ', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = '400 30px Tajawal';
    c.fillText(`التحديث الساعة ${now}`, SIZE / 2, afterList + 190);

    // The gap between the update time and the link read as unfinished, and it
    // is the natural place for the mark that ties the post to the platform.
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    logo.src = '/logo-original.png';
    await new Promise((res) => {
      logo.onload = res;
      logo.onerror = res;
    });
    if (logo.width) {
      const box = 190;
      const s = Math.min(box / logo.width, box / logo.height);
      const w = logo.width * s;
      const h = logo.height * s;
      const x = (SIZE - w) / 2;
      const y = afterList + 250;
      const pad = 12;

      c.save();
      c.shadowColor = 'rgba(0,0,0,0.2)';
      c.shadowBlur = 22;
      c.shadowOffsetY = 6;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 36);
      c.fill();
      c.restore();

      c.save();
      c.beginPath();
      c.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 36);
      c.clip();
      c.drawImage(logo, x, y, w, h);
      c.restore();
    }

    const pillW = 720;
    const pillH = 92;
    const pillY = 890;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect((SIZE - pillW) / 2, pillY, pillW, pillH, 46);
    c.fill();

    c.direction = 'ltr';
    c.fillStyle = '#14532d';
    const ls = fitFont(c, link, pillW - 70, 40);
    c.font = `800 ${ls}px Tajawal`;
    c.fillText(link, SIZE / 2, pillY + pillH / 2 + ls / 3);

    c.direction = 'rtl';
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '400 27px Tajawal';
    c.fillText('تابع توفر الوقود لدينا على المحطة التقنية', SIZE / 2, 1025);

    setReady(true);
  }, [name, link, products]);

  useEffect(() => {
    setReady(false);
    draw();
  }, [draw]);

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug || 'muhta'}-available.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  async function share() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `${slug || 'muhta'}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator
        .share({ files: [file], text: `متوفر الآن لدينا — ${link}` })
        .catch(() => {});
    } else {
      download();
    }
  }

  if (products.length === 0) {
    return (
      <section className="card p-5">
        <h3 className="text-sm font-bold">صورة إعلان التوفر</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          فعّل منتجاً واحداً على الأقل من قائمة التوفر أعلاه، وستظهر هنا صورة جاهزة
          للنشر تعلن وصوله.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">صورة إعلان التوفر</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        انشرها لحظة وصول الوقود. تتحدث تلقائياً كلما غيّرت المتوفر لديك.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-brand-100 bg-brand-50">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="block h-auto w-full"
          aria-label="صورة إعلان توفر الوقود"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={share} disabled={!ready} className="btn-primary">
          {!ready && <SpinnerIcon className="h-4 w-4" />}
          مشاركة
        </button>
        <button type="button" onClick={download} disabled={!ready} className="btn-ghost">
          تحميل الصورة
        </button>
      </div>
    </section>
  );
}
