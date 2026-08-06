// Station hours are Baghdad local clock times. Everything here works from the
// station's clock, not the viewer's device — a driver abroad checking on
// family, or a phone with the wrong timezone, must still see the truth.
const BAGHDAD = 'Asia/Baghdad';

export type ExpectedPeriod = 'morning' | 'afternoon' | 'evening';

export const PERIOD_LABELS: Record<ExpectedPeriod, string> = {
  morning: 'الصباح',
  afternoon: 'العصر',
  evening: 'المساء',
};

export const PERIODS: ExpectedPeriod[] = ['morning', 'afternoon', 'evening'];

/** Minutes since midnight, right now, in Baghdad. */
export function baghdadMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** "HH:MM[:SS]" -> minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export function isOpenNow(station: {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
}): boolean {
  if (station.is_24h) return true;

  const now = baghdadMinutesNow();
  const open = timeToMinutes(station.opens_at);
  const close = timeToMinutes(station.closes_at);

  // a shift that ends after midnight (e.g. 18:00 → 02:00) wraps the day
  return close > open ? now >= open && now < close : now >= open || now < close;
}

/** "06:00:00" -> "6:00 صباحاً" */
export function formatTime(time: string): string {
  const total = timeToMinutes(time);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'صباحاً' : 'مساءً';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function hoursLabel(station: {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
}): string {
  if (station.is_24h) return 'مفتوحة ٢٤ ساعة';
  return `${formatTime(station.opens_at)} — ${formatTime(station.closes_at)}`;
}

/**
 * 12-hour selection -> "HH:MM". Midnight and noon are the two cases that break
 * naive conversions: 12 صباحاً is hour 0, 12 مساءً is hour 12.
 */
export function to24Hour(hour12: number, minute: string, isMorning: boolean): string {
  const hour24 = isMorning ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}
