'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import { baghdadDate, type ScheduleGroup, type ScheduleRow } from '@/lib/scheduleData';

/** «محطات غداً» — الخبرُ الوحيد الذي يُقال قبل وقوعه.
 *
 *  وكلُّ ما عداه في هذه المنصّة يصف الحاضر: أين الوقودُ الآن. وهذا يصف الغد،
 *  فيُكتب بلفظٍ آخر ويُحاط بتحفّظٍ آخر.
 *
 *  ── والمسجّلةُ تُميَّز عن غيرها ──────────────────────────────────────────
 *
 *  محطةٌ مسجّلةٌ لها صفحةٌ وصاحبٌ يُحدّثها ورقمٌ يُتّصل به. وغيرُ المسجّلة اسمٌ
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

function Line({ r }: { r: ScheduleRow }) {
  const body = (
    <>
      <span className={r.linked_station_id ? 'font-bold text-brand-900' : 'font-bold text-slate-700'}>
        {r.station_name}
      </span>
      {r.city && <span className="text-[11px] text-slate-500"> · {r.city}</span>}
      {r.note && <span className="text-[11px] text-amber-700"> · {r.note}</span>}
    </>
  );

  return (
    <li className="flex items-center justify-between gap-2 border-t border-slate-100 px-1 py-2.5 first:border-t-0">
      <span className="min-w-0 text-[12.5px] leading-snug">
        {r.linked_station_id ? (
          <a href={`/station/${r.linked_station_id}`} className="underline-offset-2 hover:underline">
            {body}
          </a>
        ) : (
          body
        )}
      </span>
      {r.linked_station_id ? (
        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
          في المنصّة
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          خارج المنصّة
        </span>
      )}
    </li>
  );
}

export function ScheduleBoard({ groups }: { groups: ScheduleGroup[] }) {
  if (!groups.length) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-600">لا جدولَ لغدٍ بعد.</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
          يصل الجدولُ عادةً بعد الثامنة مساءً. فعّل التنبيهات ليصلك أوّلَ ما يصل.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={`${g.for_date}|${g.product}`} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold text-brand-900">
              {PRODUCT_LABELS[g.product]} — {dayLabel(g.for_date)}
            </h2>
            <span className="text-[11px] font-bold text-slate-500">
              {g.rows.length} محطة
              {g.cities.length ? ` · ${g.cities.join(' · ')}` : ''}
            </span>
          </div>

          <ul className="mt-2">
            {g.rows.map((r) => (
              <Line key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ))}

      {/* التحفّظُ يُقال مرّةً في الأسفل لا مع كلّ سطر.
          وهو صادقٌ لا تجميليّ: الجدولُ خطّةٌ تُعلن قبل يوم، والخططُ تتغيّر —
          ومن يقطع الطريقَ بناءً عليه يستحقّ أن يعرف ذلك قبل أن يتحرّك. */}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        جدولٌ مُعلَنٌ مسبقاً وقد يتغيّر. والمحطاتُ <b className="text-brand-700">في المنصّة</b> تُحدّث
        توفّرها بنفسها — افتح صفحتها لترى حالتها الآن.
      </p>
    </div>
  );
}
