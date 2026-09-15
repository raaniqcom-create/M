'use client';

import { useState } from 'react';
import { StationRegisterForm } from './StationRegisterForm';
import { AlertSetup } from './AlertSetup';
import { BellRingIcon, StoreIcon } from './icons';

/** بابان: صاحبُ محطة، ومشترك. ويُسأل قبل أن يُعرض أيُّ حقل.
 *
 *  «الرحاب» سُجّلت أربع مرّات في إحدى وسبعين دقيقة بأربعة أرقام، وكلُّ صفٍّ
 *  منها بلا منتجٍ متوفّر — لم يكن أحدُهم صاحبَ محطة. جاؤوا بعد أن ظهرت المحطة
 *  الحقيقية يريدون أن يعرفوا متى يتوفّر فيها الوقود، وكان هذا وحده ما يشبه
 *  التسجيل في الموقع. والنثرُ بجانب النموذج يخسر أمام النموذج دائماً: الحقولُ
 *  هي ما يبدو أنه الجواب. فلا تُرسَم الحقول حتى يقول الزائرُ أيَّ بابٍ أراد.
 *
 *  **وبابُ المشترك تسجيلٌ لا إعداد.**
 *
 *  كان رابطاً يُخرج الزائرَ من صفحة التسجيل إلى صفحةٍ اسمُها «تنبيهات»، فمن
 *  جاء ليسجّل يجد نفسه في إعدادات. فصار الاشتراكُ يتمّ هنا، في مكانه، بنفس
 *  وزن الباب الآخر — ولا يزال بلا حسابٍ ولا رقم. */
export function RegisterGate() {
  const [mode, setMode] = useState<'owner' | 'subscriber' | null>(null);
  /** جملةٌ يقرؤها ويؤشّرها قبل أن يرى حقلاً: من جاء للاشتراك يقف هنا. */
  const [sworn, setSworn] = useState(false);

  if (mode === 'owner') {
    return (
      <>
        <p className="mt-2 text-center text-xs font-bold text-slate-500">
          تسجيل محطة — لصاحب المحطة أو المسؤول عن تحديث بياناتها
        </p>
        <label className="card mt-3 flex cursor-pointer items-start gap-3 border-amber-200 bg-amber-50 p-4">
          <input
            type="checkbox"
            checked={sworn}
            onChange={(e) => setSworn(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-xs leading-relaxed text-amber-900">
            <b className="block text-[13px]">قبل التسجيل — تأكيدٌ واحد</b>
            أنا أعمل في هذه المحطة وسأحدّث توفّر الوقود فيها كلَّ يوم — وأعلم أنّ التسجيل ليس
            للاشتراك في التنبيهات.
          </span>
        </label>
        {!sworn && (
          <button
            type="button"
            onClick={() => setMode('subscriber')}
            className="mt-2 block min-h-[44px] w-full text-center text-xs font-bold text-brand-700 underline"
          >
            لستُ من إدارة محطة — أريد الإشعارات فقط
          </button>
        )}
        {sworn && (
          <div className="mt-2">
            <StationRegisterForm />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mt-2 block min-h-[44px] w-full pt-2 text-center text-xs font-semibold text-slate-400"
        >
          لست صاحب محطة — رجوع
        </button>
      </>
    );
  }

  if (mode === 'subscriber') {
    return (
      <>
        <p className="mt-2 text-center text-xs font-bold text-slate-500">
          تسجيل مشترك — ليصلك إشعارٌ فور توفّر الوقود
        </p>
        <div className="mt-2">
          <AlertSetup />
        </div>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
          اشتراكُك محفوظٌ على هذا الجهاز. ولك إيقافه متى شئت.
        </p>
        <p className="mt-1 text-center text-[11px] leading-relaxed text-slate-500">
          تريد متابعة محطةٍ بعينها؟ افتح صفحتها من <a href="/" className="font-bold text-brand-700 underline">القائمة</a> واضغط «تابع هذه المحطة».
        </p>
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mt-1 block min-h-[44px] w-full pt-2 text-center text-xs font-semibold text-slate-400"
        >
          رجوع
        </button>
      </>
    );
  }

  return (
    <section className="mt-4">
      <p className="text-center text-base font-extrabold">من أنت؟</p>

      {/* البابُ الذي جاء له أكثرُ الناس — أوّلاً وأبرز، وبالكلمات التي يبحثون بها.
          كان البابان بوزنٍ واحد وصاحبُ المحطة أوّلاً، فسجّل المواطنون محطاتٍ
          ليتابعوها («الرحاب» خمسَ مرّات). */}
      <button
        type="button"
        onClick={() => setMode('subscriber')}
        className="card mt-3 flex w-full items-center gap-3 border-brand bg-brand-50 p-4 text-right"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <BellRingIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-extrabold text-brand-900">أريد إشعاراً عند توفّر الوقود</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-600">
            بلا حساب وبلا رقم هاتف — اختر مدينتك ونوع وقودك فقط. هذا ما يريده أكثرُ الناس.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setMode('owner')}
        className="card mt-3 flex w-full items-center gap-3 border-slate-200 p-4 text-right"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <StoreIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">أنا أعمل في محطة وقود وأريد تسجيلها</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
            لتحديث توفّر الوقود فيها كلَّ يوم. هذا ليس اشتراكاً في التنبيهات.
          </span>
        </span>
      </button>
    </section>
  );
}
