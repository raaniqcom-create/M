'use client';

import { useState } from 'react';
import { StationRegisterForm } from './StationRegisterForm';
import { BellRingIcon, StoreIcon } from './icons';

/** Ask before showing the form, instead of warning next to it.
 *
 *  «الرحاب» was registered four times in seventy-one minutes by four different
 *  people with four different phone numbers, and every one of those rows has
 *  zero available products — nobody who registered them was an owner. They
 *  arrived after the real station appeared, wanting to hear when it had fuel,
 *  and this was the only thing on the site that looked like signing up.
 *
 *  The page already carried an amber warning and a link to /alerts above the
 *  form, and people still filled the form in. Prose beside a form loses to the
 *  form every time: the fields are the thing that looks like the answer. So the
 *  fields are not rendered at all until someone says which door they wanted. */
export function RegisterGate() {
  const [isOwner, setIsOwner] = useState(false);

  if (isOwner) {
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
          onClick={() => setIsOwner(false)}
          className="mt-2 block min-h-[44px] w-full pt-2 text-center text-xs font-semibold text-slate-400"
        >
          لست صاحب محطة — رجوع
        </button>
      </>
    );
  }

  return (
    <section className="mt-4">
      <p className="text-center text-base font-extrabold">من أنت؟</p>

      <button
        type="button"
        onClick={() => setIsOwner(true)}
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

      {/* The one people actually came for, so it is a real card of equal weight
          and not a footnote under the form. */}
      <a
        href="/alerts"
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
            لا تحتاج حساباً ولا تسجيلاً — اختر مدينتك ونوع وقودك فقط
          </span>
        </span>
      </a>
    </section>
  );
}
