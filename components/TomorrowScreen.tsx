'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { plural } from '@/lib/freshness';
import { readChoice } from '@/lib/alerts';
import { isDown, readStatus } from '@/lib/status';
import {
  baghdadDate,
  groupSchedule,
  loadSchedule,
  type ScheduleGroup,
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
 *  ── ومتى ────────────────────────────────────────────────────────────────
 *
 *  يومان لا يومٌ واحد، ولكلٍّ بوّابتُه:
 *
 *  **جدولُ الغد** يُعرض بعد الثامنة مساءً. وقِيس أنّ القناةَ تنشر نحوَ الحاديةَ
 *  عشرةَ والنصف ليلاً بتوقيت بغداد — لا الثامنة والنصف كما ظُنَّ أوّلاً: طوابعُ
 *  صفحة القناة بتوقيت UTC، فقُرئت كأنّها بغداديّة وأخطأت بثلاث ساعات. فالبوّابةُ
 *  لا تؤخّر شيئاً، وتمنع نشراً نهاريّاً أن يفاجئ أحداً في وسط يومه.
 *
 *  **وجدولُ اليوم يُعرض في أيّ ساعة** — بلا بوّابة. لأنّ منشورَ الليلة يُحوَّل
 *  أحياناً بعد منتصف الليل، فيصير «غدُه» يومَنا هذا؛ وبوّابةُ المساء كانت
 *  ستُخفي خبرَ اليوم عن نهاره كلِّه ثمّ تعرضه حين لا ينفع.
 *
 *  ── ولا عدّادَ ينصرف به ──────────────────────────────────────────────────
 *
 *  كان فيها عدّادُ خمسِ ثوانٍ يُغلقها وحدَه، كما في `SiteNotice`. وقرارُ صاحب
 *  المنصّة رفعُه: الإنذارُ يُقرأ في ثانية، وهذا **جدولٌ يُقرأ بالإصبع** —
 *  وقارئٌ يبحث عن اسم ناحيته لا يُنتزع منه بعدّاد. فتبقى حتى يُغلقها هو.
 *
 *  ── ومرّةً في كلّ فتحةِ تطبيق ────────────────────────────────────────────
 *
 *  `sessionStorage` بمفتاحٍ يحمل تاريخَ الجدول ونواحيَه: فمن أغلق التطبيقَ
 *  وفتحه رآها، ومن تنقّل بين صفحتين لم يُحبَس مرّتين، وجدولٌ جديدٌ يُعرض ولو
 *  في الجلسة نفسِها. النمطُ نفسُه في `SiteNotice`.
 *
 *  ── والواقعُ يسبق الخبرَ عنه ─────────────────────────────────────────────
 *
 *  إن كانت المنصّةُ في صيانةٍ فلا تُعرض: شاشتان معاً عبثٌ، والصيانةُ أولى.
 *  وشاشةُ الصيانة `z-[90]` فوقها على كلّ حال، فلو أُعلنت الصيانةُ والجدولُ
 *  مفتوحٌ غطّته. */
const HOUR_FLOOR = 20;

/** منطقتان على الأكثر في الشاشة. والثالثةُ فما فوق في «الجدول كاملاً» —
 *  شاشةٌ تُملأ بستّ مناطق ليست خبراً بل حاجز. */
const MAX_GROUPS = 2;

export function TomorrowScreen() {
  const [groups, setGroups] = useState<ScheduleGroup[] | null>(null);
  const [more, setMore] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (new URLSearchParams(window.location.search).get('live') === '1') return;

        const status = await readStatus();
        if (!alive || isDown(status)) return;

        const rows = await loadSchedule();
        if (!alive || !rows.length) return;

        const choice = readChoice();
        const myCities = new Set(choice?.cities ?? []);
        const myProducts = new Set<string>(choice?.products ?? []);

        const hour = Number(
          new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Baghdad',
            hour: '2-digit',
            hour12: false,
          })
        );

        const today = baghdadDate();
        // اليومُ أولى بالعرض من الغد: خبرٌ يقع بعد ساعاتٍ أقربُ من خبرٍ يقع غداً.
        const day = rows.some((r) => r.for_date === today)
          ? today
          : hour >= HOUR_FLOOR
            ? baghdadDate(1)
            : null;
        if (!day) return;

        let mine = groupSchedule(
          rows.filter((r) => r.for_date === day),
          choice?.cities ?? []
        );

        // ── والشاشةُ تتبع الإشعارَ حرفيّاً ──────────────────────────────
        //
        // إشعارُ النشر يمرّ بـ`alerts_for` فلا يصل إلا من اختار تلك الناحية
        // وذلك الوقود — قِيس: جدولُ الرمادي بلغ ٤٬٩٥٨ شخصاً، منهم ٤٬٩٣٥
        // اختاروا الرمادي و٢٣ اختاروا «كلَّ المدن»، ولا واحدَ ممّن اختار
        // غيرَها. فلو ظهرت الشاشةُ للجميع لَناقضت الإشعارَ على الجهاز نفسِه.
        //
        // ومن لم يختر شيئاً يرى كلَّ شيء: لم يقل لنا ما يعنيه، وحجبُ الكلّ عنه
        // يتركه بلا خبر. والناحيةُ المجهولةُ تُحجب عمّن اختار نواحيَه — لا
        // تُنسب إليه بلا سند — وتبقى في «الجدول كاملاً».
        if (myProducts.size) {
          mine = mine
            .map((g) => {
              const kept = g.rows.filter((r) => myProducts.has(r.product));
              return { ...g, rows: kept, products: [...new Set(kept.map((r) => r.product))] };
            })
            .filter((g) => g.rows.length > 0);
        }
        if (myCities.size) {
          mine = mine.filter((g) => g.city && myCities.has(g.city));
        }
        if (!alive || !mine.length) return;

        const key = `${day}|${mine.map((g) => g.city ?? '؟').join(',')}`;
        try {
          if (sessionStorage.getItem(SEEN) === key) return;
          sessionStorage.setItem(SEEN, key);
        } catch {
          /* تصفّحٌ خاصّ — تُعرض في كلّ فتحة، وهو أهونُ من ألّا تُعرض */
        }

        setGroups(mine.slice(0, MAX_GROUPS));
        setMore(mine.slice(MAX_GROUPS).reduce((n, g) => n + g.rows.length, 0));
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

  const when = groups[0].for_date === baghdadDate() ? 'اليوم' : 'غداً';

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
       *  هاتفاً قصيراً، كان يبتلع الشعارَ وسطرَ العنوان، فيبدأ القارئُ من وسط
       *  أسماءٍ بلا عنوانٍ يقول ما هي. */}
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
            <section
              key={`${g.for_date}|${g.city ?? '؟'}`}
              className="rounded-2xl bg-white/12 p-3 text-right"
            >
              <h2 className="text-[12.5px] font-extrabold">
                {g.city ?? 'منطقةٌ لم تُذكر'}
                <span className="mr-1.5 text-[10.5px] font-bold text-white/60">
                  {plural(g.rows.length, 'محطة واحدة', 'محطتان', 'محطات', 'محطة')}
                </span>
              </h2>

              <table className="mt-1.5 w-full text-right">
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-t border-white/10 align-top">
                      {/* الاسمُ كاملاً ولو نزل سطرين — لا قصَّ بثلاث نقاط.
                          «محطة تعبئة وقود الرمادي الجديد…» ليست اسمَ محطة،
                          ومن لا يعرف أيَّ محطةٍ قُصدت لا ينتفع بالجدول. */}
                      <td className="py-1.5 pl-2 text-[12px] font-bold leading-snug">
                        {r.station_name}
                        {r.linked_station_id && (
                          <span className="mr-1 inline-block rounded-full bg-white/20 px-1.5 align-middle text-[9px] font-bold">
                            معتمدة
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
