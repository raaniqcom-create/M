'use client';

import { useEffect, useState } from 'react';
import { readMyBookings } from '@/lib/wash';
import { CalendarIcon, WashIcon } from './icons';

/** رأسُ قسم الغسيل: بطاقةٌ غامرةٌ خضراء بهويّةِ مغاسل السيارات — تميّزه عن صفحات الوقود البيضاء.
 *  «حجوزاتي» لمن حجز من هذا الجهاز. الرجوعُ من BackBar العامّ فوقَها. */
export function WashHeader() {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    setMine(readMyBookings().length > 0);
  }, []);

  return (
    <header className="relative -mx-4 overflow-hidden rounded-b-[34px] bg-[linear-gradient(150deg,#0c3a21_0%,#14532d_38%,#15803d_100%)] px-5 pb-16 pt-5 text-white">
      {/* رذاذُ الماء: قطراتٌ خفيفةٌ ولمعةٌ علويّة — تُوحي بالغسيل بلا خروجٍ عن الأخضر. */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-10 top-8 h-32 w-32 rounded-full bg-brand-400/20 blur-2xl" />
      <svg aria-hidden viewBox="0 0 390 220" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" fill="none">
        <g fill="#ffffff">
          <circle cx="330" cy="34" r="5" /><circle cx="356" cy="70" r="3" /><circle cx="300" cy="88" r="3.5" />
          <circle cx="352" cy="120" r="4.5" /><circle cx="318" cy="150" r="3" /><circle cx="366" cy="168" r="3.5" />
          <circle cx="44" cy="150" r="4" /><circle cx="76" cy="182" r="3" /><circle cx="24" cy="188" r="3" />
        </g>
      </svg>

      <div className="relative flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-original.png" alt="" className="h-10 w-10 rounded-xl object-cover ring-2 ring-white/25" />
          <span className="text-[13px] font-bold text-white/90">المحطة التقنية</span>
        </a>
        {mine && (
          <a
            href="/wash/mine/"
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[12.5px] font-bold text-white ring-1 ring-white/25 backdrop-blur transition active:scale-95"
          >
            <CalendarIcon className="h-4 w-4" />
            حجوزاتي
          </a>
        )}
      </div>

      <div className="relative mt-7 flex items-center gap-3.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <WashIcon className="h-8 w-8 text-white" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[27px] font-black leading-none tracking-tight">غسيل السيارات</h1>
          <p className="mt-2 text-[13.5px] font-medium text-brand-100">اختر أقرب مغسلة واحجز موعدك بسهولة</p>
        </div>
      </div>
    </header>
  );
}
