import type { FuelProduct, TrafficLevel } from '@/types/database';

// single source of truth for the 6 fixed products — mirrors the fuel_product
// enum in supabase/schema.sql
export const PRODUCT_LABELS: Record<FuelProduct, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

export const PRODUCT_ORDER: FuelProduct[] = [
  'gasoline_regular',
  'gasoline_premium',
  'gasoline_super',
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

// Relative wording beats a bare date on a phone: "غداً" is instantly readable,
// "2026-08-07" needs a mental calculation.
export function expectedLabel(isoDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (days < 0) return 'متوقع';
  if (days === 0) return 'متوقع اليوم';
  if (days === 1) return 'متوقع غداً';
  if (days === 2) return 'متوقع بعد غد';
  return `متوقع خلال ${days} أيام`;
}

// Built from local date parts, not toISOString(): that converts to UTC first,
// so "tomorrow" silently becomes "today" for any timezone ahead of UTC once the
// local clock passes the offset — exactly Iraq's case.
export function isoDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** كم تبقى حالة الازدحام التي يحدّدها صاحب المحطة صالحة. */
export const MANUAL_TRAFFIC_MINUTES = 30;

/** الحالة التي تُعرض فعلاً، أو لا شيء.
 *
 *  تحديد صاحب المحطة يتقدّم على تصويت الناس ما دام طازجاً — فهو واقف في
 *  الساحة ويراها. لكنه ينتهي: حالةٌ حُدِّدت صباحاً ولم تُمسّ بعدها تصف صباحاً
 *  انتهى، وكانت تحجب التصويت الحيّ لتقول ذلك. تصويت المستخدمين يسقط بعد ٣٠
 *  دقيقة، فتحديد المالك يسقط بعدها أيضاً — العدل نفسه للطرفين.
 *
 *  manual_traffic_set_at كان يُكتب ولا يُقرأ في أي موضع. هذه أول قراءة له. */
export function activeTrafficLevel(
  station: {
    manual_traffic_level?: TrafficLevel | null;
    manual_traffic_set_at?: string | null;
  },
  votes?: { majority_level?: TrafficLevel | null } | null
): TrafficLevel | null {
  const setAt = station.manual_traffic_set_at
    ? new Date(station.manual_traffic_set_at).getTime()
    : 0;
  const stillFresh = setAt > 0 && Date.now() - setAt < MANUAL_TRAFFIC_MINUTES * 60_000;
  if (stillFresh && station.manual_traffic_level) return station.manual_traffic_level;
  return votes?.majority_level ?? null;
}
