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
  temp_closed?: boolean;
}): boolean {
  // An owner who shut for an incident or maintenance overrides the timetable:
  // sending drivers to a closed forecourt because the clock says "open" is
  // exactly the wasted trip this platform exists to prevent.
  if (station.temp_closed) return false;
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

/** How long an availability claim stays believable.
 *
 *  A station that announced petrol five days ago is not making a claim about
 *  today — yet the chip reads exactly the same as one updated ten minutes ago.
 *  A driver burns real fuel on that difference, which is the one thing this
 *  platform exists to prevent. Past this window the product is still listed,
 *  but never as available. */
export const FRESH_HOURS = 24;

export function isFresh(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age >= 0 && age < FRESH_HOURS * 3600_000;
}

/** «قبل ٣ ساعات» / «قبل يومين» — the age of the claim, in the driver's words. */
export function ageLabel(updatedAt: string | null | undefined): string {
  if (!updatedAt) return 'غير معروف';
  const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'قبل يوم' : `قبل ${days} أيام`;
}
