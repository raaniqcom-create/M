'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FuelIcon, InfoIcon, PlusIcon, SpinnerIcon } from '@/components/icons';

interface Announcement {
  id: string;
  title: string;
  body: string;
  note: string | null;
  cities: string[] | null;
  source: string | null;
  created_at: string;
}

/** Where a notification lands when it is about stations that have not joined.
 *
 *  The whole point is the footnote. Someone reads that the fuel arrived, sees
 *  that the station is not on the platform, and is standing at that forecourt
 *  twenty minutes later — that is the moment to ask them to register. A
 *  notification alone cannot say all that; a screen can. */
export default function NewsPage() {
  const [items, setItems] = useState<Announcement[] | null>(null);

  useEffect(() => {
    supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      // كما في الشريط: المدير يرى ما لم يُرسل بحكم سياسته، والجدول يجب أن
      // يسري عليه أيضاً وإلا رأى الخبر قبل الناس وحسبه منشوراً
      .not('sent_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setItems((data as Announcement[]) ?? []));
  }, []);

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <a href="/" className="mb-5 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="text-center text-xl font-extrabold">آخر الأخبار</h1>

      {items === null && (
        <div className="mt-8 flex justify-center">
          <SpinnerIcon className="h-6 w-6 text-brand" />
        </div>
      )}

      {items?.length === 0 && (
        <p className="mt-8 text-center text-sm text-slate-500">لا توجد أخبار حالياً.</p>
      )}

      {items?.map((a) => (
        <article key={a.id} className="card mt-4 p-5">
          <h2 className="text-base font-extrabold text-brand-900">{a.title}</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{a.body}</p>

          {a.source && (
            <p className="mt-3 text-xs font-semibold text-slate-500">المصدر: {a.source}</p>
          )}

          <p className="mt-1 text-[11px] text-slate-400">{when(a.created_at)}</p>

          {a.note && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-xs leading-relaxed text-amber-900">{a.note}</p>
            </div>
          )}
        </article>
      ))}

      {/* The reason this screen exists. Whoever reads it may be the owner, or
          may be standing in front of one twenty minutes from now. */}
      <section className="card mt-4 border-brand-100 p-5 text-center">
        <p className="text-sm font-bold">صاحب محطة؟</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          سجّل محطتك مجاناً، فيصل خبر توفّر الوقود عندك إلى أهل مدينتك لحظة تعلنه — وتظهر
          محطتك على الخريطة بصفحة خاصة بها.
        </p>
        <a href="/register" className="btn-primary mt-4 w-full">
          <PlusIcon className="h-4 w-4" />
          سجّل محطتك مجاناً
        </a>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          وإن كنت تعرف صاحب محطة، أخبره — كل محطة تنضمّ تجعل المعلومة أقرب للجميع.
        </p>
      </section>

      <a href="/" className="mt-4 block min-h-[44px] pt-3 text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}

function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'أمس' : `قبل ${days} أيام`;
}
