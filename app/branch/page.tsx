'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BranchBoard } from '@/components/BranchBoard';
import { SpinnerIcon } from '@/components/icons';

/** لوحةُ فرع شركة توزيع المنتجات النفطية — الوعدُ الذي في الكتاب، مُنجَزاً.
 *
 *  `docs/anbar-oil/letter-oil.html`: «لوحة متابعة للفرع تعرض حالة التوفر في
 *  عموم المحافظة لحظة بلحظة — تُجهَّز عند الطلب وبلا كلفة».
 *
 *  ── والحارسُ للمحاسبة لا للسرّيّة ─────────────────────────────────────
 *
 *  المشروعُ تصديرٌ ساكن، فالحارسُ في المتصفّح ولا خادمَ يحرس قبله — ومن يقرأ
 *  الحزمة يجد الصفحة. **وهذا مقبولٌ هنا لسببٍ محدَّد**: كلُّ ما تعرضه اللوحة
 *  مقروءٌ لغير المسجَّل أصلاً — `stations_public` و`station_products` وجدولا
 *  الازدحام كلُّها ممنوحةٌ لدور anon. فلا سرَّ يُحرَس.
 *
 *  وإنما يُطلب الدخولُ لأمرين قالهما صاحبُ المنصّة: أن يُعرف من دخل، وأن
 *  تُسحب الصلاحية متى شاء — وكلاهما يحتاج اسماً لا قفلاً. ولو أُريد قفلٌ
 *  حقيقيّ لَلزِم أن تُحجب الجداولُ نفسُها، وذلك يُطفئ التطبيقَ على الناس.
 *
 *  ── ولا دورَ ثالثاً في profiles ───────────────────────────────────────
 *
 *  `user_role` نوعٌ مُعدَّد بقيمتين، وإضافةُ ثالثةٍ لا رجعةَ فيها في Postgres
 *  وتكسر توجيهَ الجلسة (lib/useSession.ts يصنّف كلَّ ما ليس admin مالكاً،
 *  فيُرسَل موظّفُ الفرع إلى /owner فيجده بلا محطة). فجدولُ `branch_viewers`،
 *  والسحبُ حذفُ صفّ. */
export default function BranchPage() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'yes' | 'no'>('checking');

  useEffect(() => {
    // الجلسةُ المخزَّنة لا نداءٌ للخادم: طلبٌ ساقطٌ كان يُقرأ «غير مسجَّل»
    // فيطرد صاحبَ الحقّ بعد دخولٍ ناجح — نفس علّة app/admin/page.tsx:81-84.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) {
        router.replace('/login');
        return;
      }
      const { data: ok, error } = await supabase.rpc('is_branch_viewer');
      // وخطأُ القراءة لا يُقرأ «ليس مصرَّحاً»: انقطاعُ شبكةٍ يُخرج المصرَّحَ
      // له ويقول له إنه ليس منهم. فيُعاد السؤال، ولا يُحسم بالفشل.
      if (error) {
        const retry = await supabase.rpc('is_branch_viewer');
        setState(retry.data === true ? 'yes' : retry.error ? 'checking' : 'no');
        return;
      }
      setState(ok === true ? 'yes' : 'no');
    });
  }, [router]);

  if (state === 'checking') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }

  if (state === 'no') {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-base font-extrabold text-brand-900">لوحة المتابعة</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          هذه اللوحة مخصّصة لموظّفي فرع شركة توزيع المنتجات النفطية. إن كنت منهم ولم
          تُفتح لك، راجع إدارة المنصّة.
        </p>
        <a href="/" className="btn-ghost mt-5 inline-flex">
          العودة إلى الصفحة الرئيسة
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <BranchBoard />
    </main>
  );
}
