'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BranchBoard } from '@/components/BranchBoard';
import { BranchStats } from '@/components/BranchStats';
import { ScheduleBoard } from '@/components/ScheduleBoard';
import { SpinnerIcon } from '@/components/icons';
import {
  boardDate,
  applyOverrides,
  buildBoard,
  groupBoard,
  loadBoardStations,
  loadOverrides,
  loadSchedule,
  type BoardGroup,
} from '@/lib/scheduleData';

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
 *  والسحبُ حذفُ صفّ.
 *
 *  ── ورابطٌ واحدٌ لا ثلاثة ─────────────────────────────────────────────
 *
 *  طلب الفرعُ «تنظيمَ روابط الدخول». فالثلاثةُ التي كانت ستُسلَّم — لوحةٌ
 *  وإحصائيّاتٌ وجدول — تبويباتٌ في صفحةٍ واحدة: رابطٌ يُكتب في كتابٍ رسميٍّ
 *  مرّةً ولا يُصحَّح بعدها.
 *
 *  ولا زرَّ يكتب في أيٍّ منها. وهو شرطُ بقاء الحساب مشترَكاً أصلاً — مكتوبٌ
 *  في `scripts/add-branch-viewer.mjs:11-14`: «ولو صار للوحة زرٌّ يكتب في
 *  القاعدة، وجب حسابٌ لكلِّ شخص». */

type Tab = 'board' | 'stats' | 'schedule';

const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'نظرة' },
  { id: 'stats', label: 'إحصائيّات' },
  { id: 'schedule', label: 'جدول الغد' },
];

/** تبويبُ الجدول: القراءةُ نفسُها التي تقرؤها صفحةُ `/schedule` العامّة.
 *
 *  ولا دالّةَ خاصّةً بالفرع: الجدولُ منشورٌ للناس كلِّهم، فمصدرٌ ثانٍ له كان
 *  سيسمح بأن يفترقا. */
function BranchSchedule() {
  const [groups, setGroups] = useState<BoardGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const day = boardDate();

  useEffect(() => {
    void (async () => {
      try {
        const schedule = await loadSchedule();
        const stations = await loadBoardStations(day, schedule);
        const marks = await loadOverrides();
        // ولا ترتيبَ بمناطق أحد: الفرعُ يقرأ الأنبار كلَّها بلا تفضيل.
        setGroups(groupBoard(applyOverrides(buildBoard(schedule, stations, day), marks, day), []));
      } catch {
        setFailed(true);
      }
    })();
  }, [day]);

  if (failed) {
    return (
      <section className="card p-5 text-center">
        <p className="text-xs font-bold text-slate-600">تعذّر تحميل الجدول. أعد فتح الصفحة.</p>
      </section>
    );
  }
  if (!groups) {
    return (
      <div className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </div>
    );
  }
  return <ScheduleBoard groups={groups} day={day} />;
}
export default function BranchPage() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'yes' | 'no'>('checking');
  const [tab, setTab] = useState<Tab>('board');

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
      {/* `branch-hide`: الطباعةُ تُخرج ما في التبويب المفتوح وحدَه، وشريطُ
          التبويبات على الورقة زخرفةٌ لا تُنقَر. وهو الصنفُ نفسُه الذي
          يستعمله BranchBoard في أنماط الطباعة. */}
      <div className="branch-hide mb-4 flex gap-1 rounded-full bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex-1 rounded-full px-3 py-2 text-[12.5px] font-bold transition ${
              tab === t.id ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' && <BranchBoard />}
      {tab === 'stats' && <BranchStats />}
      {tab === 'schedule' && <BranchSchedule />}
    </main>
  );
}
