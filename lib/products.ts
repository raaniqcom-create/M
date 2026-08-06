import type { FuelProduct, TrafficLevel } from '@/types/database';

// single source of truth for the 6 fixed products — mirrors the fuel_product
// enum in supabase/schema.sql
export const PRODUCT_LABELS: Record<FuelProduct, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

export const PRODUCT_ORDER: FuelProduct[] = [
  'gasoline_regular',
  'gasoline_premium',
  'kerosene',
  'gas',
  'lpg',
  'white_oil',
];

export const TRAFFIC_LABELS: Record<TrafficLevel, string> = {
  green: 'خفيف',
  yellow: 'متوسط',
  red: 'مزدحم',
};

// full class strings — Tailwind can't see dynamically-built names
export const TRAFFIC_COLORS: Record<
  TrafficLevel,
  { dot: string; bg: string; text: string; border: string }
> = {
  green: {
    dot: 'bg-traffic-green',
    bg: 'bg-green-50',
    text: 'text-traffic-green',
    border: 'border-traffic-green',
  },
  yellow: {
    dot: 'bg-traffic-yellow',
    bg: 'bg-yellow-50',
    text: 'text-traffic-yellow',
    border: 'border-traffic-yellow',
  },
  red: {
    dot: 'bg-traffic-red',
    bg: 'bg-red-50',
    text: 'text-traffic-red',
    border: 'border-traffic-red',
  },
};

export function stationShareText(
  name: string,
  available: FuelProduct[],
  traffic: TrafficLevel | null
): string {
  const products = available.length
    ? available.map((p) => PRODUCT_LABELS[p]).join(' · ')
    : 'لا يوجد وقود متوفر حالياً';
  const trafficLine = traffic ? `\nالازدحام: ${TRAFFIC_LABELS[traffic]}` : '';
  return `⛽ ${name}\nالمتوفر: ${products}${trafficLine}`;
}
