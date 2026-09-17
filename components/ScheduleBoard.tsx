'use client';

import { PlateTurnBadge } from './PlateTurnBadge';
import { ScheduleNotice } from './ScheduleNotice';
import { PRODUCT_LABELS } from '@/lib/products';
import { whenLabel } from '@/lib/hours';
import { plural } from '@/lib/freshness';
import { baghdadDate, byProduct, type BoardGroup, type BoardRow } from '@/lib/scheduleData';
import { placeHref, shortAddress } from '@/lib/scheduleRoute';

/** جدولُ الوقود — الخبرُ الوحيد الذي يُقال قبل وقوعه.
 *
 *  وكلُّ ما عداه في هذه المنصّة يصف الحاضر: أين الوقودُ الآن. وهذا يصف ما
 *  سيصل، فيُكتب بلفظٍ آخر ويُحاط بتحفّظٍ آخر.
 *
 *  ── جدولٌ لكلّ منطقة، ولو بمحطةٍ واحدة ───────────────────────────────────
 *
 *  قرارُ صاحب المنصّة: من يسكن الرمادي يقرأ جدولَ الرمادي كاملاً — بمنتجاته
 *  كلِّها — ثمّ يجد جدولَ الخالدية تحته مستقلّاً. والمنتجُ عمودٌ لا عنوان.
 *
 *  ── ومحطاتُ المنصّة أوّلاً، وحالتُها حيّة ────────────────────────────────
 *
 *  محطةٌ في المنصّة لها صفحةٌ وصاحبٌ يُحدّثها: وعدُها يصير «وصل ✓» بضغطةٍ منه،
 *  وإن نفد بقي السطرُ مكتوباً عليه «نفد» ولم يُمحَ — فمن قرأ الجدولَ صباحاً
 *  يعرف لماذا اختفت، ولا يظنّ المنصّةَ كذبت. وغيرُها اسمٌ وردنا في الجدول
 *  المنشور، لا نملك عنه إلا ما وصل. */

