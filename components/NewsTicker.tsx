'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import type { StationWithStatus } from '@/types/database';

// Headlines come from the station data the page already loaded — no extra
// query and no separate "news" table to keep in sync.
function headlines(stations: StationWithStatus[]): string[] {
  const byRecency = [...stations].sort((a, b) => {
    const at = a.products.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '');
    const bt = b.products.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '');
    return bt.localeCompare(at);
  });

  const items: string[] = [];
  for (const s of byRecency) {
    const available = s.products.filter((p) => p.is_available);
    if (available.length) {
      items.push(
        `${s.name}: ${available.map((p) => PRODUCT_LABELS[p.product]).join(' و ')} متوفر الآن`
      );
    }
  }

  for (const s of [...stations].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)) {
    items.push(`محطة جديدة على المنصة: ${s.name}`);
  }

  return items.length ? items : ['لا توجد تحديثات جديدة حالياً'];
}

export function NewsTicker({ stations }: { stations: StationWithStatus[] }) {
  const items = headlines(stations);
  // rendered twice so the marquee loops without a visible gap
  const loop = [...items, ...items];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-600 bg-brand-700 text-white">
      <div className="flex items-stretch">
        <span className="z-10 flex shrink-0 items-center bg-brand-900 px-3 text-xs font-bold">
          آخر التحديثات
        </span>
        <div className="overflow-hidden py-2">
          <div className="flex animate-ticker items-center whitespace-nowrap">
            {loop.map((text, i) => {
              // items[0] is the most recently updated station — flag it as breaking
              const urgent = i % items.length === 0;
              return (
                <span key={i} className="flex shrink-0 items-center">
                  {urgent && (
                    <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-[11px] font-extrabold">
                      عاجل
                    </span>
                  )}
                  <span
                    className={`text-xs ${urgent ? 'font-extrabold text-red-200' : 'font-medium text-white'}`}
                  >
                    {text}
                  </span>
                  <span aria-hidden className="mx-8 text-white/30">
                    ◆
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
