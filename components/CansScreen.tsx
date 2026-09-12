'use client';

import { CANS, outletsFor, type CanOutlet } from '@/lib/cans';
import { useAlertChoice } from '@/lib/alerts';
import { MapPinIcon } from './icons';

// ويز وحدَه يهدي في العراق — بحثاً بالاسم، فالمنافذُ ليست في المنصّة.
const wazeTo = (name: string, city: string) =>
  `https://waze.com/ul?q=${encodeURIComponent(`${name} ${city}`)}`;

/** «تعبئة الجالونات» — لصاحب الدرّاجة والتكتك والمولّدة بعد قرار المنع:
 *  القاعدةُ في ثلاث جمل، ثمّ منافذُ مدينتِه أوّلاً ثمّ الباقي — ولا تخفى
 *  جملةُ «تأكّد قبل أن تتوجّه» لأنّ أكثرَ القائمة «بحسب المعلومات المتوفّرة». */
export function CansScreen() {
  const { choice } = useAlertChoice();
  const { mine, rest } = outletsFor(choice?.cities);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-bold leading-relaxed text-red-800">
          ⛔ {CANS.rule}
        </p>
        <h2 className="mt-4 text-[13px] font-extrabold text-slate-800">ماذا يعني لك؟</h2>
        <ol className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-slate-700">
          <li className="flex gap-2">
            <b className="shrink-0 text-brand-700">1</b>
            <span>
              <b>لا تقف بعبوتك في طابور المحطة</b> — لن تُجهَّز، ولو كان البنزين متوفّراً.
            </span>
          </li>
          <li className="flex gap-2">
            <b className="shrink-0 text-brand-700">2</b>
            <span>
              درّاجةٌ أو تكتك أو مولّدة أو مضخّة؟ <b>خذ العبوةَ إلى منفذ البيع المباشر</b> في مدينتك — القائمةُ تحت.
            </span>
          </li>
          <li className="flex gap-2">
            <b className="shrink-0 text-brand-700">3</b>
            <span>
              <b>تأكّد قبل أن تتوجّه</b>: أكثرُ المنافذ مذكورةٌ بحسب المعلومات المتوفّرة، لا بإعلانٍ رسميّ لكلّ واحد.
            </span>
          </li>
        </ol>
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[12px] font-extrabold text-slate-500">في مدينتك</h2>
          <div className="space-y-2">
            {mine.map((o) => (
              <OutletCard key={o.label} outlet={o} confirmed={CANS.confirmed.includes(o)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 px-1 text-[12px] font-extrabold text-slate-500">
          {mine.length ? 'باقي مدن الأنبار' : 'منافذ البيع المباشر في الأنبار'}
        </h2>
        <div className="space-y-2">
          {rest.map((o) => (
            <OutletCard key={o.label} outlet={o} confirmed={CANS.confirmed.includes(o)} />
          ))}
        </div>
      </section>

      <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-900">
        {CANS.caveat}
      </p>

      <a href="/dori" className="btn-ghost w-full">
        وسيّارتك؟ اعرف دورك في الفرديّ والزوجيّ
      </a>
    </div>
  );
}

function OutletCard({ outlet, confirmed }: { outlet: CanOutlet; confirmed: boolean }) {
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-extrabold text-slate-800">{outlet.label}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            confirmed ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {confirmed ? 'معلَن' : 'تأكّد قبل التوجّه'}
        </span>
      </div>
      <ul className="mt-1.5 divide-y divide-slate-100">
        {outlet.outlets.map((name) => (
          <li key={name} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-[12.5px] font-bold text-slate-700">{name}</span>
            <a
              href={wazeTo(name, outlet.cities[0])}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`الطريق إلى ${name}`}
              className="flex min-h-[32px] shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-[10.5px] font-bold text-brand-700 active:bg-brand-50"
            >
              <MapPinIcon className="h-4 w-4" />
              توجّه لها
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
