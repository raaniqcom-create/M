'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { PERIOD_LABELS } from '@/lib/hours';
import { plural } from '@/lib/freshness';
import { readChoice } from '@/lib/alerts';
import { withDeadline } from '@/lib/fn';
import { isDown, readStatus } from '@/lib/status';
import {
  baghdadDate,
  boardDate,
  applyOverrides,
  buildBoard,
  groupBoard,
  loadBoardStations,
  loadOverrides,
  loadSchedule,
  type BoardGroup,
} from '@/lib/scheduleData';

const SEEN = 'tomorrow-seen';

/** أوّلُ ما يُفتح: أين يصل الوقودُ — قبل أن يصل.
 *
 *  ── ولماذا شاشةٌ كاملةٌ لا شريط ───────────────────────────────────────────
 *
 *  هذا هو الخبرُ الوحيد في المنصّة الذي يُقال **قبل** وقوعه، وعليه يُبنى قرارُ
 *  الغد: أين يذهب المواطنُ صباحاً، وهل يخرج أصلاً. وشريطٌ في أعلى صفحةٍ يُمرَّر
 *  عليه؛ وهذا يُقرأ مرّةً ويُغلق.
 *
 *  ── واليومُ الذي تعرضه ───────────────────────────────────────────────────
 *
 *  `boardDate()` — بعد التاسعة مساءً الغد، وما دونها اليوم. وهي القاعدةُ
 *  نفسُها في `/schedule`، فلا يقرأ سطحان يومين.
 *
 *  ولها بوّابةٌ واحدة: **جدولُ الغد** لا يُعرض قبل الثامنة مساءً كي لا يفاجئ
 *  نشرٌ نهاريٌّ أحداً في وسط يومه. و**جدولُ اليوم يُعرض في أيّ ساعة** — فخبرُ
 *  اليوم لا ينفع بعد انقضائه.
 *
 *  ── ولا عدّادَ ينصرف به ──────────────────────────────────────────────────
 *
 *  كان فيها عدّادُ خمسِ ثوانٍ يُغلقها وحدَه. وقرارُ صاحب المنصّة رفعُه:
 *  الإنذارُ يُقرأ في ثانية، وهذا **جدولٌ يُقرأ بالإصبع** — وقارئٌ يبحث عن اسم
 *  منطقته لا يُنتزع منه بعدّاد. فتبقى حتى يُغلقها هو.
 *
 *  ── ومرّةً في كلّ فتحةِ تطبيق ────────────────────────────────────────────
 *
 *  `sessionStorage` بمفتاحٍ يحمل اليومَ ومناطقَه: فمن أغلق التطبيقَ وفتحه رآها،
 *  ومن تنقّل بين صفحتين لم يُحبَس مرّتين، وجدولٌ جديدٌ يُعرض ولو في الجلسة
 *  نفسِها.
 *
 *  ── والواقعُ يسبق الخبرَ عنه ─────────────────────────────────────────────
 *
 *  إن كانت المنصّةُ في صيانةٍ فلا تُعرض، وشاشةُ الصيانة `z-[90]` فوقها. */
const HOUR_FLOOR = 20;

/** منطقتان على الأكثر في الشاشة. والثالثةُ فما فوق في «الجدول كاملاً» —
 *  شاشةٌ تُملأ بستّ مناطق ليست خبراً بل حاجز. */
const MAX_GROUPS = 2;

const MARK = { arrived: '✓', expected: '', out: 'نفد' } as const;

