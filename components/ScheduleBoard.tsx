'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import { whenLabel } from '@/lib/hours';
import { plural } from '@/lib/freshness';
import { baghdadDate, type BoardGroup, type BoardRow } from '@/lib/scheduleData';

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

function Row({ r }: { r: BoardRow }) {
  const s = STATE[r.state];
  const dim = r.state === 'out';

  const name = r.stationId ? (
    <a
      href={`/station/${r.stationId}`}
      className={`font-bold underline-offset-2 hover:underline ${
        dim ? 'text-slate-400 line-through' : 'text-brand-900'
      }`}
    >
      {r.name}
    </a>
  ) : (
    <span className={`font-bold ${dim ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
      {r.name}
    </span>
  );

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2.5 pl-2 text-[12.5px] leading-snug">
        {name}
        {r.state === 'expected' && whenLabel(r.period, r.time) && (
          <span className="mr-1.5 text-[10.5px] text-amber-700">
            {' '}
            · {whenLabel(r.period, r.time)}
          </span>
        )}
        {r.source === 'station' ? (
          <span className="mt-0.5 block text-[10.5px] text-brand-700">
            من لوحة المحطة{r.alsoInChannel ? ' وجدول التوزيع' : ''}
          </span>
        ) : (
          <span className="mt-0.5 block text-[10.5px] text-slate-400">من جدول التوزيع</span>
        )}
      </td>
      <td className="w-[5.6rem] py-2.5 pl-2 text-[11.5px] font-bold text-brand-700">
        {PRODUCT_LABELS[r.product]}
      </td>
      <td className="w-[4.8rem] py-2.5 text-left">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>
          {s.text}
        </span>
      </td>
    </tr>
  );
}

export function ScheduleBoard({ groups, day }: { groups: BoardGroup[]; day: string }) {
  if (!groups.length) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-600">لا جدولَ {dayLabel(day)} بعد.</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
          يصل الجدولُ عادةً بعد التاسعة مساءً.
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
        <section key={g.city ?? '؟'} className="card overflow-x-auto p-4">
          <h2 className="text-sm font-extrabold leading-relaxed text-brand-900">
            المحطات التي يصلها وقود {dayLabel(day)}
            {g.city ? ` — ${g.city}` : ' — منطقةٌ لم تُذكر'}
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
                <th className="pb-1 text-left font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <Row key={r.key} r={r} />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {/* التحفّظُ يُقال مرّةً في الأسفل لا مع كلّ سطر.
          وهو صادقٌ لا تجميليّ: الجدولُ خطّةٌ تُعلن قبل يوم، والخططُ تتغيّر —
          ومن يقطع الطريقَ بناءً عليه يستحقّ أن يعرف ذلك قبل أن يتحرّك. */}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        جدولٌ مُعلَنٌ مسبقاً وقد يتغيّر. و<b className="text-brand-700">محطاتُ المنصّة</b> تُحدّث
        حالتَها بنفسها — افتح صفحتها لترى ما عندها الآن. وما جاء من{' '}
        <b>جدول التوزيع</b> اسمٌ وصلنا، لا نملك عنه أكثر.
      </p>
    </div>
  );
}
