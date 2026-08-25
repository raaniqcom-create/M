'use client';

import { useEffect, useState } from 'react';

const SEEN = 'splash-seen';

/** أوّل ما يراه الداخل: لون المنصّة، ثم شعارها، ثم من صنعها، ثم أين.
 *
 *  والشاشة تُعرض ما دامت المحطات تُحمَّل — لا مدّةً ثابتة. لكن لها حدّان:
 *
 *  · حدٌّ أدنى (900ms) فلا تومض ثم تختفي على شبكةٍ سريعة. ووميضُ شاشةٍ
 *    تظهر وتزول في جزء من الثانية أسوأ من ألّا تظهر، لأن العين تلحقها ولا
 *    تلحق ما فيها.
 *  · وحدٌّ أعلى (4s) فلا تحبس أحداً خلفها إن تأخّرت الشبكة أو سقط الطلب.
 *    الصفحة تحتها تعرف كيف تقول «تعذّر التحميل»؛ وهذه لا تعرف.
 *
 *  ومرّةً واحدة في الجلسة: من عاد من صفحة محطة إلى الرئيسة لا يُعرض عليه
 *  شعارُ افتتاحٍ ثانية — التنقّل داخل التطبيق ليس دخولاً جديداً.
 *
 *  ولا تُركَّب قبل FirstRun ولا تؤخّرها: تلك تطلب المدينة وإذن الإشعارات،
 *  وهي المسار التلقائي الوحيد الذي يُسجّل الجهاز على المتجرين. فهذه تسبقها
 *  بصرياً وتنتهي قبلها، ولا تمسّ ترتيبها. */
export function SplashScreen({ ready }: { ready: boolean }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [floor, setFloor] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(SEEN) === '1';
      if (!seen) sessionStorage.setItem(SEEN, '1');
    } catch {
      /* وضع خاص: تظهر في كل تحميل، ولا تُتذكّر */
      seen = false;
    }
    if (seen) return;

    setShow(true);
    const min = setTimeout(() => setFloor(true), 900);
    const max = setTimeout(() => setFloor(true), 4000);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  // تخرج حين يجتمع الأمران: انتهى التحميل، ومضى الحدّ الأدنى.
  useEffect(() => {
    if (!show || !floor || !ready) return;
    setLeaving(true);
    const t = setTimeout(() => setShow(false), 500);
    return () => clearTimeout(t);
  }, [show, floor, ready]);

  // وحدٌّ أقصى مطلق لا يعتمد على ready إطلاقاً: طلبٌ لا يُحلّ ولا يُرفض
  // كان يترك الشاشة فوق كل شيء إلى الأبد — وهي لا تحمل زرّ إعادة محاولة.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setLeaving(true), 4200);
    const g = setTimeout(() => setShow(false), 4700);
    return () => {
      clearTimeout(t);
      clearTimeout(g);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand px-7 transition-opacity duration-500 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* الشعار على أبيضه — ليس شفّافاً، فيقف على الأخضر بطاقةً مضيئة */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={96}
        height={96}
        className="h-24 w-24 rounded-[24px] shadow-[0_10px_26px_rgba(0,0,0,.32)] ring-1 ring-white/15"
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/anbar-splash.webp"
        alt="صنع في الأنبار"
        className="mt-5 w-[66%] max-w-[214px] drop-shadow-[0_12px_26px_rgba(0,0,0,.34)]"
      />

      <p className="mt-5 text-center text-[12.5px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.28)]">
        فكرة وتنفيذ وبرمجة أحمد الرفاعي
      </p>

      {/* الطريق: إسفلتٌ داكن، وعلاماتُ منتصفٍ تجري عليه، وضوءٌ يسبقها.
          والحركة تسكن لمن أطفأها في إعدادات هاتفه — القاعدة في globals.css */}
      <div className="road mt-5 h-4 w-[80%] max-w-[268px] overflow-hidden rounded-[9px]" />

      <p className="mt-3 text-[11px] text-white/75">جارٍ تحميل محطات الأنبار…</p>
    </div>
  );
}
