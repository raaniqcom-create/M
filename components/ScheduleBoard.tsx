'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import { plural } from '@/lib/freshness';
import { baghdadDate, type ScheduleGroup, type ScheduleRow } from '@/lib/scheduleData';

/** «محطات غداً» — الخبرُ الوحيد الذي يُقال قبل وقوعه.
 *
 *  وكلُّ ما عداه في هذه المنصّة يصف الحاضر: أين الوقودُ الآن. وهذا يصف الغد،
 *  فيُكتب بلفظٍ آخر ويُحاط بتحفّظٍ آخر.
 *
 *  ── جدولٌ لكلّ ناحية، ولو بمحطةٍ واحدة ───────────────────────────────────
 *
 *  قرارُ صاحب المنصّة: من يسكن الرمادي يقرأ جدولَ الرمادي كاملاً — بمنتجاته
 *  كلِّها — ثمّ يجد جدولَ الخالدية تحته مستقلّاً، ولو لم يكن فيه إلا محطة.
 *  والمنتجُ عمودٌ لا عنوان: ليلةٌ فيها واحدةٌ على المحسّن وسبعٌ على العادي
 *  خبرٌ واحدٌ لا خبران.
 *
 *  ── والاسمُ يُكتب كاملاً ولو نزل سطرين ──────────────────────────────────
 *
 *  «محطة تعبئة وقود الرمادي الجديد…» ليست اسمَ محطة. والقصُّ يوفّر سطراً
 *  ويُتلف الخبرَ: من لا يعرف أيَّ محطةٍ قُصدت لا ينتفع بالجدول أصلاً. ومعه
 *  الاسمُ كما وصل حين يختلف — به يعرف القارئُ ما اعتاده في الشارع، وبه يُكشف
 *  خطأُ المطابقة إن أخطأت.
 *
 *  ── والمعتمدةُ تُميَّز عن غيرها ──────────────────────────────────────────
 *
 *  محطةٌ معتمدةٌ لها صفحةٌ وصاحبٌ يُحدّثها ورقمٌ يُتّصل به. وغيرُ المسجّلة اسمٌ
 *  وردنا، لا نملك عنه إلا ما وصل. والفرقُ يُقال صراحةً — وهو تمييزُ
 *  `UnregisteredBoard` نفسُه، بلفظٍ يناسب خبراً عن الغد لا عن الآن. */

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

function Row({ r }: { r: ScheduleRow }) {
  const name = r.linked_station_id ? (
    <a
      href={`/station/${r.linked_station_id}`}
      className="font-bold text-brand-900 underline-offset-2 hover:underline"
    >
      {r.station_name}
    </a>
  ) : (
    <span className="font-bold text-slate-700">{r.station_name}</span>
  );

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2.5 pl-2 text-[12.5px] leading-snug">
        {name}
        {r.raw_name && r.raw_name !== r.station_name && (
          <span className="mt-0.5 block text-[10.5px] text-slate-400">
            وردت باسم: {r.raw_name}
          </span>
        )}
        {r.note && <span className="mt-0.5 block text-[10.5px] text-amber-700">{r.note}</span>}
      </td>
      <td className="w-[5.6rem] py-2.5 pl-2 text-[11.5px] font-bold text-brand-700">
        {PRODUCT_LABELS[r.product]}
      </td>
      <td className="w-[5.4rem] py-2.5 text-left">
        {r.linked_station_id ? (
          <span className="inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
            معتمدة
          </span>
        ) : (
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            غير مسجّلة
          </span>
        )}
      </td>
    </tr>
  );
}

export function ScheduleBoard({ groups }: { groups: ScheduleGroup[] }) {
  if (!groups.length) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-600">لا جدولَ لغدٍ بعد.</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
          يصل الجدولُ عادةً بعد الثامنة مساءً.
        </p>
        <a href="/alerts" className="btn-ghost mt-4 inline-flex px-6">
          فعّل التنبيهات ليصلك أوّلَ ما يصل
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={`${g.for_date}|${g.city ?? '؟'}`} className="card overflow-x-auto p-4">
          <h2 className="text-sm font-extrabold leading-relaxed text-brand-900">
            المحطات التي يصلها وقود {dayLabel(g.for_date)}
            {g.city ? ` — ${g.city}` : ' — ناحيةٌ لم تُذكر'}
          </h2>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">
            {plural(g.rows.length, 'محطة واحدة', 'محطتان', 'محطات', 'محطة')} ·{' '}
            {g.products.map((p) => PRODUCT_LABELS[p]).join(' · ')}
          </p>

          <table className="mt-2 w-full min-w-[17rem] text-right">
            <thead>
              <tr className="text-[10.5px] text-slate-400">
                <th className="pb-1 pl-2 font-bold">المحطة</th>
                <th className="pb-1 pl-2 font-bold">المنتج</th>
                <th className="pb-1 text-left font-bold">في المنصّة</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {/* التحفّظُ يُقال مرّةً في الأسفل لا مع كلّ سطر.
          وهو صادقٌ لا تجميليّ: الجدولُ خطّةٌ تُعلن قبل يوم، والخططُ تتغيّر —
          ومن يقطع الطريقَ بناءً عليه يستحقّ أن يعرف ذلك قبل أن يتحرّك. */}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        جدولٌ مُعلَنٌ مسبقاً وقد يتغيّر. و<b className="text-brand-700">المعتمدة</b> محطاتٌ على
        المنصّة تُحدّث توفّرها بنفسها — افتح صفحتها لترى حالتها الآن. و<b>غير المسجّلة</b> اسمٌ
        وصلنا في الجدول، لا نملك عنه أكثر.
      </p>
    </div>
  );
}
