'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawAvailabilityPoster, POSTER_SITE } from './AvailabilityPoster';
import { RouteButton } from './RouteButton';
import { EyeIcon, XIcon, FuelIcon } from './icons';
import { ageLabel } from '@/lib/hours';
import { isSeen, isVideo, markSeen, type Story } from '@/lib/stories';
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
/** كلُّ سطرٍ يظهر بعد الذي قبله بهذا القدر — ليُقرأ بالترتيب. */
const LINE_MS = 1500;

/** مدّةُ القصّة: ستُّ ثوانٍ للصورة، وللنصّ ما يكفي لقراءته سطراً سطراً
 *  («نصائح لنُنهي الأزمة: أطِل وقتَها لإتمام قراءتها» — ١٦ أيلول). */
function storyMs(s: Story): number {
  if (!s.news) return STEP_MS;
  const chars = s.news.lines.reduce((n, l) => n + l.length, 0);
  return Math.min(45_000, Math.max(STEP_MS, s.news.lines.length * LINE_MS + 3000 + chars * 45));
}

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
    // المعاينةُ (id = preview) لا تُحصى ولا تُقرأ — ليست حالةً منشورة.
    if (story.id !== 'preview') recordView(story.id, story.at, fresh).then((n) => counting && setViews(n));
    setDrawn(false);
    if (story.kind === 'platform' || story.kind === 'tomorrow') {
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
    const t = setTimeout(next, storyMs(story));
    return () => clearTimeout(t);
  }, [i, paused, drawn, next, story]);

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
        {(story.kind === 'platform' || story.kind === 'tomorrow') && story.news ? (
          // تُمرَّر ولا تُقصّ: على هاتفٍ بخطٍّ مكبَّر كان الرأسُ يطبع فوق الفيديو
          // (صورُ عامل التوصيل، ١٣ أيلول). والحشوُ العلويّ/السفليّ يحجز مكانَ
          // الطبقتين الثابتتين. `justify-center` لا يعمل مع overflow فيُستعمل
          // `my-auto` على المحتوى. و«التوزيع غداً» صفراءُ كحلقتها.
          <div
            className={`flex h-full w-full flex-col items-center overflow-y-auto px-7 pb-28 pt-24 text-center ${
              story.kind === 'tomorrow'
                ? 'bg-gradient-to-b from-amber-700 via-amber-500 to-amber-400'
                : 'bg-gradient-to-b from-brand-900 via-brand-700 to-brand'
            }`}
          >
            <div className="my-auto flex w-full flex-col items-center">
            {/* صورةٌ برابطٍ من الإدارة، أو شعارُ المحطة — «صورة عبر رابط أو شعار المحطة». */}
            {story.news.image_url && isVideo(story.news.image_url) ? (
              // فيديو الحالة (كفيديو CarPlay): بلا صوتٍ ويكرّر — كحالات إنستغرام.
              <video
                src={story.news.image_url}
                autoPlay
                muted
                loop
                playsInline
                className="max-h-[42vh] w-auto max-w-[84%] rounded-2xl object-contain shadow-[0_10px_26px_rgba(0,0,0,.35)]"
              />
            ) : story.news.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={story.news.image_url} alt="" className="max-h-[38vh] w-auto max-w-[84%] rounded-2xl object-contain shadow-[0_10px_26px_rgba(0,0,0,.35)]" />
            ) : story.kind === 'tomorrow' ? (
              // خبرُ غياب: مضخّةٌ كبيرة على الأصفر، لا شعارُ المنصّة.
              <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white/20 shadow-[0_10px_26px_rgba(0,0,0,.25)]">
                <FuelIcon className="h-11 w-11 text-white" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-[18px] shadow-[0_10px_26px_rgba(0,0,0,.35)]" />
            )}
            <span className="mt-5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide">
              {story.kind === 'tomorrow' ? `${story.name} · ${story.city}` : 'جديدٌ في المحطة التقنية'}
            </span>
            <h2 className="mt-3 text-[22px] font-extrabold leading-tight">{story.news.title}</h2>
            <ul className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-white/90">
              {story.news.lines.map((l, k) => (
                // تسلسلٌ انتقاليّ: كلُّ سطرٍ يدخل بعد الذي قبله، فيُقرأ بالترتيب.
                <li
                  key={`${story.id}-${k}`}
                  className="story-line"
                  style={{ animationDelay: `${k * LINE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                >
                  {l}
                </li>
              ))}
            </ul>
            </div>
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
                      animationDuration: `${storyMs(story)}ms`,
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
            {story.kind === 'tomorrow' && (
              <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-extrabold text-amber-800">غداً لا اليوم</span>
            )}
            {story.kind === 'platform'
              ? `جديد المحطة · ${ageLabel(story.at)}`
              : story.kind === 'announced'
                ? `${story.city} · أُعلن ${ageLabel(story.at)}`
                : story.kind === 'tomorrow'
                  ? `${story.city} · نُبّه ${ageLabel(story.at)}`
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
        {(story.kind === 'platform' || story.kind === 'tomorrow') && story.news ? (
          story.news.href && story.news.label ? (
            <a
              href={story.news.href}
              className={`flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-white text-[13px] font-extrabold ${
                story.kind === 'tomorrow' ? 'text-amber-800' : 'text-brand-900'
              }`}
            >
              {story.news.label}
            </a>
          ) : null
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
