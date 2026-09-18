'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/** شريطُ الإدارة فوق صفحات «المغسلة التقنية»: المشرفُ يتنقّل بين أعين المستخدمين —
 *  زائرٌ يتصفّح، حاجزٌ، مسجِّلُ مغسلةٍ جديدة، وصاحبُ مغسلةٍ في لوحته — بلا تبديلِ حساب.
 *  لا يُرسَم لغير المشرف: نداءُ wash_is_admin واحدٌ بعد الجلسة. */
export function WashAdminBar() {
  const pathname = usePathname() ?? '';
  const [admin, setAdmin] = useState(false);
  const [bookId, setBookId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      const { data: yes } = await supabase.rpc('wash_is_admin');
      if (!alive || !yes) return;
      setAdmin(true);
      const { data: w } = await supabase.from('washes_public').select('id').limit(1).maybeSingle();
      if (alive && w) setBookId((w as { id: string }).id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!admin) return null;
  const views = [
    { label: 'زائر', href: '/wash/', on: pathname === '/wash' || pathname === '/wash/' },
    { label: 'حاجز', href: bookId ? `/wash/book/?id=${bookId}` : '/wash/', on: pathname.startsWith('/wash/book') || pathname.startsWith('/wash/booking') || pathname.startsWith('/wash/mine') },
    { label: 'مسجِّل جديد', href: '/wash/register/?as=admin', on: pathname.startsWith('/wash/register') },
    { label: 'صاحب مغسلة', href: '/wash/owner/', on: pathname.startsWith('/wash/owner') },
    { label: 'الإدارة', href: '/admin/', on: false },
  ];
  return (
    <nav aria-label="وضع الإدارة" dir="rtl" className="sticky top-0 z-50 flex items-center gap-1 overflow-x-auto bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 no-scrollbar">
      <span className="me-1 shrink-0 font-bold text-amber-300">وضع الإدارة — استعرض كـ:</span>
      {views.map((v) => (
        <a key={v.label} href={v.href} className={`shrink-0 rounded-full px-2.5 py-1 font-bold ${v.on ? 'bg-brand text-white' : 'bg-white/10 text-slate-100'}`}>
          {v.label}
        </a>
      ))}
    </nav>
  );
}
