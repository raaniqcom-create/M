'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import type { StationWithStatus } from '@/types/database';

// Builds headlines from the same station data the page already loaded — no
// extra query, no separate "news" table to keep in sync.
function headlines(stations: StationWithStatus[]): string[] {
  const items: string[] = [];

  for (const s of stations) {
    const available = s.products.filter((p) => p.is_available);
    if (available.length) {
      items.push(`${s.name}: ${available.map((p) => PRODUCT_LABELS[p.product]).join(' و ')} متوفر الآن`);
    }
  }

  const newest = [...stations]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
  for (const s of newest) items.push(`محطة جديدة على المنصة: ${s.name}`);

  return items.length ? items : ['لا توجد تحديثات جديدة حالياً'];
}

export function NewsTicker({ stations }: { stations: StationWithStatus[] }) {
  const items = headlines(stations);
  // duplicated so the marquee wraps without a visible gap
  const line = [...items, ...items].join('   •   ');

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-600 bg-brand-700 text-white">
      <div className="flex items-center">
        <span className="z-10 shrink-0 bg-brand-900 px-3 py-2 text-xs font-bold">
          آخر التحديثات
        </span>
        <div className="overflow-hidden py-2">
          <p className="animate-ticker whitespace-nowrap text-xs font-medium">{line}</p>
        </div>
      </div>
    </div>
  );
}
