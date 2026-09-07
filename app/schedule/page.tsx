'use client';

import { useEffect, useState } from 'react';
import { ScheduleBoard } from '@/components/ScheduleBoard';
import { SpinnerIcon, FuelIcon } from '@/components/icons';
import { readFailure } from '@/lib/fn';
import { readChoice } from '@/lib/alerts';
import {
  baghdadDate,
  groupSchedule,
  loadSchedule,
  type ScheduleGroup,
} from '@/lib/scheduleData';

/** صفحةُ «محطات غداً».
 *
 *  صفحةٌ لا مرشِّح: الجدولُ كائنٌ آخر لا حالةٌ أخرى للقائمة — له يومٌ ووقودٌ
 *  ومحطاتٌ قد لا تكون على المنصّة أصلاً. ولو حُشر في الرئيسة لَنازع سؤالَها. */
export default function SchedulePage() {
  const [groups, setGroups] = useState<ScheduleGroup[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // نواحي القارئ ترتفع ولا يُحجب غيرُها: من فتح هذه الصفحة فتحها بنفسه،
        // فيرى الأنبارَ كلَّها — لكنّ ناحيتَه أوّلاً. والحجبُ قرارُ الشاشة
        // المسائيّة لا قرارُ الصفحة.
        setGroups(groupSchedule(await loadSchedule(), readChoice()?.cities ?? []));
      } catch (e) {
        // والفشلُ ليس فراغاً: «لا جدولَ لغد» و«تعذّر الجلب» خبران مختلفان،
        // وخلطُهما يجعل انقطاعَ الشبكة يبدو خبراً عن الوقود.
        setFailed(readFailure(e));
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <a href="/" className="mb-5 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="text-center text-xl font-extrabold">محطات غداً</h1>
      {/* العنوانُ اسمُ الصفحة فلا يتبدّل، والسطرُ تحته يصف ما فيها فعلاً:
          منشورُ الليلة يُحوَّل أحياناً بعد منتصف الليل فيصير جدولَ اليوم،
          وصفحةٌ تقول «غداً» وفيها جدولُ اليوم تكذب على قارئها. */}
      <p className="mt-1 text-center text-[12px] leading-relaxed text-slate-500">
        أين يصل الوقود {groups?.some((g) => g.for_date === baghdadDate()) ? 'اليوم وغداً' : 'غداً'} —
        قبل أن يصل
      </p>

      <div className="mt-5">
        {failed && (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-600">{failed}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-ghost mt-4 px-6"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {!failed && groups === null && (
          <div className="flex justify-center py-10">
            <SpinnerIcon className="h-6 w-6 text-brand" />
          </div>
        )}

        {groups && <ScheduleBoard groups={groups} />}
      </div>

      <a href="/" className="btn-ghost mt-6 w-full text-center">
        العودة إلى المحطات
      </a>
    </main>
  );
}
