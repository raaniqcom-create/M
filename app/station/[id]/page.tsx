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
import { TrafficVote } from '@/components/TrafficVote';
import { StationLive } from '@/components/StationLive';
import { FollowStation } from '@/components/FollowStation';
import type { Station, StationProduct } from '@/types/database';

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
  // The view nulls a hidden phone and filters to approved itself, so the
  // number never reaches the prerendered HTML for a station that hid it.
  const { data: station } = await db
    .from('stations_public')
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

  // No traffic here at all. This read was `manual ?? majority` — raw, skipping
  // both the 30-minute expiry and the closed-station guard — and its only
  // consumer (the share description) stopped using it when traffic was pulled
  // out of the preview. A raw traffic read left lying around is the next bug.
  void traffic;

  return { station, available, rows };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getStation(id);
  if (!result) return { title: 'المحطة غير موجودة' };

  const { station, available } = result;
  const products = available.length
    ? available.map((p) => PRODUCT_LABELS[p]).join(' · ')
    : 'لا يوجد وقود متوفر حالياً';
  // بلا ازدحام: الصفحة ملف ثابت، فالحالة تُكتب لحظة البناء وتبقى أياماً —
  // و«الازدحام: خفيف» في معاينة المشاركة قد تكون كذباً عمره ثلاثة أيام.
  const description = `المتوفر: ${products}`;

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

  // Products and the open/closed line moved into StationLive: both were
  // computed here at build time, and both are wrong by the time anyone reads
  // the page — availability because the owner changes it, hours because
  // isOpenNow() reads the clock.
  const { station, rows } = result;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <article className="card p-5">
        <h1 className="text-lg font-extrabold">{station.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{station.address}</p>

        {/* Directly under the name, above everything else: this is the question
            people open a station page holding, and the page having no answer to
            it is why they went off and registered the station instead. */}
        <FollowStation stationId={station.id} city={station.city} />

        {/* Written but never mounted until now, so the traffic on every station
            page could only ever come from its owner. The people standing in it
            are the ones who know. */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <TrafficVote
            stationId={station.id}
            manualLevel={station.manual_traffic_level}
            manualSetAt={station.manual_traffic_set_at}
            lat={station.lat}
            lng={station.lng}
            hours={{
              is_24h: station.is_24h,
              opens_at: station.opens_at,
              closes_at: station.closes_at,
              temp_closed: station.temp_closed,
            }}
          />
        </div>

        <StationLive station={station} initial={rows} />

        <div className={`mt-5 grid gap-2 ${station.phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {station.phone && (
            <a href={`tel:${station.phone}`} className="btn-ghost">
              <PhoneIcon className="h-4 w-4" />
              اتصال
            </a>
          )}
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
