'use client';

import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { isOpenNow } from '@/lib/hours';
import type { FuelProduct, StationWithStatus } from '@/types/database';

export function ProductsDashboard({
  stations,
  filter,
  onPick,
}: {
  stations: StationWithStatus[];
  filter: FuelProduct | null;
  onPick: (p: FuelProduct | null) => void;
}) {
  // "available now" must mean collectable now — a closed station holding fuel
  // is not a place to send a driver
  const counts = new Map<FuelProduct, number>();
  for (const s of stations) {
    if (!isOpenNow(s)) continue;
    for (const p of s.products) {
      if (p.is_available) counts.set(p.product, (counts.get(p.product) ?? 0) + 1);
    }
  }

  return (
    <section className="card p-4" aria-label="المنتجات المتوفرة الآن">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-900">المنتجات المتوفرة الآن</h2>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          مباشر
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {PRODUCT_ORDER.filter((p) => (counts.get(p) ?? 0) > 0 || filter === p).map((product) => {
          const count = counts.get(product) ?? 0;
          const active = filter === product;
          return (
            <button
              key={product}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? null : product)}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-1 transition-colors duration-200 ${
                active
                  ? 'border-brand bg-brand text-white'
                  : 'border-brand-100 bg-brand-50 text-brand-900'
              }`}
            >
              <span className="text-lg font-extrabold leading-none">{count}</span>
              <span className="mt-1 text-[11px] font-semibold leading-tight">
                {PRODUCT_LABELS[product]}
              </span>
            </button>
          );
        })}
      </div>
      {[...counts.values()].length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          لا يتوفر أي منتج في المحطات المفتوحة حالياً
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          العدد يمثل المحطات المفتوحة الآن التي يتوفر فيها المنتج — اضغط للتصفية
        </p>
      )}
    </section>
  );
}
