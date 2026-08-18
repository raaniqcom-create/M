'use client';

import { CITY_NAMES } from '@/lib/cities';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import type { FuelProduct } from '@/types/database';

/** The two chip groups, controlled. Shared so the onboarding wizard and the
 *  standalone alerts screen cannot drift apart — 16 cities and 7 products is
 *  exactly the kind of markup that gets duplicated once and then fixed in only
 *  one of the two copies. */
export function AlertChips({
  cities,
  products,
  onCities,
  onProducts,
}: {
  cities: string[];
  products: FuelProduct[];
  onCities: (v: string[]) => void;
  onProducts: (v: FuelProduct[]) => void;
}) {
  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  // 44px, not 36: the city string is the routing key, and a mis-tap subscribes
  // the driver to a city he will never be told about.
  const chip = (on: boolean) =>
    `min-h-[44px] rounded-full border px-3.5 text-xs font-semibold transition-colors ${
      on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
    }`;

  return (
    <>
      {/* «اتركها فارغة = كل المدن» was an invitation, and 52 people took it —
          then heard about fuel in towns they will never drive to. A person who
          wants everything can still pick several cities; nobody needs sixteen.
          Fuel type stays optional: that one is a genuine "any is fine". */}
      <p className="mt-4 text-xs font-bold text-slate-700">
        المدينة <span className="font-normal text-traffic-red">— مطلوبة</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {CITY_NAMES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cities.includes(c)}
            onClick={() => onCities(toggle(cities, c))}
            className={chip(cities.includes(c))}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="mt-5 text-xs font-bold text-slate-700">
        نوع الوقود <span className="font-normal text-slate-400">(اتركه فارغاً = الكل)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRODUCT_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={products.includes(p)}
            onClick={() => onProducts(toggle(products, p))}
            className={chip(products.includes(p))}
          >
            {PRODUCT_LABELS[p]}
          </button>
        ))}
      </div>
    </>
  );
}
