'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SpinnerIcon } from './icons';

/** حارسٌ لصفحةٍ لم تُعلَن بعد.
 *
 *  كان «مساعد الطريق» يُخفى بمفتاحٍ في التخزين المحلّي — يُشغّله من يعرفه،
 *  وأيُّ زائرٍ يفتح أدوات المتصفّح يعرفه. فصار على الدور نفسِه الذي يحرس
 *  لوحة الإدارة: قراءةُ `profiles.role` من الجلسة.
 *
 *  **وحدُّه معلوم.** المشروع تصديرٌ ساكن، فالحارسُ في المتصفّح لا على خادم:
 *  يُخفي الصفحة عمّن يفتح رابطها، ولا يمنع من يقرأ الحزمة من رؤية شيفرتها
 *  ولا من يجلب `/road-routes.json` مباشرةً. وهو ما يكفي لميزةٍ تنتظر إعلانها
 *  ولا يكفي لسرّ — ولا سرَّ هنا: بياناتُها كلُّها من خرائطَ مفتوحة.
 *
 *  ولا يُعرض شيءٌ قبل أن يُعرف الدور: وميضُ صفحةٍ ثمّ اختفاؤها أسوأ من
 *  انتظارٍ صريح. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'yes' | 'no'>('checking');

  useEffect(() => {
    let alive = true;
    (async () => {
      // getSession يقرأ الجلسة المخزّنة ويجدّدها عند الحاجة؛ وgetUser جولةٌ
      // على خادم المصادقة تُقرأ عند سقوطها «غير مسجّل» — وهو ما كان يطرد
      // الإدارة من لوحتها بعد دخولٍ ناجح.
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!alive) return;
      if (!user) return setState('no');
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      setState(profile?.role === 'admin' ? 'yes' : 'no');
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SpinnerIcon className="h-7 w-7 text-brand" />
      </div>
    );
  }

  if (state === 'no') {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-extrabold text-slate-800">هذه الصفحة ليست متاحة بعد</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          خدمةٌ قيد الإعداد، تُعلَن حين تجهز بإذن الله.
        </p>
        <a href="/" className="btn-primary mt-6 w-full">
          العودة إلى المحطات
        </a>
      </main>
    );
  }

  return <>{children}</>;
}
