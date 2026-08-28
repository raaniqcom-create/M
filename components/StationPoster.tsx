'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpinnerIcon } from './icons';
import { savePoster } from '@/lib/savePoster';

const SITE = 'muhta.online';
const SIZE = 1080; // square works on every platform without cropping

/** Shrinks the font until the text fits, so a long station name never
 *  overflows the card or gets clipped. */
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
  } while (size > 28);
  return size;
}

export function StationPoster({
  name,
  slug,
  onSaved,
}: {
  name: string;
  slug: string | null;
  /** يُنادى بعد الحفظ — تستعمله بطاقةُ الترحيب لتنزوي بنفسها */
  onSaved?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const link = slug ? `${SITE}/${slug}` : SITE;

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;

    // Tajawal must be resolved before the first measureText, or the layout is
    // computed against a fallback and everything sits wrong.
    await document.fonts.ready;

    const g = c.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#14532d');
    g.addColorStop(0.55, '#15803d');
    g.addColorStop(1, '#16a34a');
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);

    // faint corner glow so the flat fill doesn't look like a screenshot
    const glow = c.createRadialGradient(SIZE, 0, 0, SIZE, 0, SIZE * 0.9);
    glow.addColorStop(0, 'rgba(255,255,255,0.14)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, SIZE, SIZE);

    c.direction = 'rtl';
    c.textAlign = 'center';

    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    logo.src = '/logo-original.png';
    await new Promise((res) => {
      logo.onload = res;
      logo.onerror = res;
    });
    if (logo.width) {
      const box = 236;
      const s = Math.min(box / logo.width, box / logo.height);
      const w = logo.width * s;
      const h = logo.height * s;
      const x = (SIZE - w) / 2;
      const y = 78;

      // The logo artwork sits on white. Against the green that reads as a
      // stray square, so give it a rounded card and let it look deliberate.
      const pad = 14;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.22)';
      c.shadowBlur = 26;
      c.shadowOffsetY = 8;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 44);
      c.fill();
      c.restore();

      c.save();
      c.beginPath();
      c.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 44);
      c.clip();
      c.drawImage(logo, x, y, w, h);
      c.restore();
    }

    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '500 34px Tajawal';
    c.fillText('يسر', SIZE / 2, 400);

    const nameSize = fitFont(c, name, SIZE - 140, 74);
    c.fillStyle = '#ffffff';
    c.font = `800 ${nameSize}px Tajawal`;
    c.fillText(name, SIZE / 2, 480);

    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '500 34px Tajawal';
    c.fillText('أن تعلن انضمامها إلى', SIZE / 2, 545);

    c.fillStyle = '#bbf7d0';
    c.font = '800 56px Tajawal';
    c.fillText('المحطة التقنية', SIZE / 2, 625);

    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = '400 30px Tajawal';
    c.fillText('منصة وقود الأنبار', SIZE / 2, 675);

    // the promise to the follower, and the reason to keep the link
    c.fillStyle = '#ffffff';
    c.font = '500 33px Tajawal';
    c.fillText('تابع صفحتنا على المنصة لتعرف', SIZE / 2, 762);
    c.fillText('توفر الوقود لدينا أولاً بأول', SIZE / 2, 810);

    // link pill
    const pillW = 720;
    const pillH = 92;
    const pillX = (SIZE - pillW) / 2;
    const pillY = 868;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(pillX, pillY, pillW, pillH, 46);
    c.fill();

    c.fillStyle = '#14532d';
    c.direction = 'ltr';
    const linkSize = fitFont(c, link, pillW - 70, 40, '800');
    c.font = `800 ${linkSize}px Tajawal`;
    c.fillText(link, SIZE / 2, pillY + pillH / 2 + linkSize / 3);

    c.direction = 'rtl';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = '400 26px Tajawal';
    c.fillText('مجاناً · بدون حساب · لكل مدن الأنبار', SIZE / 2, 1015);

    setReady(true);
  }, [name, link]);

  useEffect(() => {
    draw();
  }, [draw]);

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await savePoster(canvas, `${slug || 'muhta'}-poster.png`, `تابعونا على المحطة التقنية — ${link}`);
    // من حفظ أخذ ما جاء من أجله — فتنزوي بطاقةُ الترحيب التي تلفّ هذه، إن وُجدت
    onSaved?.();
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">صورة إعلانية جاهزة للنشر</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        انشرها على صفحات محطتك ليتابعك زبائنك على المنصة ويعرفوا توفر الوقود لديك فوراً.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-brand-100 bg-brand-50">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="block h-auto w-full"
          aria-label={`صورة إعلانية لـ ${name}`}
        />
      </div>

      {/* One button: on a phone the share sheet already offers "Save Image",
          and two buttons doing the same thing only invite the wrong tap. */}
      <button type="button" onClick={save} disabled={!ready} className="btn-primary mt-4 w-full">
        {!ready && <SpinnerIcon className="h-4 w-4" />}
        مشاركة أو حفظ الصورة
      </button>
    </section>
  );
}
