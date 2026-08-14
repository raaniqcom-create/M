'use client';

import { PRODUCT_LABELS } from '@/lib/products';
import { isOpenNow } from '@/lib/hours';
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
    if (!isOpenNow(s)) continue;
    const available = s.products.filter((p) => p.is_available);
    if (available.length) {
      items.push(
        `${s.name}: ${available.map((p) => PRODUCT_LABELS[p.product]).join(' و ')} متوفر الآن`
      );
    }
  }

  for (const s of [...stations]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3)) {
    items.push(`محطة جديدة على المنصة: ${s.name}`);
  }

  return items.length ? items : ['لا توجد تحديثات جديدة حالياً'];
}

const URGENT_COUNT = 3;

export function NewsTicker({ stations }: { stations: StationWithStatus[] }) {
  const items = headlines(stations);

  // The track holds the list twice and slides exactly one copy's width (-50%).
  // At the end the second copy sits where the first started, so the loop is
  // seamless — sliding by 100% instead would skip half the headlines.
  const track = [...items, ...items];

  // ~7 seconds of reading time per headline, regardless of how many there are
  const duration = Math.max(20, items.length * 7);

  return (
    <div className="fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)] z-40 border-t border-brand-600 bg-brand-700 text-white">
      <div className="flex items-stretch">
        <span className="z-10 flex shrink-0 items-center bg-brand-900 px-3 text-xs font-bold">
          آخر التحديثات
        </span>

        {/* dir must sit on the clipping wrapper: under RTL it anchors an
            oversized child to its RIGHT edge, pushing the whole track off
            screen. LTR anchors it left, so sliding left pulls the next headline
            in from the right — the side an Arabic sentence begins on. Each
            headline keeps its own RTL context so the text renders correctly. */}
        <div dir="ltr" className="relative flex-1 overflow-hidden py-2">
          <div
            className="flex w-max animate-ticker items-center whitespace-nowrap"
            style={{ animationDuration: `${duration}s` }}
          >
            {track.map((text, i) => {
              // the three freshest updates in each copy carry the breaking flag
              const urgent = i % items.length < URGENT_COUNT;
              return (
                <span key={i} dir="rtl" className="flex shrink-0 items-center">
                  {urgent && (
                    <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-[11px] font-extrabold">
                      عاجل
                    </span>
                  )}
                  <span
                    className={`text-xs ${urgent ? 'font-extrabold text-red-100' : 'font-medium text-white'}`}
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