export function TomorrowScreen() {
  const [groups, setGroups] = useState<BoardGroup[] | null>(null);
  const [day, setDay] = useState('');
  const [more, setMore] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (new URLSearchParams(window.location.search).get('live') === '1') return;

        const status = await readStatus();
        if (!alive || isDown(status)) return;

        const target = boardDate();
        const hour = Number(
          new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Baghdad',
            hour: '2-digit',
            hour12: false,
          })
        );
        // جدولُ الغد ينتظر المساء؛ وجدولُ اليوم لا ينتظر شيئاً.
        if (target !== baghdadDate() && hour < HOUR_FLOOR) return;

        // ── والحارسُ قبل الجلب لا بعده ────────────────────────────────────
        //
        // كان مفتاحُ «رُئيت» يحمل اليومَ **ومناطقَه**، ومناطقُها لا تُعرف إلا
        // بعد الجلب — فكان الحارسُ تحت النداء لا فوقه. وهذه الشاشةُ مركَّبةٌ
        // في `app/layout.tsx`، أي في كلّ فتحةِ صفحةٍ من كلّ مسار: فمن تصفّح
        // أربعَ صفحاتٍ جلب الجدولَ أربعَ مرّات، ورُمي ثلاثاً.
        //
        // فصار المفتاحُ اليومَ وحدَه، ويُقرأ قبل أن يُفتح اتصال. والثمنُ
        // مذكورٌ صراحةً: جدولٌ **جديد** يُنشر في أثناء الجلسة لا يفتح الشاشةَ
        // ثانيةً لمن رآها. وهو ثمنٌ مقبول — الإشعارُ يبلغه، والجدولُ في
        // `/schedule` كاملاً، مقابل استعلامين في كلّ صفحةٍ يفتحها كلُّ إنسان.
        try {
          if (sessionStorage.getItem(SEEN) === target) return;
        } catch {
          /* تصفّحٌ خاصّ — تُعرض في كلّ فتحة، وهو أهونُ من ألّا تُعرض */
        }

        // بمهلةٍ كمهلة الصفحة: هذه الشاشةُ تبتلع فشلَها بصمت، فنداءٌ عالقٌ
        // يترك `waitUntil` قائماً إلى أن تُغلق الصفحة — وهو تسريبٌ صامت.
        const schedule = await withDeadline(loadSchedule(), 15000);
        const stations = await withDeadline(loadBoardStations(target, schedule), 15000);
        if (!alive) return;

        const choice = readChoice();
        const myCities = new Set(choice?.cities ?? []);
        const myProducts = new Set<string>(choice?.products ?? []);

        let rows = applyOverrides(buildBoard(schedule, stations, target), await loadOverrides(), target);
        // ── والشاشةُ تتبع الإشعارَ حرفيّاً ──────────────────────────────
        //
        // إشعارُ النشر يمرّ بـ`alerts_for` فلا يصل إلا من اختار تلك المنطقة
        // وذلك الوقود. فلو ظهرت الشاشةُ للجميع لَناقضت الإشعارَ على الجهاز
        // نفسِه: مَن في القائم لا يُشعَر بجدول الرمادي ثمّ يُحبَس خلفه.
        //
        // ومن لم يختر شيئاً يرى كلَّ شيء: لم يقل لنا ما يعنيه.
        if (myProducts.size) rows = rows.filter((r) => myProducts.has(r.product));
        if (myCities.size) rows = rows.filter((r) => r.city && myCities.has(r.city));
        if (!rows.length) return;

        const mine = groupBoard(rows, choice?.cities ?? []);
        try {
          sessionStorage.setItem(SEEN, target);
        } catch {
          /* تصفّحٌ خاصّ — لا يُكتب شيء، فتُعرض في الفتحة التالية أيضاً */
        }

        setGroups(mine.slice(0, MAX_GROUPS));
        setMore(mine.slice(MAX_GROUPS).reduce((n, g) => n + g.rows.length, 0));
        setDay(target);
        setOpen(true);
      } catch {
        /* الشاشةُ ترفٌ: فشلُ جلبها لا يُظهر خطأً لأحد */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!groups || !open) return null;

  const when = day === baghdadDate() ? 'اليوم' : 'غداً';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`محطات ${when}`}
      className="fixed inset-0 z-[84] overflow-y-auto bg-gradient-to-b from-brand via-brand-600 to-brand-700 text-center text-white"
    >
      {/* **التوسيطُ داخل الحاوية لا عليها.**
       *
       *  كانت `justify-center` و`overflow-y-auto` على العنصر نفسِه، وهي عقدةٌ
       *  معروفة: حين يفيض المحتوى يخرج نصفُ الفائض فوق حافّة التمرير — فلا
       *  يُبلَغ بسحبٍ ولا بغيره. أي أنّ جدولاً طويلاً، أو خطَّ نظامٍ مكبَّراً، أو
       *  هاتفاً قصيراً، كان يبتلع الشعارَ وسطرَ العنوان. */}
      <div className="flex min-h-full flex-col items-center justify-center px-5 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={56}
          height={56}
          className="rounded-[14px] shadow-[0_10px_26px_rgba(0,0,0,.32)] ring-1 ring-white/15"
          style={{ height: 56, width: 56 }}
        />

        <h1 className="mt-3 text-[17px] font-extrabold">محطات {when}</h1>
        <p className="mt-0.5 text-[11.5px] text-white/70">أين يصل الوقود — قبل أن يصل</p>

        <div className="mt-5 w-full max-w-[21rem] space-y-3">
          {groups.map((g) => (
            <section key={g.city ?? '؟'} className="rounded-2xl bg-white/12 p-3 text-right">
              <h2 className="text-[12.5px] font-extrabold">
                {g.city ?? 'منطقةٌ لم تُذكر'}
                <span className="mr-1.5 text-[10.5px] font-bold text-white/60">
                  {plural(g.rows.length, 'محطة واحدة', 'محطتان', 'محطات', 'محطة')}
                </span>
              </h2>

              <table className="mt-1.5 w-full text-right">
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.key} className="border-t border-white/10 align-top">
                      {/* الاسمُ كاملاً ولو نزل سطرين — لا قصَّ بثلاث نقاط. */}
                      <td
                        className={`py-1.5 pl-2 text-[12px] font-bold leading-snug ${
                          r.state === 'out' ? 'text-white/45 line-through' : ''
                        }`}
                      >
                        {r.name}
                        {r.source === 'station' && (
                          <span className="mr-1 inline-block rounded-full bg-white/20 px-1.5 align-middle text-[9px] font-bold">
                            المنصّة {MARK[r.state]}
                          </span>
                        )}
                        {r.period && r.state === 'expected' && (
                          <span className="mr-1.5 text-[10px] text-white/60">
                            {' '}
                            · {PERIOD_LABELS[r.period]}
                          </span>
                        )}
                      </td>
                      <td className="w-[4.6rem] py-1.5 text-left text-[10.5px] font-bold text-white/75">
                        {PRODUCT_LABELS[r.product]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {more > 0 && (
            <p className="text-[11px] text-white/70">
              و{plural(more, 'محطة أخرى', 'محطتان أخريان', 'محطات أخرى', 'محطة أخرى')} في مناطق
              أخرى — في الجدول كاملاً.
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <a
            href="/schedule"
            className="rounded-full bg-white px-5 py-2.5 text-[12.5px] font-extrabold text-brand-900"
          >
            الجدول كاملاً
          </a>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/15 px-5 py-2.5 text-[12.5px] font-bold text-white"
          >
            إغلاق
          </button>
        </div>

        {/* التحفّظُ نفسُه الذي في الصفحة، حرفيّاً. وكانت الشاشةُ — وهي أوسعُ
            وصولاً وتبلغ من لم يقصدها — السطحَ الوحيد الذي يقول الخبرَ بلا
            تحفّظه. وجملتان مختلفتان عن الشيء نفسِه أسوأُ من جملةٍ واحدة. */}
        <p className="mt-4 max-w-[19rem] text-[10.5px] leading-relaxed text-white/60">
          جدولٌ مُعلَنٌ مسبقاً وقد يتغيّر.
        </p>
      </div>
    </div>
  );
}
