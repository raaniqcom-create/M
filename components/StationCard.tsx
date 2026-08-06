import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  expectedLabel,
} from '@/lib/products';
import { hoursLabel, isOpenNow, PERIOD_LABELS } from '@/lib/hours';
import type { StationWithStatus } from '@/types/database';
import { KIND_LABELS, KIND_STYLES } from '@/lib/stationMeta';
import { BellButton } from './BellButton';
import { TrafficVote } from './TrafficVote';
import { MapPinIcon, PhoneIcon } from './icons';

export function StationCard({ station }: { station: StationWithStatus }) {
  const byProduct = new Map(station.products.map((p) => [p.product, p]));
  const open = isOpenNow(station);
  // an owner's manual setting overrides the crowd average
  const level = station.manual_traffic_level ?? station.traffic?.majority_level ?? null;

  return (
    <article className="card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold">{station.name}</h2>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[station.kind]}`}
            >
              {KIND_LABELS[station.kind]}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                open ? 'bg-brand-100 text-brand' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {open ? 'مفتوحة' : 'مغلقة'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {station.city} — {station.address}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {level ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
              >
                <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
                {TRAFFIC_LABELS[level]}
                {station.manual_traffic_level && ' (من المحطة)'}
              </span>
            ) : (
              <span className="text-xs text-slate-400">لا توجد بيانات ازدحام</span>
            )}
            {station.distanceKm !== undefined && (
              <span className="text-xs text-slate-400">{station.distanceKm.toFixed(1)} كم</span>
            )}
          </div>
        </div>
        <BellButton stationId={station.id} />
      </header>

      {/* Only what a driver can act on: in stock, or announced as arriving.
          A wall of struck-through "not available" chips is noise. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {PRODUCT_ORDER.map((product) => {
          const row = byProduct.get(product);
          if (!row) return null;
          const inStock = row.is_available && open;
          const expected = row.expected_at;
          if (!inStock && !expected) return null;

          return (
            <li
              key={product}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                inStock ? 'bg-brand-100 text-brand' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {PRODUCT_LABELS[product]}
              {!inStock && expected && (
                <span className="mr-1 font-bold">
                  · {expectedLabel(expected)}
                  {row.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {!open && (
        <p className="mt-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
          المحطة مغلقة الآن · أوقات العمل {hoursLabel(station)}
        </p>
      )}

      <p className="sr-only">
        المتوفر:{' '}
        {PRODUCT_ORDER.filter((p) => byProduct.get(p)?.is_available)
          .map((p) => PRODUCT_LABELS[p])
          .join('، ') || 'لا شيء'}
      </p>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <TrafficVote stationId={station.id} traffic={station.traffic} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`tel:${station.phone}`} className="btn-ghost">
          <PhoneIcon className="h-4 w-4" />
          اتصال
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
        >
          <MapPinIcon className="h-4 w-4" />
          الطريق
        </a>
      </div>
    </article>
  );
}
