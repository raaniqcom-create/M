import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  activeTrafficLevel,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  expectedLabel,
} from '@/lib/products';
import { ageLabel, hoursLabel, isFresh, isOpenNow, PERIOD_LABELS } from '@/lib/hours';
import { agoLabel } from '@/lib/freshness';
import type { StationWithStatus } from '@/types/database';
import { KIND_LABELS, KIND_STYLES } from '@/lib/stationMeta';
import { RouteButton } from './RouteButton';
import { StarIcon } from './icons';
import { MapPinIcon, PhoneIcon } from './icons';

export function StationCard({
  station,
  isFavorite,
  onToggleFavorite,
  tinted = false,
}: {
  station: StationWithStatus;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Every other card sits on a faint green wash. White-on-white cards in a
   *  scrolling list read as one long block; the tint gives the eye an edge. */
  tinted?: boolean;
}) {
  const byProduct = new Map(station.products.map((p) => [p.product, p]));
  const open = isOpenNow(station);
  // an owner's manual setting overrides the crowd average
  // تحديد المالك يسقط بعد ٣٠ دقيقة كما يسقط تصويت الناس
  const level = activeTrafficLevel(station, station.traffic);

  return (
    <article className={`card p-4 ${tinted ? 'border-brand-100 bg-brand-50/60' : ''}`}>
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
            {level && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
              >
                <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
                {TRAFFIC_LABELS[level]}
                {station.manual_traffic_level
                  ? ' · من المحطة'
                  : agoLabel(station.traffic?.last_vote_at) && ` · ${agoLabel(station.traffic?.last_vote_at)}`}
              </span>
            )}
            {station.distanceKm !== undefined && (
              <span className="text-xs text-slate-400">{station.distanceKm.toFixed(1)} كم</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-200 ${
                isFavorite
                  ? 'border-amber-400 bg-amber-50 text-amber-500'
                  : 'border-slate-200 bg-white text-slate-400'
              }`}
            >
              <StarIcon filled={isFavorite} />
            </button>
          )}
        </div>
      </header>

      {/* Only what a driver can act on: in stock, or announced as arriving.
          A wall of struck-through "not available" chips is noise. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {PRODUCT_ORDER.map((product) => {
          const row = byProduct.get(product);
          if (!row) return null;
          // A five-day-old "available" is not a claim about today.
          const inStock = row.is_available && open && isFresh(row.updated_at);
          const expected = row.expected_at;
          if (!inStock && !expected) return null;

          return (
            <li
              key={product}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                inStock ? 'bg-brand-100 text-brand' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {/* The queue belongs to the pump, not the forecourt: premium can
                  be backed up while regular is free, and one colour for the
                  whole station sends a driver away from a free pump. */}
              {(() => {
                const lane = station.productTraffic?.find((t) => t.product === product);
                return lane?.majority_level ? (
                  <span
                    title={`الازدحام: ${TRAFFIC_LABELS[lane.majority_level]}`}
                    className={`h-2 w-2 shrink-0 rounded-full ${TRAFFIC_COLORS[lane.majority_level].dot}`}
                  />
                ) : null;
              })()}
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

      {/* Say plainly that nobody has reported yet, rather than showing a card
          with a blank gap where the fuel chips belong. */}
      {!PRODUCT_ORDER.some((p) => {
        const row = byProduct.get(p);
        return row && ((row.is_available && open) || row.expected_at);
      }) && (
        <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
          لم تُحدَّث حالة الوقود بعد
        </p>
      )}

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


      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`tel:${station.phone}`} className="btn-ghost">
          <PhoneIcon className="h-4 w-4" />
          اتصال
        </a>
        <RouteButton lat={station.lat} lng={station.lng} stationId={station.id} stationName={station.name} />
      </div>
    </article>
  );
}
