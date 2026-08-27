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

  if (mode === 'owner') {
    return (
      <>
        <p className="mt-2 text-center text-xs font-bold text-slate-500">
          تسجيل محطة — لصاحب المحطة أو المسؤول عن تحديث بياناتها
        </p>
        <div className="mt-2">
          <StationRegisterForm />
        </div>
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

      <button
        type="button"
        onClick={() => setMode('owner')}
        className="card mt-3 flex w-full items-center gap-3 border-brand-100 p-4 text-right"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
          <StoreIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">أنا صاحب محطة</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
            أملك محطة وقود، وأريد أن أعرض توفّر الوقود فيها للناس
          </span>
        </span>
      </button>

      {/* البابُ الذي جاء له أكثرُ الناس — فبطاقةٌ بوزن الأولى، لا حاشيةٌ تحتها */}
      <button
        type="button"
        onClick={() => setMode('subscriber')}
        className="card mt-3 flex w-full items-center gap-3 border-brand-100 p-4 text-right"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
          <BellRingIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">
            أريد أن يصلني إشعار عند توفّر الوقود
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
            سجّل اشتراكك هنا — بلا حساب وبلا رقم هاتف. اختر مدينتك ونوع وقودك فقط.
          </span>
        </span>
      </button>
    </section>
  );
}
