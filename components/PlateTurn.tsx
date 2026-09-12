'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from './Sheet';
import { FuelIcon } from './icons';
import { baghdadDate } from '@/lib/board';
import { runsOutLabel } from '@/lib/hours';
import { isOffered } from '@/lib/products';
import { PARITY_LABEL, RATION, dayParity, plateDigit, shortDate, turnFor } from '@/lib/ration';
import { loadSchedule } from '@/lib/scheduleData';
import type { ScheduleRow } from '@/lib/board';
import type { StationWithStatus } from '@/types/database';

const KEY = 'plate-last';
const GASOLINE = new Set(['gasoline_regular', 'gasoline_premium', 'gasoline_super']);
// الأرقامُ إنجليزيّةٌ في كلّ الواجهة — قرارُ صاحب المنصّة.
const ar = (n: number | string) => String(n);

/** «أدخل رقم سيارتك» — دورُك في الفرديّ والزوجيّ، والمحطاتُ التي فيها بنزينٌ الآن.
 *
 *  قرارٌ مؤقّت (`RATION.active`). القاعدةُ في `lib/ration.ts`، وهذه واجهتُها:
 *  لوحةٌ تُكتب مرّةً ويُحفظ آخرُ رقمها وحدَه، ثمّ الجواب: اليومَ أم غداً،
 *  وأسبوعٌ بدوائره، وأقربُ المحطات التي فيها بنزين. */