function dayLabel(iso: string): string {
  if (iso === baghdadDate()) return 'اليوم';
  if (iso === baghdadDate(1)) return 'غداً';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const STATE = {
  arrived: { text: 'وصل ✓', cls: 'bg-brand-50 text-brand-700' },
  expected: { text: 'متوقّع', cls: 'bg-amber-50 text-amber-700' },
  out: { text: 'نفد', cls: 'bg-slate-100 text-slate-500' },
} as const;

/** صفٌّ: الاسمُ (العنوانُ المختصر) | المنصّة والحالة | «العنوان الكامل».
 *
 *  اقتراحُ صاحب المنصّة (١٦ أيلول): «محطة التل الاخضر (الجزيرة - البوذياب) |
 *  المنصة | العنوان الكامل» — والضغطُ يفتح صفحةً داخل المنصّة فيها الاسمُ
 *  والعنوانُ والهاتفُ والطريقُ ومنتجاتُ اليوم. لا زرَّ طريقٍ في الصفّ: كان
 *  يبدو عشوائيّاً بجانب العنوان. */
function Row({ r }: { r: BoardRow }) {
  const s = STATE[r.state];
  const dim = r.state === 'out';
  const address = shortAddress(r);

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2.5 pl-2 text-[12.5px] leading-snug">
        <a
          href={placeHref(r)}
          className={`font-bold underline-offset-2 hover:underline ${
            dim ? 'text-slate-400 line-through' : 'text-brand-900'
          }`}
        >
          {r.name}
        </a>
        {address && (
          <span className={`block text-[11px] leading-snug ${dim ? 'text-slate-300' : 'text-slate-500'}`}>({address})</span>
        )}
        {r.state === 'expected' && whenLabel(r.period, r.time) && (
          <span className="mr-1.5 text-[10.5px] text-amber-700">
            {' '}
            · {whenLabel(r.period, r.time)}
          </span>
        )}
      </td>
      <td className="py-2.5 pl-1.5 text-left">
        {r.source === 'station' && (
          <span className="mb-0.5 inline-block rounded-full bg-brand-50 px-1.5 py-px text-[9.5px] font-extrabold text-brand-700">المنصّة</span>
        )}
        <span className={`block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.text}</span>
      </td>
      <td className="py-2.5 text-left">
        <a
          href={placeHref(r)}
          className="inline-flex min-h-[32px] items-center whitespace-nowrap rounded-lg border border-brand-100 px-1.5 text-[10px] font-extrabold text-brand-700 active:bg-brand-50"
        >
          العنوان الكامل
        </a>
      </td>
    </tr>
  );
}

export function ScheduleBoard({
  groups,
  day,
  off,
}: {
  groups: BoardGroup[];
  day: string;
  /** أُوقف جدولُ هذا اليوم بعد نشره — لا «لم يُنشر بعد».
   *
   *  **مطلوبةٌ لا اختياريّة.** ثلاثةُ مواضعَ تركّب هذه اللوحة، ونسيانُها في
   *  أحدها يجعل شاشتين تقولان عن الصفّ نفسِه شيئين متناقضين في الدقيقة
   *  نفسِها — وهو ما وقع في `app/branch/page.tsx`. والمترجمُ أرخصُ حارس. */
  off: boolean;
}) {
  if (!groups.length) {
    // **والخبران لا يُخلطان.** «لم يصل بعد» و«وصل ثمّ سُحب» جوابان مختلفان
    // لمن فتح الصفحةَ يبحث عن جدولٍ قرأه صباحاً — وخلطُهما يجعل السحبَ يبدو
    // عطلاً في التطبيق. وهو مبدأُ «نفد» نفسُه في `lib/board.ts`.
    if (off) {
      return (
        <div className="space-y-4">
          <ScheduleNotice />
          <div className="card p-8 text-center">
            <p className="text-sm font-bold text-slate-700">أُوقف جدولُ {dayLabel(day)} مؤقّتاً.</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
              سُحب بعد نشره — قد يكون التوزيع تغيّر أو وردت الأسماء خطأً. وصفحةُ كلِّ محطةٍ
              تعرض ما تقوله هي عن نفسها.
            </p>
            <a href="/" className="btn-ghost mt-4 inline-flex px-6">
              المحطات الآن
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {/* والاعتذارُ فوق «لا جدولَ بعد»: الجملةُ الثابتةُ تصف العادة، وهذه تصف
            هذه الليلةَ بعينها — ومن فتح الصفحةَ يسأل عن الليلة. */}
        <ScheduleNotice />
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-600">لا جدولَ {dayLabel(day)} بعد.</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
            يصل الجدولُ عادةً بعد التاسعة مساءً.
          </p>
          <a href="/alerts" className="btn-ghost mt-4 inline-flex px-6">
            فعّل التنبيهات ليصلك أوّلَ ما يصل
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── ملاحظةٌ في الصدر لا في الذيل ─────────────────────────────────────
          طلبُ صاحب المنصّة. والموضعُ هو المعنى: من قرأ الجدولَ ثمّ نزل إلى
          التحفّظ يكون قد قرّر أن يتحرّك، ومن قرأه أوّلاً يقرأ الأسماءَ وهو
          يعرف أنّها إعلانٌ لا ضمان.

          وفيها ما طلبه حرفاً: أنّ الإعلانَ رسميّ، وأنّ النفادَ وارد، وأنّ
          الجوابَ عند المنصّة أو عند المحطة نفسِها. */}
      {/* واللوحةُ الممتلئةُ تحتاجه كذلك: قد يصل جدولُ الرمادي ولا يصل جدولُ
          حديثة، فتمتلئ الصفحةُ ويبقى صاحبُ حديثة بلا خبر — و`groupBoard` لا
          تُخرج مجموعةً لمدينةٍ بلا صفوف، فغيابُها صامتٌ تماماً. */}
      <ScheduleNotice />

      {/* الفرديُّ والزوجيّ — لمن كتب لوحتَه فقط؛ الباقي كما هو. */}
      <PlateTurnBadge day={day} />

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-slate-600">
        هذه المحطات أُعلن وقودُها <b className="text-slate-800">رسميّاً</b> ضمن جدول
        التوزيع. وقد ينفد المنتج أو يتغيّر توفّره خلال اليوم — فراجع المنصّة أو اتّصل
        بالمحطة قبل أن تقطع الطريق إليها.
      </p>

      {groups.map((g) => (
        <section key={g.city ?? '؟'} className="card overflow-x-auto p-4">
          <h2 className="text-sm font-extrabold leading-relaxed text-brand-900">
            المحطات التي يصلها وقود {dayLabel(day)}
            {g.city ? ` — ${g.city}` : ' — منطقةٌ لم تُذكر'}
          </h2>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">
            {plural(g.rows.length, 'محطة واحدة', 'محطتان', 'محطات', 'محطة')} ·{' '}
            {g.products.map((p) => PRODUCT_LABELS[p]).join(' · ')}
          </p>

          {/* «الرمادي | بانزين محسن» ثمّ محطاتُه — المنتجُ عنوانٌ لا عمود. */}
          {byProduct(g.rows).map(({ product, rows }) => (
            <table key={product} className="mt-2 w-full min-w-[17rem] text-right">
              <thead>
                <tr>
                  <th colSpan={3} className="rounded-lg bg-brand-50 px-2 py-1.5 text-right text-[11.5px] font-extrabold text-brand-900">
                    {g.city ?? 'منطقةٌ لم تُذكر'} <span className="text-brand-400">|</span> {PRODUCT_LABELS[product]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.key} r={r} />
                ))}
              </tbody>
            </table>
          ))}
        </section>
      ))}

      {/* وما ينفرد به الذيل: الفرقُ بين مصدرَي السطر. أمّا «قد يتغيّر» فقد
          صعدت إلى الصدر، ولا تُقال مرّتين في شاشةٍ واحدة. */}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        <b className="text-brand-700">محطاتُ المنصّة</b> تُحدّث حالتَها بنفسها — افتح صفحتها
        لترى ما عندها الآن. وما جاء من <b>جدول التوزيع</b> اسمٌ وصلنا، لا نملك عنه أكثر.
      </p>
    </div>
  );
}
