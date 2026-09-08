'use client';

import { useEffect, useState } from 'react';
import { ScheduleBoard } from '@/components/ScheduleBoard';
import { SpinnerIcon, FuelIcon } from '@/components/icons';
import { readFailure, withDeadline } from '@/lib/fn';
import { readChoice } from '@/lib/alerts';
import {
  baghdadDate,
  boardDate,
  buildBoard,
  groupBoard,
  loadExpected,
  loadSchedule,
  type BoardGroup,
} from '@/lib/scheduleData';

/** صفحةُ جدول الوقود.
 *
 *  صفحةٌ لا مرشِّح: الجدولُ كائنٌ آخر لا حالةٌ أخرى للقائمة — له يومٌ ووقودٌ
 *  ومحطاتٌ قد لا تكون على المنصّة أصلاً. ولو حُشر في الرئيسة لَنازع سؤالَها.
 *
 *  ── ومصدران لا مصدر ─────────────────────────────────────────────────────
 *
 *  ما يُنشر من تلغرام، وما تعلنه محطاتُ المنصّة في لوحاتها. والثاني كان
 *  مكتوباً في القاعدة منذ زمنٍ ولا يقرؤه هذا الجدول. */
export default function SchedulePage() {
  const [groups, setGroups] = useState<BoardGroup[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const day = boardDate();

  useEffect(() => {
    void (async () => {
      try {
        // نداءان متوازيان خفيفان: الجدولُ المنشور، ثمّ صفوفُ الوعد لهذا
        // اليوم وحدَها — لا المحطاتُ كلُّها.
        //
        // وبمهلةٍ حولهما: بلا هذه المهلة بقيت الصفحةُ على مغزلٍ لا ينتهي في
        // جهازٍ بعينه — صورةُ شاشةٍ من صاحب المنصّة الساعةَ ١٣:١٥ — بينما
        // الخادمُ يجيب في نصف ثانيةٍ من جهازٍ آخر في اللحظة نفسِها. ومهلةُ
        // العميل في `lib/supabase.ts` لا تبلغ ما يعلَق قبل الشبكة.
        const [schedule, stations] = await withDeadline(
          Promise.all([loadSchedule(), loadExpected(day)]),
          15000
        );
        setGroups(groupBoard(buildBoard(schedule, stations, day), readChoice()?.cities ?? []));
      } catch (e) {
        // والفشلُ ليس فراغاً: «لا جدولَ بعد» و«تعذّر الجلب» خبران مختلفان،
        // وخلطُهما يجعل انقطاعَ الشبكة يبدو خبراً عن الوقود.
        setFailed(readFailure(e));
      }
    })();
  }, [day]);

  const title = day === baghdadDate() ? 'محطات اليوم' : 'محطات غداً';

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <a href="/" className="mb-5 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      {/* العنوانُ يتبع الساعة: بعد التاسعة مساءً «غداً»، وما دونها «اليوم».
          فمن يفتحها ظهراً لا يقرأ عنواناً عن يومٍ لم يأتِ والوقودُ يصل الآن. */}
      <h1 className="text-center text-xl font-extrabold">{title}</h1>
      <p className="mt-1 text-center text-[12px] leading-relaxed text-slate-500">
        أين يصل الوقود — قبل أن يصل
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

        {groups && <ScheduleBoard groups={groups} day={day} />}
      </div>

      <a href="/" className="btn-ghost mt-6 w-full text-center">
        العودة إلى المحطات
      </a>
    </main>
  );
}
