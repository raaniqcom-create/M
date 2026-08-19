import { supabase } from './supabase';
import type {
  ProductTraffic,
  Station,
  StationProduct,
  StationTrafficAvg,
  StationWithStatus,
} from '@/types/database';

// haversine — Ramadi-scale distances, a projection library would be overkill
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The public station list.
 *
 *  Reads `stations_public`, the view that returns null for a phone its owner
 *  chose to hide and that filters to approved stations itself. There is no
 *  fallback to the table: anon no longer holds SELECT on it, so a fallback
 *  would only turn one error into two. */
export async function loadStations(): Promise<StationWithStatus[]> {
  const [stationsRes, productsRes, trafficRes, laneRes] = await Promise.all([
    // Belt and braces on the status filter. Dropping it here because "the view
    // filters it" put every rejected and suspended station on the public list
    // the moment the view shipped without that WHERE — a live, visible fault.
    // Two cheap filters beat one clever assumption.
    supabase
      .from('stations_public')
      .select('*')
      .eq('status', 'approved')
      .eq('is_demo', false)
      .order('name'),
    supabase.from('station_products').select('*'),
    supabase.from('station_traffic_avg').select('*'),
    supabase.from('station_product_traffic').select('*'),
  ]);

  // supabase-js resolves with an error object instead of rejecting — without
  // this, a dropped connection is indistinguishable from an empty database
  const failure = stationsRes.error ?? productsRes.error ?? trafficRes.error ?? laneRes.error;
  if (failure) throw failure;

  const { data: stations } = stationsRes;
  const { data: products } = productsRes;
  const { data: traffic } = trafficRes;

  const productsByStation = new Map<string, StationProduct[]>();
  for (const p of (products ?? []) as StationProduct[]) {
    productsByStation.set(p.station_id, [...(productsByStation.get(p.station_id) ?? []), p]);
  }
  const trafficByStation = new Map(
    ((traffic ?? []) as StationTrafficAvg[]).map((t) => [t.station_id, t])
  );

  return ((stations ?? []) as Station[]).map((s) => ({
    ...s,
    products: productsByStation.get(s.id) ?? [],
    traffic: trafficByStation.get(s.id) ?? null,
    productTraffic: ((laneRes.data ?? []) as ProductTraffic[]).filter((t) => t.station_id === s.id),
  }));
}
