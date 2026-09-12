'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawAvailabilityPoster, POSTER_SITE } from './AvailabilityPoster';
import { RouteButton } from './RouteButton';
import { EyeIcon, XIcon } from './icons';
import { ageLabel } from '@/lib/hours';
import { isSeen, markSeen, type Story } from '@/lib/stories';
import { supabase } from '@/lib/supabase';
import type { StationWithStatus } from '@/types/database';

/** عدّادُ المشاهدات — «أضف عدّاداً للمشاهدات على الحالات». يُحصى الجهازُ مرّةً
 *  لكلّ نسخةٍ من الحالة (`at`) ويعود الرقمُ بعد الزيادة؛ وإن سبق أن رُئيت يعود
 *  الرقمُ بلا زيادة. هنا لا في lib/stories — تلك تُستورد في اختبارات Node بلا
 *  supabase. والفشلُ يعود null فلا يُكتب شيء ولا تُحجب القصّة. */
async function recordView(id: string, at: string, fresh: boolean): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('story_view', { p_story: id, p_at: at, p_new: fresh });
    return error ? null : Number(data);
  } catch {
    return null;
  }
}

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
  const [views, setViews] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const story = stories[i];
  const station = stations.find((s) => s.id === story?.id);

  // خارج مُحدِّث الحالة: نداءُ `onClose` داخله يُحدّث الشريطَ أثناء رسم العارض —
  // وريأكت يرفض ذلك بحقّ.
  const next = useCallback(() => {
    if (i + 1 >= stories.length) onClose();
    else setI(i + 1);
  }, [i, stories.length, onClose]);
  const prev = () => setI((k) => Math.max(0, k - 1));

  // الرسمُ عند كلّ قصّة، والعلامةُ «رُئيت» معها. وقصّةُ المنصّة نصٌّ لا رسم.
  useEffect(() => {
    if (!story) return;
    // العدّادُ: جديدةٌ على هذا الجهاز؟ تُحصى — وإلّا يُقرأ الرقمُ وحدَه.
    const fresh = !isSeen(story.id, story.at);
    markSeen(story.id, story.at);
    setViews(null);
    let counting = true;
    recordView(story.id, story.at, fresh).then((n) => counting && setViews(n));
    setDrawn(false);
    if (story.kind === 'platform') {
      setDrawn(true);
      return () => {
        counting = false;
      };
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    // بنسبة الشاشة نفسِها — فتملأ الهاتفَ كالحالة، لا مربّعاً كالمنشور.
    const box = canvas.parentElement;
    const ratio = box ? box.clientHeight / box.clientWidth : 16 / 9;
    drawAvailabilityPoster(canvas, {
      name: story.name,
      link: story.slug ? `${POSTER_SITE}/${story.slug}` : POSTER_SITE,
      products: story.products,
      at: new Date(story.at),
      height: Math.round(1080 * ratio),
    }).then(() => alive && setDrawn(true));
    return () => {
      alive = false;
      counting = false;
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
      className="fixed inset-0 z-[65] bg-black text-white"
    >
      {/* الصورةُ تملأ الشاشةَ كلَّها، وما عداها طبقاتٌ فوقها */}
      <div className="absolute inset-0">
        {story.kind === 'platform' && story.news ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-brand-900 via-brand-700 to-brand px-7 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-[18px] shadow-[0_10px_26px_rgba(0,0,0,.35)]" />
            <span className="mt-5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide">
              جديدٌ في المحطة التقنية
            </span>
            <h2 className="mt-3 text-[26px] font-extrabold leading-tight">{story.news.title}</h2>
            <ul className="mt-5 space-y-3 text-[14px] leading-relaxed text-white/90">
              {story.news.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            className="h-full w-full"
            aria-label={`صورة إعلان توفر ${story.name}`}
          />
        )}
      </div>
      {/* مناطقُ النقر: يمينٌ للسابقة، وسطٌ للإيقاف، يسارٌ للتالية */}
      <button type="button" aria-label="السابقة" onClick={prev} className="absolute inset-y-0 right-0 w-1/3" />
      <button
        type="button"
        aria-label={paused ? 'متابعة' : 'إيقاف'}
        onClick={() => setPaused((p) => !p)}
        className="absolute inset-y-0 left-1/3 w-1/3"
      />
      <button type="button" aria-label="التالية" onClick={next} className="absolute inset-y-0 left-0 w-1/3" />

      {/* الطبقةُ العليا: شرائطُ التقدّم والاسم — على تدرّجٍ داكنٍ لتُقرأ */}
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent pb-8"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
      <div className="flex gap-1 px-3" dir="rtl">
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
          <p className="truncate text-[14px] font-extrabold drop-shadow">{story.name}</p>
          <p className="flex items-center gap-1 text-[11px] text-white/80">
            {story.kind === 'announced' && (
              <span className="rounded-full bg-traffic-red px-1.5 py-px text-[10px] font-extrabold text-white">غير مسجّلة</span>
            )}
            {story.kind === 'platform'
              ? `جديد المحطة · ${ageLabel(story.at)}`
              : story.kind === 'announced'
                ? `${story.city} · أُعلن ${ageLabel(story.at)}`
                : `${story.city} · أُكّد ${ageLabel(story.at)}`}
            {views !== null && (
              <span className="flex items-center gap-0.5" aria-label={`${views} مشاهدة`}>
                · <EyeIcon className="h-3.5 w-3.5" /> {views}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      </div>

      {/* الطبقةُ السفلى: الطريقُ وصفحةُ المحطة */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-4 pt-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
      >
        {story.kind === 'platform' && story.news ? (
          <a
            href={story.news.href}
            className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-white text-[13px] font-extrabold text-brand-900"
          >
            {story.news.label}
          </a>
        ) : (
          <>
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
            {story.kind === 'announced' ? (
              // لا صفحةَ لغير المسجّلة — خبرُها وتصويتُ الناس عليه في اللوحة الحمراء.
              <a
                href="/#unregistered-board"
                className="flex min-h-[34px] flex-1 items-center justify-center rounded-xl bg-white/15 text-[12px] font-bold"
              >
                الخبر والتصويت
              </a>
            ) : (
              <a
                href={`/station/${story.id}`}
                className="flex min-h-[34px] flex-1 items-center justify-center rounded-xl bg-white/15 text-[12px] font-bold"
              >
                صفحة المحطة
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
