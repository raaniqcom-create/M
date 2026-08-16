import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  expectedLabel,
} from '@/lib/products';
import { hoursLabel, isOpenNow, PERIOD_LABELS } from '@/lib/hours';
import { MapPinIcon, PhoneIcon } from '@/components/icons';
import { RouteButton } from '@/components/RouteButton';
import { ComplaintButton } from '@/components/ComplaintButton';
import type { Station, StationProduct, TrafficLevel } from '@/types/database';

// server-side anon client: same RLS rules, but usable during SSR for OG tags
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Static export: every approved station gets a prerendered page with its own
// share preview. Stations added later are handled by the not-found fallback,
// which resolves them in the browser until the next build.
export const dynamicParams = false;

export async function generateStaticParams() {
  // see app/[slug]/page.tsx — is_demo hides a station from the list, it does
  // not mean the station has no page
  const { data } = await db
    .from('stations')
    .select('id')
    .eq('status', 'approved');
  const params = (data ?? []).map(({ id }) => ({ id }));
  // a static export must emit at least one path for a dynamic route
  return params.length ? params : [{ id: 'none' }];
}

async function getStation(id: string) {
  const { data: station } = await db
    .from('stations')
    .select('*')
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle<Station>();

  if (!station) return null;

  const [{ data: products }, { data: traffic }] = await Promise.all([
    db.from('station_products').select('*').eq('station_id', id),
    db.from('station_traffic_avg').select('majority_level').eq('station_id', id).maybeSingle(),
  ]);

  const rows = (products ?? []) as StationProduct[];
  const available = rows.filter((p) => p.is_available).map((p) => p.product);

  const level: TrafficLevel | null =
    station.manual_traffic_level ?? (traffic?.majority_level as TrafficLevel | null) ?? null;

  return { station, available, rows, level };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getStation(id);
  if (!result) return { title: 'المحطة غير موجودة' };

  const { station, available, level } = result;
  const products = available.length
    ? available.map((p) => PRODUCT_LABELS[p]).join(' · ')
    : 'لا يوجد وقود متوفر حالياً';
  const description = `المتوفر: ${products}${level ? ` — الازدحام: ${TRAFFIC_LABELS[level]}` : ''}`;

  return {
    title: station.name,
    description,
    openGraph: { title: station.name, description, type: 'website', locale: 'ar_IQ' },
  };
}

export default async function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getStation(id);
  if (!result) notFound();

  const { station, rows, level } = result;
  const byProduct = new Map(rows.map((r) => [r.product, r]));
  const open = isOpenNow(station);
  // an availability claim older than a day is listed, never promised

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <article className="card p-5">
        <h1 className="text-lg font-extrabold">{station.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{station.address}</p>

        {level && (
          <span
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text}`}
          >
            <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
            الازدحام: {TRAFFIC_LABELS[level]}
          </span>
        )}

        <h2 className="mt-5 text-sm font-bold">المنتجات</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {PRODUCT_ORDER.map((product) => {
            const row = byProduct.get(product);
            const inStock = row?.is_available ?? false;
            const expected = row?.expected_at ?? null;

            return (
              <li key={product} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span>{PRODUCT_LABELS[product]}</span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    inStock
                      ? 'bg-brand-100 text-brand'
                      : expected
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {inStock
                    ? 'متوفر'
                    : expected
                      ? `${expectedLabel(expected)}${row?.expected_period ? ` ${PERIOD_LABELS[row.expected_period]}` : ''}`
                      : 'غير متوفر'}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {open ? `مفتوحة الآن · ${hoursLabel(station)}` : `مغلقة الآن · أوقات العمل ${hoursLabel(station)}`}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <a href={`tel:${station.phone}`} className="btn-ghost">
            <PhoneIcon className="h-4 w-4" />
            اتصال
          </a>
          <RouteButton lat={station.lat} lng={station.lng} stationId={station.id} stationName={station.name} />
        </div>

        <ComplaintButton stationId={station.id} />
      </article>

      <a href="/" className="btn-primary mt-4 w-full">
        عرض كل المحطات
      </a>
    </main>
  );
}
