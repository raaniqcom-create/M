'use client';

import { useEffect, useState } from 'react';
import { APP_STORE_URL } from '@/lib/stores';

/** «حدّث التطبيق» — شاشةٌ إجباريّةٌ لمن على آيفون ببناءٍ قديم، تعرض ميزةَ CarPlay.
 *
 *  ── متى تظهر ────────────────────────────────────────────────────────────
 *
 *  في تطبيق آيفون وحده، وحين يكون البناءُ أقدمَ من ٢٦. ولا `@capacitor/app`
 *  في المشروع ليُقرأ رقمُ البناء، فالعلامةُ إضافةٌ أصليّةٌ لم تُشحن إلّا في ٢٦:
 *  `Capacitor.isPluginAvailable('Preferences')` — كاذبةٌ في كلّ بناءٍ قبله.
 *  فلا رقمَ يُخمَّن ولا تاريخ.
 *
 *  والمتصفّحُ لا يراها أبداً إلّا بـ`?carplay=1` للمعاينة — طلبُ صاحب المنصّة:
 *  «حاول أن تفعل هذا الظهور محلّيّاً حتى نعتمده للكلّ».
 *
 *  ── وإجباريّةٌ بقراره ────────────────────────────────────────────────────
 *
 *  لا زرَّ «لاحقاً»: التحديثُ ثلاثةُ ميغا، والميزةُ هي سببُ التحديث. فمن على
 *  بناءٍ قديمٍ لا يمرّ إلّا بالمتجر. */
/** يُقلب إلى `true` بكلمة صاحب المنصّة بعد أن يراها على `?carplay=1`. */
const ROLLOUT = false;

