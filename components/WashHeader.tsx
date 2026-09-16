'use client';

import { useEffect, useState } from 'react';
import { readMyBookings } from '@/lib/wash';
import { CalendarIcon } from './icons';

/** رأسُ دليل المغاسل: الشعارُ واسمُ المنصّة، و«حجوزاتي» لمن حجز من هذا الجهاز. (الرجوعُ من BackBar العامّ.) */
export function WashHeader() {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    setMine(readMyBookings().length > 0);
  }, []);

  return (
    <header className="pt-4">
      <div className="flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-original.png" alt="" className="h-11 w-11 rounded-xl object-cover" />
          <span className="text-sm font-extrabold text-brand-700">المحطة التقنية</span>
        </a>
        {mine && (
          <a href="/wash/mine/" className="btn-ghost px-3 text-[12px]">
            <CalendarIcon className="h-4 w-4" />
            حجوزاتي
          </a>
        )}
      </div>
      <h1 className="mt-5 text-xl font-extrabold text-slate-800">غسيل السيارات</h1>
      <p className="mt-1 text-sm text-slate-500">اختر أقرب محطة واحجز موعد الغسل بسهولة</p>
    </header>
  );
}
