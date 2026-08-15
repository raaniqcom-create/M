'use client';

import { useEffect, useState } from 'react';
import { FuelIcon, MapPinIcon, BellRingIcon } from './icons';

const SLIDES = [
  {
    icon: FuelIcon,
    title: 'سجّل محطتك مجاناً',
    body: 'اعرض توفر الوقود لديك لآلاف المستخدمين',
    // /login was the wrong door: an owner without an account tapped "register"
    // and landed on a sign-in form for a password they never had.
    href: '/register',
  },
  {
    icon: MapPinIcon,
    title: 'شارك بحالة الازدحام',
    body: 'ضغطة واحدة تساعد بقية المستخدمين',
    href: null,
  },
  {
    icon: BellRingIcon,
    title: 'فعّل التنبيهات',
    body: 'اعرف فور وصول الوقود لمحطتك المفضلة',
    href: null,
  },
];

export function PromoStrip() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  const content = (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-brand-700 to-brand p-4 text-white shadow-lift">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
        <Icon className="h-5 w-5" />
      </span>
      <div key={index} className="animate-fade-slide min-w-0">
        <p className="truncate text-sm font-bold">{slide.title}</p>
        <p className="truncate text-xs text-white/80">{slide.body}</p>
      </div>
      <div className="mr-auto flex gap-1">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );

  return slide.href ? (
    <a href={slide.href} aria-label={slide.title}>
      {content}
    </a>
  ) : (
    content
  );
}
