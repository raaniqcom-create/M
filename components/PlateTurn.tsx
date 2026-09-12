'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from './Sheet';
import { ChevronDownIcon, FuelIcon, MapPinIcon } from './icons';
import { baghdadDate } from '@/lib/board';
import { PRODUCT_LABELS, isOffered } from '@/lib/products';
import { PARITY_LABEL, RATION, dayParity, plateDigit, shortDate, turnFor } from '@/lib/ration';
import { loadSchedule } from '@/lib/scheduleData';
import type { AlertChoice } from '@/lib/alerts';
import type { FuelProduct, StationWithStatus } from '@/types/database';

const KEY = 'plate-last';
const GASOLINE = new Set(['gasoline_regular', 'gasoline_premium', 'gasoline_super']);
// الأرقامُ إنجليزيّةٌ في كلّ الواجهة — قرارُ صاحب المنصّة.
const ar = (n: number | string) => String(n);
// «3 محطات» و«18 محطة» — تمييزُ العدد.
const stationsOf = (n: number) => `${ar(n)} ${n >= 3 && n <= 10 ? 'محطات' : 'محطة'}`;
// «بانزين» مفهومةٌ من عنوان البطاقة — يبقى النوعُ وحدَه في العمود الضيّق.
const kind = (p: FuelProduct) => PRODUCT_LABELS[p].replace('بانزين ', '');
// ويز وحدَه يهدي في العراق — قرارُ صاحب المنصّة. المعتمدةُ بإحداثيّاتها،
// وغيرُها بحثاً بالاسم.
const wazeTo = (r: { name: string; city: string | null; lat?: number; lng?: number }) =>
  r.lat != null && r.lng != null
    ? `https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent([r.name, r.city].filter(Boolean).join(' '))}`;

/** سطرٌ في جدول «دوري»: محطةٌ واحدةٌ بمنتجاتها — المعتمدةُ (المسجّلةُ في
 *  المنصّة) لها إحداثيّاتٌ وصفحة، وقد يكون صاحبُها أعلن بنزيناً الآن. */
type TurnRow = {
  name: string;
  city: string | null;
  products: FuelProduct[];
  station?: StationWithStatus;
  liveNow: boolean;
};

/** «أدخل رقم سيارتك» — دورُك في الفرديّ والزوجيّ، والمحطاتُ التي فيها بنزينٌ الآن.
 *
 *  قرارٌ مؤقّت (`RATION.active`). القاعدةُ في `lib/ration.ts`، وهذه واجهتُها:
 *  لوحةٌ تُكتب مرّةً ويُحفظ آخرُ رقمها وحدَه، ثمّ الجواب: اليومَ أم غداً،
 *  وأسبوعٌ بدوائره، وأقربُ المحطات التي فيها بنزين. */
