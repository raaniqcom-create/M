'use client';

import { useEffect, useState } from 'react';
import { activeNotice, readStatus, type SiteNotice as Notice } from '@/lib/status';

const SEEN = 'notice-seen';

/** إنذارٌ ملءَ الشاشة قبل توقّفٍ مخطَّط — يُقرأ ثمّ ينصرف.
 *
 *  ── ولماذا شاشةٌ كاملةٌ لا شريط ────────────────────────────────────────
 *
 *  الشريطُ يُمرَّر عليه. وهذا خبرٌ يُقرأ مرّةً واحدةً ولا يُقرأ مرّتين: أن
 *  المنصّة ستتوقّف، ومتى، وكم. فيُعطى الشاشةَ خمسَ ثوانٍ ثمّ يخلّيها.
 *
 *  ── ومرّةً في الجلسة ────────────────────────────────────────────────────
 *
 *  في `sessionStorage` لا `localStorage`: من فتح التطبيق غداً يستحقّ أن
 *  يُذكَّر، ومن تنقّل بين صفحتين الآن لا يستحقّ أن يُحبَس مرّتين. والمفتاحُ
 *  يحمل وقتَ الإنذار، فإنذارٌ جديدٌ يُعرض ولو في الجلسة نفسِها.
 *
 *  ── وينصرف وحدَه من ثلاث جهات ──────────────────────────────────────────
 *
 *  عدّادٌ ينتهي · زرُّ تخطٍّ · ووقتٌ في الملفّ يمضي فلا يُعرض أصلاً. الثالثةُ
 *  هي المهمّة: إنذارٌ يبقى بعد وقوع ما أنذر به يصير كذباً، وهو ما يقع حتماً
 *  لو تُرك رفعُه ليدٍ تتذكّر. */
export function SiteNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const status = await readStatus();
      if (!alive) return;
      // الصيانةُ الواقعةُ تسبق الإنذارَ بها: شاشتان معاً عبثٌ، والواقعُ أولى.
      const n = status?.maintenance ? null : activeNotice(status);
      if (!n) return;
      try {
        if (sessionStorage.getItem(SEEN) === n.until) return;
        sessionStorage.setItem(SEEN, n.until);
      } catch {
        /* تصفّحٌ خاصّ — يُعرض في كلّ فتحة، وهو أهونُ من ألّا يُعرض */
      }
      setNotice(n);
      setLeft(Math.min(Math.max(Math.round(n.seconds) || 5, 3), 15));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!notice || left <= 0) return;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [notice, left]);

  if (!notice || left <= 0) return null;

  const total = Math.min(Math.max(Math.round(notice.seconds) || 5, 3), 15);
  // محيطُ دائرةٍ نصفُ قطرها ١٦ — يُحسب لا يُقرَّب، وإلّا لم تُغلق الحلقة.
  const C = 2 * Math.PI * 16;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={notice.title}
      className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-gradient-to-b from-brand via-brand-600 to-brand-700 px-7 text-center text-white"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={88}
        height={88}
        className="h-22 w-22 rounded-[22px] shadow-[0_10px_26px_rgba(0,0,0,.32)] ring-1 ring-white/15"
        style={{ height: 88, width: 88 }}
      />

      {/* «صنع في الأنبار» — الصورةُ نفسُها التي على شاشة الافتتاح، فتُقرأ
          الشاشتان بيتاً واحداً لا شاشتين من تطبيقين. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/anbar-splash.webp"
        alt="صنع في الأنبار"
        className="mt-4 w-[54%] max-w-[178px] drop-shadow-[0_12px_26px_rgba(0,0,0,.34)]"
      />

      <h1 className="mt-6 text-[17px] font-extrabold leading-snug">{notice.title}</h1>
      <p className="mt-3 max-w-[30ch] whitespace-pre-line text-[13px] leading-relaxed text-white/90">
        {notice.body}
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLeft(0)}
          className="rounded-full bg-white px-6 py-2.5 text-[13px] font-extrabold text-brand-900"
        >
          تخطّي
        </button>

        <span className="relative flex h-11 w-11 items-center justify-center">
          <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - left / total)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <b className="text-[14px] font-extrabold tabular-nums" dir="ltr">
            {left}
          </b>
        </span>
      </div>
    </div>
  );
}
