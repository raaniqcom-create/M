'use client';

import { PRODUCT_LABELS, expectedLabel, isoDateIn } from '@/lib/products';
import { PERIODS, PERIOD_LABELS, runsOutLabel, type ExpectedPeriod } from '@/lib/hours';
import { CheckIcon, SpinnerIcon, XIcon } from './icons';
import type { FuelProduct, StationProduct } from '@/types/database';

const WHEN = [
  { label: 'اليوم', days: 0 },
  { label: 'غداً', days: 1 },
  { label: 'بعد غد', days: 2 },
];

/** ساعاتٌ من الآن، لا ساعةُ حائط.
 *
 *  صاحبُ المحطة يعرف كم بقي عنده لا متى ينتهي بالضبط، وأربعةُ أزرارٍ أسرعُ
 *  من حقل وقتٍ يُملأ بإصبعٍ على هاتفٍ في ساحةٍ مزدحمة. والحصصُ تُوزَّع في
 *  الغالب على ساعتين إلى ستّ — وهو مدى هذه الأزرار. */
const RUNS_OUT = [
  { label: 'ساعة', hours: 1 },
  { label: 'ساعتان', hours: 2 },
  { label: '3 ساعات', hours: 3 },
  { label: '6 ساعات', hours: 6 },
];

// Two labelled buttons instead of a switch: a switch makes the owner infer
// which side means "available", and getting that wrong sends drivers to a dry
// station.
export function ProductControl({
  product,
  row,
  saving,
  onSetAvailable,
  onSetExpected,
  onSetRunsOut,
}: {
  product: FuelProduct;
  row: StationProduct | undefined;
  saving: boolean;
  onSetAvailable: (available: boolean) => void;
  onSetExpected: (date: string | null, period: ExpectedPeriod | null) => void;
  onSetRunsOut: (hours: number | null) => void;
}) {
  const available = row?.is_available ?? false;
  const expectedAt = row?.expected_at ?? null;
  const expectedPeriod = (row?.expected_period ?? null) as ExpectedPeriod | null;
  const runsOutAt = row?.runs_out_at ?? null;

  return (
    <li className="py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{PRODUCT_LABELS[product]}</span>
        {saving && <SpinnerIcon className="h-4 w-4 text-slate-400" />}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={available}
          disabled={saving}
          onClick={() => onSetAvailable(true)}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors duration-200 disabled:opacity-50 ${
            available
              ? 'border-brand bg-brand text-white'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <CheckIcon className="h-4 w-4" />
          متوفر
        </button>
        <button
          type="button"
          aria-pressed={!available}
          disabled={saving}
          onClick={() => onSetAvailable(false)}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors duration-200 disabled:opacity-50 ${
            !available
              ? 'border-traffic-red bg-traffic-red text-white'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <XIcon className="h-4 w-4" />
          غير متوفر
        </button>
      </div>

      {available && (
        <div className="mt-2.5 rounded-xl bg-brand-50 p-2.5">
          <p className="text-[11px] font-semibold text-brand-800">متى تتوقع نفاده؟ (اختياري)</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {RUNS_OUT.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                disabled={saving}
                onClick={() => onSetRunsOut(opt.hours)}
                className="min-h-[34px] rounded-lg bg-white px-3 text-[12px] font-semibold text-brand-800 disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
            {runsOutAt && (
              <button
                type="button"
                disabled={saving}
                onClick={() => onSetRunsOut(null)}
                className="min-h-[34px] px-2 text-[12px] font-semibold text-traffic-red disabled:opacity-50"
              >
                إلغاء
              </button>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed font-bold text-brand-900">
            {runsOutAt
              ? `يظهر للمستخدمين: حتى ${runsOutLabel(runsOutAt)} — وبعدها يختفي من القائمة حتى تؤكّده.`
              : 'بلا موعد يبقى معروضاً حتى تُطفئه بنفسك.'}
          </p>
        </div>
      )}

      {!available && (
        <div className="mt-2.5 rounded-xl bg-amber-50 p-2.5">
          <p className="text-[11px] font-semibold text-amber-800">
            متى تتوقع وصوله؟ (اختياري)
          </p>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {WHEN.map((opt) => {
              const active = expectedAt === isoDateIn(opt.days);
              return (
                <button
                  key={opt.days}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onSetExpected(active ? null : isoDateIn(opt.days), active ? null : expectedPeriod)
                  }
                  className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 ${
                    active ? 'bg-amber-500 text-white' : 'bg-white text-amber-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {expectedAt && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PERIODS.map((p) => {
                  const active = expectedPeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSetExpected(expectedAt, active ? null : p)}
                      className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 ${
                        active ? 'bg-amber-600 text-white' : 'bg-white text-amber-800'
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onSetExpected(null, null)}
                  className="min-h-[34px] px-2 text-[12px] font-semibold text-traffic-red"
                >
                  إلغاء
                </button>
              </div>

              <p className="mt-2 text-[11px] font-bold text-amber-900">
                يظهر للمستخدمين: {expectedLabel(expectedAt)}
                {expectedPeriod ? ` — ${PERIOD_LABELS[expectedPeriod]}` : ''}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}