export function PlateTurn({
  stations,
  choice,
  onPlate,
}: {
  stations: StationWithStatus[];
  /** مدنُ القارئ من «التنبيهات» — الفارغُ الكلّ. «ما فائدةُ شخصٍ في الرمادي
   *  يشاهد محطةً في القائم إذا لم يخترها؟» */
  choice: AlertChoice | null;
  /** هل كُتبت لوحةٌ (الآن أو من قبل)؟ — لصفحة /dori كي تُظهر ذيلَها بعدها. */
  onPlate?: (has: boolean) => void;
}) {
  const today = baghdadDate();
  const cities = useMemo(() => new Set(choice?.cities ?? []), [choice]);
  const cityLabel = cities.size ? ` في ${[...cities].join(' و')}` : '';
  const [plate, setPlate] = useState('');
  const [digit, setDigit] = useState<number | null>(null);
  const [decree, setDecree] = useState(false);
  // «أريد هذا الجدول يعمل له إخفاء وظهور» — مطويٌّ ابتداءً، والعنوانُ يفتحه.
  const [listOpen, setListOpen] = useState(false);
  /** جدولُ التوزيع الرسميّ — «المحطاتُ المتاحة» يومَ دورك تأتي منه لا من «الآن». */
  const [schedule, setSchedule] = useState<Awaited<ReturnType<typeof loadSchedule>> | null>(null);

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
        onPlate?.(true);
      }
    } catch {
      /* تصفّحٌ خاصّ */
    }
    // عند التركيب وحدَه — onPlate ثابتةٌ من الأب.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turn = useMemo(() => (digit === null ? null : turnFor(String(digit), today)), [digit, today]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = plateDigit(plate);
    if (d === null) return;
    setDigit(d);
    onPlate?.(true);
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
  // تأكيدات المحطات. فيومُ الدور يُقرأ من الجدول وحدَه — «لا نعتمد حالةَ
  // التوقّع لأنّ أغلبَ المحطات غيرُ مسجّلة» — والمسجّلةُ في المنصّة تتقدّم
  // الصفوفَ بكلمة «معتمدة»، ومن أعلن صاحبُها بنزيناً الآن يُقال معها «الآن».
  const turnDay = turn?.nextOk ?? null;
  const onSchedule = useMemo(() => {
    if (!schedule || !turnDay) return null;
    const days = [...new Set(schedule.map((r) => r.for_date))].sort();
    // إن لم يُنشر جدولُ يوم الدور بعدُ يُعرض أقربُ جدولٍ منشورٍ بعده بتاريخه.
    const day = days.includes(turnDay) ? turnDay : days.find((d) => d > turnDay) ?? null;
    if (!day) return { day: turnDay, rows: [] as TurnRow[], all: 0, exact: false };
    // محطةٌ واحدةٌ بمنتجاتها لا سطرٌ لكلّ منتج
    const byName = new Map<string, TurnRow>();
    for (const r of schedule) {
      if (r.for_date !== day || !GASOLINE.has(r.product)) continue;
      const row: TurnRow = byName.get(r.station_name) ?? { name: r.station_name, city: r.city, products: [], liveNow: false };
      if (!row.station && r.linked_station_id) {
        row.station = stations.find((s) => s.id === r.linked_station_id);
        row.liveNow = !!row.station?.products.some((p) => GASOLINE.has(p.product) && isOffered(row.station!, p));
      }
      if (!row.products.includes(r.product)) row.products.push(r.product);
      byName.set(r.station_name, row);
    }
    const all = [...byName.values()].sort((a, b) => Number(!!b.station) - Number(!!a.station));
    const mine = all.filter((r) => !cities.size || (r.city && cities.has(r.city)));
    return { day, rows: mine, all: all.length, exact: day === turnDay };
  }, [schedule, turnDay, cities, stations]);

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
            {onSchedule && onSchedule.rows.length > 0 ? (
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                aria-expanded={listOpen}
                className="flex min-h-[40px] w-full items-center gap-1.5 text-right text-[12.5px] font-extrabold text-slate-800"
              >
                <FuelIcon className="h-4 w-4 shrink-0 text-brand" />
                <span className="flex-1">
                  {`يصلها البنزين ${onSchedule.day === today ? 'اليوم' : onSchedule.day === baghdadDate(1) ? 'غداً' : 'يوم ' + shortDate(onSchedule.day)}${cityLabel}: ${stationsOf(onSchedule.rows.length)}`}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-brand-700">
                  {listOpen ? 'إخفاء' : 'عرض'}
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${listOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
            ) : (
              <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-800">
                <FuelIcon className="h-4 w-4 text-brand" />
                {schedule === null
                  ? 'جدولُ التوزيع…'
                  : onSchedule && onSchedule.all > 0
                    ? `لا محطةَ${cityLabel} في جدول ${onSchedule.day === baghdadDate(1) ? 'الغد' : shortDate(onSchedule.day)}`
                    : `لم يُنشر جدولُ ${turnDay === baghdadDate(1) ? 'الغد' : 'يوم ' + shortDate(turnDay ?? today)} بعد`}
              </p>
            )}
            {onSchedule && onSchedule.rows.length === 0 && onSchedule.all > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                في الجدول {stationsOf(onSchedule.all)} في مناطقَ أخرى —{' '}
                <a href="/schedule" className="font-bold text-brand-700 underline">الجدولُ كاملاً</a>
              </p>
            )}
            {!cities.size && (
              <p className="mt-0.5 text-[10.5px] text-slate-400">
                تُعرض كلُّ المناطق —{' '}
                <a href="/alerts" className="font-bold text-brand-700 underline">اختر منطقتك</a> لترى ما يخصّك.
              </p>
            )}
            {listOpen && onSchedule && !onSchedule.exact && onSchedule.rows.length > 0 && (
              <p className="mt-0.5 text-[10.5px] text-amber-700">
                جدولُ يوم دورك لم يُنشر بعد — هذا أقربُ جدولٍ منشور.
              </p>
            )}
            {listOpen && onSchedule && onSchedule.rows.length > 0 && (
              <table className="mt-2 w-full text-[11.5px]">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400">
                    <th className="pb-1 text-right font-bold">المحطة</th>
                    <th className="pb-1 text-right font-bold">الوقود</th>
                    <th className="pb-1 text-center font-bold">الطريق</th>
                  </tr>
                </thead>
                <tbody>
                  {onSchedule.rows.slice(0, 8).map((r) => (
                    <tr key={r.name} className="border-t border-slate-100">
                      <td className="w-full max-w-0 py-1.5 pl-2">
                        {r.station ? (
                          <a href={`/station/${r.station.id}`} className="block truncate font-bold text-brand-700">
                            {r.name}
                          </a>
                        ) : (
                          <span className="block truncate font-bold text-slate-700">{r.name}</span>
                        )}
                        <span className="block truncate text-[10px] text-slate-400">
                          {r.station && <b className="text-brand-700">معتمدة</b>}
                          {r.station && r.city && ' · '}
                          {r.city}
                        </span>
                      </td>
                      <td className="w-px whitespace-nowrap py-1.5 pl-2 text-slate-700">
                        {r.products.map(kind).join(' · ')}
                        {r.liveNow && <b className="block text-[10px] text-brand-700">متوفّرٌ الآن</b>}
                      </td>
                      <td className="w-px py-1.5 text-center">
                        <a
                          href={wazeTo({ name: r.name, city: r.city, lat: r.station?.lat, lng: r.station?.lng })}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`الطريق إلى ${r.name}`}
                          className="inline-flex min-h-[32px] items-center gap-0.5 whitespace-nowrap rounded-lg px-1.5 text-[10px] font-bold text-brand-700 active:bg-brand-50"
                        >
                          <MapPinIcon className="h-4 w-4" />
                          توجّه لها
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {listOpen && onSchedule && onSchedule.rows.length > 8 && (
              <a href="/schedule" className="mt-2 block text-center text-[11.5px] font-bold text-brand-700 underline">
                و{ar(onSchedule.rows.length - 8)} أخرى — الجدولُ كاملاً
              </a>
            )}
            {schedule !== null && onSchedule && onSchedule.all === 0 && (
              <p className="mt-1 text-[11.5px] text-slate-500">يصل الجدولُ عادةً بعد التاسعة مساءً — ويصلك إشعارٌ إن اخترتَ منطقتك.</p>
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