export function CarPlayUpdate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const cap = (window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        isPluginAvailable?: (name: string) => boolean;
      };
    }).Capacitor;
    const preview = new URLSearchParams(window.location.search).get('carplay') === '1';
    const oldIos =
      !!cap?.isNativePlatform?.() &&
      cap.getPlatform?.() === 'ios' &&
      !cap.isPluginAvailable?.('Preferences');
    setShow(preview || (ROLLOUT && oldIos));

    // ── `&t=2.5` يُجمّد الحركةَ عند لحظةٍ — لتصوير الفيديو الترويجيّ ──────
    // لقطةٌ لكلّ لحظةٍ بمتصفّحٍ بلا رأس ثمّ ffmpeg. لا أثرَ له بغير المعامل.
    const t = Number(new URLSearchParams(window.location.search).get('t'));
    if (preview && Number.isFinite(t) && t > 0) {
      const at = (delay: number) => `animation-play-state: paused !important; animation-delay: ${delay - t}s !important;`;
      const style = document.createElement('style');
      style.textContent = `
        .carplay-demo .demo-1, .carplay-demo .demo-icon { ${at(0)} }
        .carplay-demo .demo-2, .carplay-demo .demo-pick { ${at(3)} }
        .carplay-demo .demo-3, .carplay-demo .demo-route { ${at(6)} }`;
      document.head.appendChild(style);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تحديث التطبيق"
      className="fixed inset-0 z-[96] overflow-y-auto bg-gradient-to-b from-brand-900 via-brand-700 to-brand text-white"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-5 pb-10 pt-12 text-center">
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide">
          تحديثٌ مطلوب · 3 ميغا فقط
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold leading-tight">
          المحطة التقنية على شاشة سيّارتك
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-white/85">
          أوّلُ تطبيقٍ في العراق يعمل على <b>Apple CarPlay</b>: الوقودُ المتوفّر، والطريقُ
          إليه — من شاشة السيّارة، بلا هاتف في اليد.
        </p>

        <CarScreen />

        <ol className="mt-6 w-full space-y-2.5 text-right">
          {[
            ['حدّث التطبيق', '3 ميغا فقط — ضغطةٌ واحدة في App Store.'],
            ['من شاشة السيّارة اختر أيقونة المحطة التقنية', 'تظهر بين تطبيقات CarPlay فورَ وصل الهاتف.'],
            ['اختر نوع الوقود', 'كاز · بانزين · غاز — المتوفّرُ الآن قربك.'],
            ['توجّه إلى المحطة فوراً مع ويز', 'زرُّ «الطريق» يفتح ويز على شاشة السيّارة.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl bg-white/12 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-extrabold text-brand-900">
                {i + 1}
              </span>
              <span>
                <span className="block text-[13.5px] font-extrabold">{t}</span>
                <span className="block text-[11.5px] leading-relaxed text-white/75">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        <a
          href={APP_STORE_URL}
          className="mt-6 block w-full rounded-full bg-white px-6 py-3.5 text-[15px] font-extrabold text-brand-900 shadow-[0_10px_26px_rgba(0,0,0,.28)]"
        >
          حدّث التطبيق الآن — فقط 3 ميغا
        </a>
        <p className="mt-3 text-[10.5px] leading-relaxed text-white/60">
          إن لم يظهر زرُّ التحديث بعد، افتح App Store وابحث عن «المحطة التقنية».
        </p>
      </div>
    </div>
  );
}

/** شاشةُ سيّارةٍ تتحرّك: الأيقونة ← أنواعُ الوقود ← الطريق. ثلاثُ لقطاتٍ في
 *  دورةٍ واحدة بـCSS وحدَه، بلا صورةٍ ولا فيديو — فتصل في الحزمة نفسِها. */
function CarScreen() {
  return (
    <div className="carplay-demo mt-6 w-full max-w-[21rem]">
      <div className="relative overflow-hidden rounded-[22px] border-[6px] border-slate-900 bg-slate-950 shadow-[0_18px_40px_rgba(0,0,0,.45)]">
        {/* الشريطُ الجانبيُّ كما في CarPlay */}
        <div className="absolute inset-y-0 right-0 flex w-12 flex-col items-center gap-3 border-l border-white/10 bg-black/40 pt-3">
          <span className="text-[9px] font-bold text-white/70">19:24</span>
          <span className="h-7 w-7 rounded-lg bg-slate-700" />
          <span className="h-7 w-7 rounded-lg bg-slate-700" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="demo-icon h-7 w-7 rounded-lg" />
        </div>

        {/* اللقطة ١ — الأيقونة */}
        <div className="demo-frame demo-1 flex h-44 items-center justify-center pr-12">
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl shadow-lg" />
            <span className="text-[11px] font-bold text-white/90">المحطة التقنية</span>
          </div>
        </div>

        {/* اللقطة ٢ — أنواعُ الوقود */}
        <div className="demo-frame demo-2 absolute inset-0 pr-12">
          <p className="pt-3 text-center text-[11px] font-extrabold text-white">أيّ وقودٍ تريد؟</p>
          <div className="mx-auto mt-3 grid w-[13rem] grid-cols-3 gap-2 text-center text-[10px] font-bold text-white/90">
            {['كاز · 12', 'بانزين محسن · 2', 'بانزين عادي · 1', 'غاز · 2', 'LPG · 1'].map((t, i) => (
              <span key={t} className={`rounded-xl bg-white/10 px-1 py-3 ${i === 1 ? 'demo-pick ring-2 ring-white bg-brand/40' : ''}`}>
                ⛽<br />{t}
              </span>
            ))}
          </div>
        </div>

        {/* اللقطة ٣ — الطريق، وخلفَه الأنبارُ: الفراتُ ومدنُه دلالةً لا خريطةً */}
        <div className="demo-frame demo-3 absolute inset-0 pr-12">
          <div className="absolute inset-0 bg-[#0b1a2b]" />
          <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full" style={{ fontFamily: 'inherit' }}>
            {/* الفراتُ من القائم إلى الفلوجة */}
            <path d="M-5 30 C 30 34, 45 50, 70 58 S 105 70, 125 84 S 160 100, 205 104" fill="none" stroke="#3b82f6" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" />
            <path d="M-5 30 C 30 34, 45 50, 70 58 S 105 70, 125 84 S 160 100, 205 104" fill="none" stroke="#93c5fd" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
            {/* مدنٌ على النهر */}
            {[
              ['حديثة', 52, 50],
              ['هيت', 92, 68],
              ['الفلوجة', 172, 102],
            ].map(([name, x, y]) => (
              <g key={name as string}>
                <circle cx={x as number} cy={y as number} r="2.2" fill="#cbd5e1" />
                <text x={(x as number) - 4} y={(y as number) - 5} fontSize="7" fill="#cbd5e1" textAnchor="end" direction="rtl">
                  {name}
                </text>
              </g>
            ))}
            {/* الطريقُ من السيّارة إلى محطة الرمادي */}
            <path className="demo-route" d="M28 108 C 60 106, 84 98, 104 92 S 122 86, 128 84" fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
            <circle cx="28" cy="108" r="4.5" fill="#fff" />
            <circle cx="28" cy="108" r="8" fill="#fff" fillOpacity="0.25" />
            <path d="M128 84 c -6 -8 -6 -18 0 -18 s 6 10 0 18 z" fill="#ef4444" />
            <circle cx="128" cy="73" r="2.5" fill="#fff" />
            <text x="122" y="64" fontSize="7" fill="#fff" textAnchor="end" direction="rtl">الرمادي</text>
          </svg>
          <div className="absolute left-2 right-14 top-2 flex items-center justify-between rounded-xl bg-black/60 px-2.5 py-1.5 text-[10px] font-bold text-white">
            <span className="rounded-full bg-brand px-2 py-0.5">الطريق · ويز ←</span>
            <span>محطة وقود الأنبار · بانزين محسن</span>
          </div>
        </div>
      </div>
    </div>
  );
}
