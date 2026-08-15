'use client';

import { PRODUCT_LABELS, expectedLabel, isoDateIn } from '@/lib/products';
import { PERIODS, PERIOD_LABELS, type ExpectedPeriod } from '@/lib/hours';
import { CheckIcon, SpinnerIcon, XIcon } from './icons';
import type { FuelProduct, StationProduct } from '@/types/database';

const WHEN = [
  { label: 'اليوم', days: 0 },
  { label: 'غداً', days: 1 },
  { label: 'بعد غد', days: 2 },
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
}: {
  product: FuelProduct;
  row: StationProduct | undefined;
  saving: boolean;
  onSetAvailable: (available: boolean) => void;
  onSetExpected: (date: string | null, period: ExpectedPeriod | null) => void;
}) {
  const available = row?.is_available ?? false;
  const expectedAt = row?.expected_at ?? null;
  const expectedPeriod = (row?.expected_period ?? null) as ExpectedPeriod | null;

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
