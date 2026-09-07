'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { readChoice } from '@/lib/alerts';
import { isDown, readStatus } from '@/lib/status';
import {
  baghdadDate,
  groupSchedule,
  loadSchedule,
  type ScheduleGroup,
} from '@/lib/scheduleData';

const SEEN = 'tomorrow-seen';

/** أوّلُ ما يُفتح مساءً: أين يصل الوقودُ غداً.
 *
 *  ── ولماذا شاشةٌ كاملةٌ لا شريط ───────────────────────────────────────────
 *
 *  هذا هو الخبرُ الوحيد في المنصّة الذي يُقال **قبل** وقوعه، وعليه يُبنى قرارُ
 *  الغد: أين يذهب الرجلُ صباحاً، وهل يخرج أصلاً. وشريطٌ في أعلى صفحةٍ يُمرَّر
 *  عليه؛ وهذا يُقرأ مرّةً ويُغلق.
 *
 *  ── ومتى ────────────────────────────────────────────────────────────────
 *
 *  الشرطُ وجودُ جدولٍ للغد، لا ساعةٌ بعينها. قِيس أنّ الجدولَ يُنشر نحوَ
 *  الثامنة والنصف مساءً، و«جدولُ الغد» لا يوجد قبل ذلك أصلاً — فبوّابةُ ساعةٍ
 *  ثابتة تؤخّر الخبرَ بلا أن تمنع شيئاً. ويبقى حدٌّ أدنى عند الثامنة كي لا
 *  يفاجئ نشرٌ نهاريٌّ أحداً في وسط يومه.
 *
 *  ── ولا عدّادَ ينصرف به ──────────────────────────────────────────────────
 *
 *  كان فيها عدّادُ خمسِ ثوانٍ يُغلقها وحدَه، كما في `SiteNotice`. وقرارُ صاحب
 *  المنصّة رفعُه: الإنذارُ يُقرأ في ثانية، وهذا **قائمةُ محطاتٍ تُقرأ بالإصبع**
 *  — وقارئٌ يبحث عن اسم ناحيته في سبعة أسطرٍ لا يُنتزع منها بعدّاد. فتبقى
 *  حتى يُغلقها هو، أو ينتقل إلى الجدول كاملاً.
 *
 *  ── ومرّةً في كلّ فتحةِ تطبيق ────────────────────────────────────────────
 *
 *  `sessionStorage` بمفتاحٍ يحمل تاريخَ الجدول: فمن أغلق التطبيقَ وفتحه رآها،
 *  ومن تنقّل بين صفحتين لم يُحبَس مرّتين، وجدولٌ جديدٌ يُعرض ولو في الجلسة
 *  نفسِها. النمطُ نفسُه في `SiteNotice`.
 *
 *  ── والواقعُ يسبق الخبرَ عنه ─────────────────────────────────────────────
 *
 *  إن كانت المنصّةُ في صيانةٍ فلا تُعرض: شاشتان معاً عبثٌ، والصيانةُ أولى. */
const HOUR_FLOOR = 20;