export function PlateTurn({ stations }: { stations: StationWithStatus[] }) {
  const today = baghdadDate();
  const [plate, setPlate] = useState('');
  const [digit, setDigit] = useState<number | null>(null);
  const [decree, setDecree] = useState(false);
  /** جدولُ التوزيع الرسميّ — «المحطاتُ المتاحة» يومَ دورك تأتي منه لا من «الآن». */
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadSchedule()
      .then((rows) => alive && setSchedule(rows))
      .catch(() => alive && setSchedule([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null && /^\d$/.test(saved)) {
        setDigit(Number(saved));
        setPlate(saved);
      }
    } catch {
      /* تصفّحٌ خاصّ */
    }
  }, []);

  const turn = useMemo(() => (digit === null ? null : turnFor(String(digit), today)), [digit, today]);

  // فيها بنزينٌ الآن — بقاعدة العرض نفسِها، الأقربُ أوّلاً إن عُرف الموقع.
  const withGas = useMemo(() => {
    const rows = stations
      .map((s) => ({ s, gas: s.products.filter((p) => GASOLINE.has(p.product) && isOffered(s, p)) }))
      .filter((x) => x.gas.length);
    rows.sort((a, b) => {
      if (a.s.distanceKm != null && b.s.distanceKm != null) return a.s.distanceKm - b.s.distanceKm;
      const la = a.gas.map((p) => p.updated_at).sort().at(-1) ?? '';
      const lb = b.gas.map((p) => p.updated_at).sort().at(-1) ?? '';
      return lb.localeCompare(la);
    });
    return rows;
  }, [stations]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = plateDigit(plate);
    if (d === null) return;
    setDigit(d);
    try {
      localStorage.setItem(KEY, String(d));
    } catch {
      /* تصفّحٌ خاصّ */
    }
  }

  // ── محطاتُ البنزين يومَ دورك — من الجدول الرسميّ ──────────────────────
  //
  // «لا توجد أيّ محطةٍ معقول!!» — صاحبُ المنصّة حين رأى «الآن: 0». والصوابُ
  // أنّ «الآن» صادقةٌ (لا محطةَ أكّدت بنزيناً هذه الساعة) لكنّها ليست السؤال:
  // من يعرف دورَه غداً يريد **أين يصل البنزينُ غداً** — وذلك في الجدول، لا في
  // تأكيدات المحطات. فيومُ الدور يُقرأ من الجدول، ويُذكر «الآن» إن كان فيه شيء.
  const turnDay = turn?.nextOk ?? null;
  const onSchedule = useMemo(() => {
    if (!schedule || !turnDay) return null;
    const days = [...new Set(schedule.map((r) => r.for_date))].sort();
    // إن لم يُنشر جدولُ يوم الدور بعدُ يُعرض أقربُ جدولٍ منشورٍ بعده بتاريخه.
    const day = days.includes(turnDay) ? turnDay : days.find((d) => d > turnDay) ?? null;
    if (!day) return { day: turnDay, rows: [] as ScheduleRow[], exact: false };
    const rows = schedule.filter((r) => r.for_date === day && GASOLINE.has(r.product));
    // محطةٌ واحدةٌ لا سطرٌ لكلّ منتج
    const seen = new Set<string>();
    const uniq = rows.filter((r) => (seen.has(r.station_name) ? false : (seen.add(r.station_name), true)));
    return { day, rows: uniq, exact: day === turnDay };
  }, [schedule, turnDay]);

  const todayParity = dayParity(today);
  const tone = todayParity === 'odd' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900';

  return (
    <section className="card mb-4 overflow-hidden">
      {/* الرأس: لونُ اليوم هو أوّلُ ما يُقرأ */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-800">البنزين بالفرديّ والزوجيّ</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            قرارٌ مؤقّت من محافظة الأنبار — من {ar(shortDate(RATION.from))}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-extrabold ${tone}`}>
          اليوم {ar(shortDate(today))} · {PARITY_LABEL[todayParity]}
        </span>
      </div>

      {/* لوحةُ السيّارة — حقلٌ بشكلها */}
      <form onSubmit={submit} className="mt-3 flex items-stretch gap-2 px-4">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border-[3px] border-slate-900 bg-white shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#0f172a]">
          <span className="flex h-full items-center border-l-[3px] border-slate-900 bg-slate-900 px-2 text-[10px] font-extrabold text-white">
            العراق
          </span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="رقم اللوحة"
            aria-label="رقم لوحة السيّارة"
            dir="ltr"
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-center text-[22px] font-extrabold tabular-nums tracking-[0.2em] text-slate-900 placeholder:text-[14px] placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <button type="submit" className="btn-primary shrink-0 px-4">
          اعرف دوري
        </button>
      </form>

      {turn && (
        <div className="mt-3 px-4">
          {/* الجواب — كبيراً وبلونه */}
          <div
            className={`rounded-2xl p-3 text-center ${
              turn.todayOk ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            <p className="text-[19px] font-extrabold leading-tight">
              {turn.todayOk ? '✅ دورُك اليوم' : `⏳ دورُك ${turn.nextOk === baghdadDate(1) ? 'غداً' : 'يوم'} ${ar(shortDate(turn.nextOk))}`}
            </p>
            <p className="mt-1 text-[11.5px] opacity-80">
              لوحتُك تنتهي بـ{ar(digit ?? 0)} ({PARITY_LABEL[turn.parity]}) — تتزوّد في الأيّام ال{PARITY_LABEL[turn.parity]}ة.
            </p>
          </div>

          {/* أسبوعٌ بدوائره: المضيئةُ أيّامُه */}
          <div className="mt-3 grid grid-cols-7 gap-1" aria-label="أيّامُ الأسبوع القادمة">
            {turn.week.map((d, i) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold ${
                    d.ok ? 'bg-brand text-white shadow-soft' : 'bg-slate-100 text-slate-400'
                  } ${i === 0 ? 'ring-2 ring-offset-1 ring-brand' : ''}`}
                >
                  {ar(Number(d.date.slice(8, 10)))}
                </span>
                <span className="text-[9px] font-bold text-slate-400">{i === 0 ? 'اليوم' : i === 1 ? 'غداً' : ''}</span>
              </div>
            ))}
          </div>

          {/* محطاتُ البنزين يومَ دورك — من جدول التوزيع الرسميّ */}
          <div className="mt-3 rounded-2xl border border-slate-100 p-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-800">
              <FuelIcon className="h-4 w-4 text-brand" />
              {onSchedule && onSchedule.rows.length
                ? `يصلها البنزين ${onSchedule.day === today ? 'اليوم' : onSchedule.day === baghdadDate(1) ? 'غداً' : 'يوم ' + shortDate(onSchedule.day)}: ${ar(onSchedule.rows.length)} ${onSchedule.rows.length === 1 ? 'محطة' : 'محطات'}`
                : schedule === null
                  ? 'جدولُ التوزيع…'
                  : `لم يُنشر جدولُ ${turnDay === baghdadDate(1) ? 'الغد' : 'يوم ' + shortDate(turnDay ?? today)} بعد`}
            </p>
            {onSchedule && !onSchedule.exact && onSchedule.rows.length > 0 && (
              <p className="mt-0.5 text-[10.5px] text-amber-700">
                جدولُ يوم دورك لم يُنشر بعد — هذا أقربُ جدولٍ منشور.
              </p>
            )}
            {onSchedule && onSchedule.rows.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-x-3">
                {onSchedule.rows.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-1 border-b border-slate-100 py-1.5 text-[11.5px]">
                    {r.linked_station_id ? (
                      <a href={`/station/${r.linked_station_id}`} className="min-w-0 truncate font-bold text-brand-700">
                        {r.station_name}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate font-bold text-slate-700">{r.station_name}</span>
                    )}
                    {r.city && <span className="shrink-0 text-[10px] text-slate-400">{r.city}</span>}
                  </li>
                ))}
              </ul>
            )}
            {onSchedule && onSchedule.rows.length > 8 && (
              <a href="/schedule" className="mt-2 block text-center text-[11.5px] font-bold text-brand-700 underline">
                و{ar(onSchedule.rows.length - 8)} أخرى — الجدولُ كاملاً
              </a>
            )}
            {schedule !== null && onSchedule && onSchedule.rows.length === 0 && (
              <p className="mt-1 text-[11.5px] text-slate-500">يصل الجدولُ عادةً بعد التاسعة مساءً — ويصلك إشعارٌ إن اخترتَ منطقتك.</p>
            )}

            {/* والآن — إن كان ثمّة شيء */}
            {withGas.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[11.5px] font-extrabold text-brand-800">
                  وأكّدت بنزيناً الآن: {ar(withGas.length)} {withGas.length === 1 ? 'محطة' : 'محطات'}
                </p>
                <ul className="mt-1 divide-y divide-slate-100">
                  {withGas.slice(0, 3).map(({ s, gas }) => {
                    const ro = gas.map((p) => p.runs_out_at).filter(Boolean).sort()[0];
                    return (
                      <li key={s.id}>
                        <a href={`/station/${s.id}`} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                          <span className="min-w-0 truncate font-bold text-slate-700">{s.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {s.city}
                            {s.distanceKm != null && ` · ${ar(Math.round(s.distanceKm))} كم`}
                            {ro && ` · حتى ${runsOutLabel(ro)}`}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 text-[11px]">
        <span className="font-bold text-red-700">⚠️ ممنوعٌ مبيتُ المركبات في الطوابير ليلاً</span>
        <button type="button" onClick={() => setDecree(true)} className="shrink-0 font-bold text-brand-700 underline">
          نصُّ القرار
        </button>
      </div>

      <Sheet open={decree} onClose={() => setDecree(false)} title="قرار محافظة الأنبار — الفرديّ والزوجيّ">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{RATION.decree}</p>
      </Sheet>
    </section>
  );
}
