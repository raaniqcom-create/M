'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawAvailabilityPoster, POSTER_SITE } from './AvailabilityPoster';
import { RouteButton } from './RouteButton';
import { XIcon } from './icons';
import { ageLabel } from '@/lib/hours';
import { markSeen, type Story } from '@/lib/stories';
import type { StationWithStatus } from '@/types/database';

const STEP_MS = 6000;

/** عارضُ القصص — الصورةُ عاريةً على أسود، كإنستغرام.
 *
 *  الصورةُ تُرسم عند الفتح بـ`drawAvailabilityPoster` بوقت التأكيد الحقيقيّ،
 *  فلا صورةَ تُخزَّن ولا تُجلب. والتنقّل: نقرةٌ على الثلث الأيسر = التالية،
 *  الأيمن = السابقة (الاتّجاهُ من اليمين)، والوسطُ يوقف العدّاد ويعيده. */
export function StoryViewer({
  stories,
  start,
  stations,
  onClose,
}: {
  stories: Story[];
  start: number;
  stations: StationWithStatus[];
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [paused, setPaused] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const story = stories[i];
  const station = stations.find((s) => s.id === story?.id);

  const next = useCallback(() => {
    setI((k) => {
      if (k + 1 >= stories.length) {
        onClose();
        return k;
      }
      return k + 1;
    });
  }, [stories.length, onClose]);
  const prev = () => setI((k) => Math.max(0, k - 1));

  // الرسمُ عند كلّ قصّة، والعلامةُ «رُئيت» معها.
  useEffect(() => {
    if (!story) return;
    markSeen(story.id, story.at);
    setDrawn(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    drawAvailabilityPoster(canvas, {
      name: story.name,
      link: story.slug ? `${POSTER_SITE}/${story.slug}` : POSTER_SITE,
      products: story.products,
      at: new Date(story.at),
    }).then(() => alive && setDrawn(true));
    return () => {
      alive = false;
    };
  }, [story]);

  // العدّاد: ستُّ ثوانٍ لكلّ قصّة ما لم يُوقَف بلمسة.
  useEffect(() => {
    if (paused || !drawn) return;
    const t = setTimeout(next, STEP_MS);
    return () => clearTimeout(t);
  }, [i, paused, drawn, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!story) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`حالة ${story.name}`}
      className="fixed inset-0 z-[65] flex flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* شرائطُ التقدّم — من اليمين */}
      <div className="flex gap-1 px-3 pt-3" dir="rtl">
        {stories.map((s, k) => (
          <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              className="block h-full bg-white"
              style={
                k === i
                  ? {
                      animationName: drawn ? 'story-fill' : undefined,
                      animationDuration: `${STEP_MS}ms`,
                      animationTimingFunction: 'linear',
                      animationFillMode: 'forwards',
                      animationPlayState: paused ? 'paused' : 'running',
                    }
                  : { width: k < i ? '100%' : '0%' }
              }
            />
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold">{story.name}</p>
          <p className="text-[11px] text-white/70">
            {story.city} · أُكّد {ageLabel(story.at)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* الصورةُ — ونقرُ الأطراف للتنقّل */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1080}
          className="max-h-full w-auto max-w-full rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,.6)]"
          aria-label={`صورة إعلان توفر ${story.name}`}
        />
        <button type="button" aria-label="السابقة" onClick={prev} className="absolute inset-y-0 right-0 w-1/3" />
        <button
          type="button"
          aria-label={paused ? 'متابعة' : 'إيقاف'}
          onClick={() => setPaused((p) => !p)}
          className="absolute inset-y-0 left-1/3 w-1/3"
        />
        <button type="button" aria-label="التالية" onClick={next} className="absolute inset-y-0 left-0 w-1/3" />
      </div>

      <div className="flex items-center gap-2 px-4 pb-4">
        {station && (
          <div className="flex-1 rounded-xl bg-white text-brand-900">
            <RouteButton
              lat={station.lat}
              lng={station.lng}
              stationId={station.id}
              stationName={station.name}
              compact
            />
          </div>
        )}
        <a
          href={`/station/${story.id}`}
          className="flex min-h-[34px] flex-1 items-center justify-center rounded-xl bg-white/15 text-[12px] font-bold"
        >
          صفحة المحطة
        </a>
      </div>
    </div>
  );
}