export function TomorrowScreen() {
  const [group, setGroup] = useState<ScheduleGroup | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (new URLSearchParams(window.location.search).get('live') === '1') return;

        const hour = Number(
          new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Baghdad',
            hour: '2-digit',
            hour12: false,
          })
        );
        if (hour < HOUR_FLOOR) return;

        const status = await readStatus();
        if (!alive || isDown(status)) return;

        const tomorrow = baghdadDate(1);
        const all = groupSchedule(await loadSchedule()).filter((g) => g.for_date === tomorrow);
        if (!alive || !all.length) return;

        // ── وبمدنِ صاحب الجهاز، لا بكلّ ما نُشر ─────────────────────────
        //
        // **الشاشةُ تتبع الإشعارَ حرفيّاً.** إشعارُ النشر يمرّ بـ`alerts_for`
        // فلا يصل إلا من اختار تلك المدينة وذلك الوقود — قِيس: جدولُ الرمادي
        // بلغ ٤٬٩٥٨ شخصاً، منهم ٤٬٩٣٥ اختاروا الرمادي و٢٣ اختاروا «كلَّ المدن»،
        // ولا واحدَ ممّن اختار غيرَها. فلو ظهرت الشاشةُ للجميع لَناقضت الإشعارَ
        // على الجهاز نفسِه: مَن في القائم لا يُشعَر بجدول الرمادي ثمّ يُحبَس
        // خلفه ملءَ الشاشة.
        //
        // ومن لم يختر شيئاً يرى كلَّ شيء: لم يقل لنا ما يعنيه، وحجبُ الكلّ عنه
        // يتركه بلا خبر. والصفوفُ مجهولةُ المدينة تُحجب عمّن اختار مدنَه — لا
        // تُنسب إليه بلا سند — وتبقى في «الجدول كاملاً».
        const choice = readChoice();
        const myCities = new Set(choice?.cities ?? []);
        const myProducts = new Set<string>(choice?.products ?? []);

        let mine = myProducts.size ? all.filter((g) => myProducts.has(g.product)) : all;
        if (myCities.size) {
          mine = mine
            .map((g) => {
              const rows = g.rows.filter((r) => r.city && myCities.has(r.city));
              return {
                ...g,
                rows,
                cities: [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])],
              };
            })
            .filter((g) => g.rows.length > 0);
        }
        if (!mine.length) return;

        // أكبرُ جدولٍ لغدٍ يُعرض. وواحدٌ لا كلُّها: خمسُ شاشاتٍ متتاليةٍ ليست
        // خبراً بل حاجز، والبقيّةُ على بُعد لمسةٍ في «محطات غداً».
        const g = [...mine].sort((a, b) => b.rows.length - a.rows.length)[0];

        const key = `${tomorrow}|${g.product}`;
        try {
          if (sessionStorage.getItem(SEEN) === key) return;
          sessionStorage.setItem(SEEN, key);
        } catch {
          /* تصفّحٌ خاصّ — تُعرض في كلّ فتحة، وهو أهونُ من ألّا تُعرض */
        }

        setGroup(g);
        setOpen(true);
      } catch {
        /* الشاشةُ ترفٌ: فشلُ جلبها لا يُظهر خطأً لأحد */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!group || !open) return null;

  // مدنُ المستخدم أوّلاً — قراءةٌ من الجهاز بلا شبكة، فتعمل ولو تعطّل كلُّ شيء.
  const mine = new Set(readChoice()?.cities ?? []);
  const rows = [...group.rows].sort(
    (a, b) =>
      Number(mine.has(b.city ?? '')) - Number(mine.has(a.city ?? '')) ||
      (a.city ?? 'ي').localeCompare(b.city ?? 'ي', 'ar')
  );
  const shown = rows.slice(0, 7);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="محطات غداً"
      className="fixed inset-0 z-[84] flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-brand via-brand-600 to-brand-700 px-6 py-8 text-center text-white"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={64}
        height={64}
        className="rounded-[16px] shadow-[0_10px_26px_rgba(0,0,0,.32)] ring-1 ring-white/15"
        style={{ height: 64, width: 64 }}
      />

      <h1 className="mt-4 text-[17px] font-extrabold">
        غداً — {PRODUCT_LABELS[group.product]}
      </h1>
      <p className="mt-1 text-[12px] text-white/75">
        في {group.rows.length} محطة
        {group.cities.length ? ` · ${group.cities.slice(0, 3).join(' · ')}` : ''}
      </p>

      <ul className="mt-5 w-full max-w-[19rem] space-y-1.5 text-right">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-white/12 px-3 py-2"
          >
            <span className="min-w-0 truncate text-[12.5px] font-bold">{r.station_name}</span>
            <span className="shrink-0 text-[10.5px] text-white/70">{r.city ?? ''}</span>
          </li>
        ))}
        {rows.length > shown.length && (
          <li className="pt-1 text-[11px] text-white/70">
            و{rows.length - shown.length} محطةً أخرى
          </li>
        )}
      </ul>

      <div className="mt-6 flex items-center gap-3">
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
    </div>
  );
}
