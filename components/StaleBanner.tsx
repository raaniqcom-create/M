'use client';

import { FRESH_HOURS } from '@/lib/hours';

/** «ما تراه ليس الآن» — الشريطُ الذي يفصل الصمتَ عن الكذب.
 *
 *  ── لماذا وُجد ───────────────────────────────────────────────────────────
 *
 *  كانت الصفحةُ الرئيسة تعرض بطاقةَ الخطأ بشرط `failed && stations === null`،
 *  فإذا نجح التحميلُ الأوّل ثمّ سقطت الشبكة لم يُعرض شيء: لا خطأ ولا مغزل —
 *  والأرقامُ القديمة باقيةٌ على الشاشة تُقرأ حاضرة. وهو ما وصفه المشروعُ عن
 *  نفسه في lib/noticeTemplates.ts:5: «أو أسوأ: تعرض حالةً قديمةً كأنها الآن».
 *
 *  ── والساعةُ لا المدّة ───────────────────────────────────────────────────
 *
 *  «قبل ساعتين» تُقدَّر، و«الساعة ١١:٤٠» تُقارَن بساعة الهاتف في يد صاحبها.
 *  ومن يقطع الطريق إلى محطةٍ يحتاج المقارنة لا التقدير.
 *
 *  ── ولا يُخلط بحداثة المحطة ──────────────────────────────────────────────
 *
 *  `isFresh` في lib/hours.ts تصف عمرَ إعلانِ المحطة **داخل** اللقطة؛ وهذا
 *  الشريطُ يصف عمرَ اللقطة نفسِها. فقد تكون المحطةُ «أعلنت قبل ساعة» في لقطةٍ
 *  عمرُها ثلاث ساعات. ولذلك لفظان مختلفان قصداً: هناك «آخر تحديث»، وهنا
 *  «هذه حالةُ الساعة …».
 *
 *  والحدّان قائمان في المنصّة، ولا يُخترع ثالث: دون FRESH_HOURS تُقال «قديمة»،
 *  وفوقها «أقدمُ من أن يُبنى عليها قرار»، وفوق WITHDRAW_HOURS لا تُعرض
 *  اللقطةُ أصلاً — ترفضها `loadCachedStations`. */
export function StaleBanner({ at, onRetry }: { at: string; onRetry: () => void }) {
  const when = new Date(at);
  const hours = (Date.now() - when.getTime()) / 3600_000;
  const dead = hours >= FRESH_HOURS;

  const clock = when.toLocaleTimeString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    hour: 'numeric',
    minute: '2-digit',
  });
  // اليومُ يُذكر فقط حين لا يكون اليوم — وإلا صار السطرُ أطولَ بلا فائدة.
  const sameDay =
    when.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }) ===
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  const day = sameDay
    ? ''
    : ` ${when.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long' })}`;

  return (
    <div
      role="status"
      className={`mb-3 rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed ${
        dead
          ? 'border-traffic-red/40 bg-red-50 text-traffic-red'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}
    >
      {dead ? (
        <>
          <b>الاتصال منقطع منذ وقتٍ طويل.</b> آخرُ ما وصل الجهازَ كان{day} الساعة{' '}
          <span dir="ltr">{clock}</span> — أقدمُ من أن يُبنى عليه قرار.
        </>
      ) : (
        <>
          <b>الاتصال منقطع.</b> هذه حالةُ{day} الساعة <span dir="ltr">{clock}</span>، وقد
          تغيّرت.
        </>
      )}{' '}
      <button
        type="button"
        onClick={onRetry}
        className="font-extrabold underline underline-offset-2"
      >
        أعد المحاولة
      </button>
    </div>
  );
}
