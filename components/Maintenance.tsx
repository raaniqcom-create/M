'use client';

import { useCallback, useEffect, useState } from 'react';
import { isDown, readStatus, type SiteStatus } from '@/lib/status';
import { loadCachedStations } from '@/lib/stations';
import { readChoice } from '@/lib/alerts';

const DISMISSED = 'maintenance-dismissed';

/** شاشةُ الصيانة — تُركَّب مرّةً في التخطيط فتغطّي كلَّ مسار.
 *
 *  ── ولماذا تُغلق ولا تُقفل ───────────────────────────────────────────────
 *
 *  حين تُنقل قاعدةُ البيانات، الجزءُ الوحيد من الموقع الذي ما زال يعمل هو
 *  صفحاتُ المحطات الساكنة: العنوان، والدوام، **ورقم الهاتف**. ومن يحتاج أن
 *  يتّصل بمحطةٍ في تلك اللحظة يجب أن يستطيع. فالشاشةُ تُعلن وتحجب، ولا تمنع
 *  من أصرّ — والزرُّ يكتب في `sessionStorage` فلا يُسأل في الجلسة نفسِها مرّتين.
 *
 *  ── وفوق شاشة الافتتاح ───────────────────────────────────────────────────
 *
 *  `SplashScreen` عند `z-[70]`، ولولا ما فوقها لَغطّت الإعلانَ أربعَ ثوانٍ.
 *
 *  ── والسؤالُ يتكرّر وهي قائمةٌ فقط ────────────────────────────────────────
 *
 *  فتنتهي الصيانةُ فيعود الموقعُ وحدَه بلا إعادة تحميل. وحين لا تكون صيانةً لا
 *  يُسأل الملفُّ إطلاقاً: هاتفٌ على شبكةٍ عراقيّة لا يُشغَّل بسؤالٍ كلَّ دقيقة. */
export function Maintenance() {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [hidden, setHidden] = useState(true);

  const check = useCallback(async () => {
    setStatus(await readStatus());
  }, []);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(DISMISSED) === '1');
    } catch {
      setHidden(false);
    }
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  const down = isDown(status);

  useEffect(() => {
    if (!down) return;
    const t = setInterval(() => void check(), 60_000);
    return () => clearInterval(t);
  }, [down, check]);

  if (!down || hidden) return null;

  const back = status?.until
    ? new Date(status.until).toLocaleTimeString('ar-IQ', {
        timeZone: 'Asia/Baghdad',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  // ── «سنُعلمك عند العودة» — وعدٌ يُقال لمن يصحّ في حقّه وحدَه ────────────
  //
  // إرسالُ الإشعار يحتاج أن يكون الجهازُ مشتركاً سلفاً؛ وتسجيلُ مشتركٍ جديد
  // كتابةٌ في قاعدة البيانات — وهي بعينها ما يكون متوقّفاً وقت الصيانة. فلا
  // يُعرض زرُّ «أعلمني» هنا: زرٌّ يَعِد بما لا يقع أسوأُ من لا زرّ.
  //
  // و`readChoice` تقرأ من الجهاز لا من الشبكة، فتعمل والقاعدةُ مطفأة.
  const subscribed = readChoice() !== null;

  const snap = loadCachedStations();
  const snapClock = snap
    ? new Date(snap.at).toLocaleTimeString('ar-IQ', {
        timeZone: 'Asia/Baghdad',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED, '1');
    } catch {
      /* تصفّحٌ خاصّ — يُغلق للجلسة في الذاكرة وحدها */
    }
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gradient-to-b from-brand to-brand-700 px-6 text-center text-white"
    >
      <div className="max-w-sm">
        {/* الشعارُ أوّلاً — والسابقةُ SplashScreen: أيقونةُ التطبيق على أبيضها
            لا شفّافةً، فتقف على الأخضر بطاقةً مضيئة. وبدونه تُقرأ الشاشةُ
            الخضراءُ صفحةَ خطأٍ من مزوّد الشبكة لا رسالةً من المنصّة. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={80}
          height={80}
          className="mx-auto h-20 w-20 rounded-[20px] shadow-[0_10px_26px_rgba(0,0,0,.32)] ring-1 ring-white/15"
        />
        <p className="mt-3 text-base font-extrabold tracking-tight">المحطة التقنية</p>

        <h1 className="mt-4 text-lg font-extrabold">المنصّة في صيانة الآن</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-white/90">
          {status?.message?.trim() || 'نُجري تحديثاً قصيراً على الخدمة.'}
        </p>
        {back && (
          <p className="mt-2 text-[12px] font-bold text-white/80">
            نتوقّع العودة الساعة <span dir="ltr">{back}</span>
          </p>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-white/75">
          {subscribed
            ? 'وتنبيهاتك مفعّلة على هذا الجهاز — سيصلك إشعارٌ عند العودة.'
            : 'ولا تنبيهات على هذا الجهاز. فعّلها بعد العودة ليصلك خبر الوقود أوّلاً بأوّل.'}
        </p>

        {snapClock ? (
          <>
            <p className="mt-5 text-[11.5px] text-white/70">
              آخرُ حالةٍ وصلت جهازك كانت الساعة <span dir="ltr">{snapClock}</span>
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-2 rounded-full bg-white px-5 py-2 text-[12.5px] font-extrabold text-brand-900"
            >
              اعرض آخر حالة
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            className="mt-5 rounded-full bg-white/15 px-5 py-2 text-[12.5px] font-bold text-white"
          >
            تصفّح على أي حال
          </button>
        )}
      </div>
    </div>
  );
}
