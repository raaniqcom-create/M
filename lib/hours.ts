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
  if (station.is_24h) return 'مفتوحة 24 ساعة';
  return `${formatTime(station.opens_at)} — ${formatTime(station.closes_at)}`;
}

/** Where this station stands right now, in one line, in both directions.
 *
 *  The card used to print «المحطة مغلقة الآن · أوقات العمل 6:00 صباحاً — 7:00 مساءً»
 *  beside a «مغلقة» pill driven by the same boolean — the state twice, and a
 *  timetable where the reader wanted an answer — and printed nothing at all
 *  while open, so the line simply vanished exactly when the station was worth
 *  driving to.
 *
 *  Three tones, because the useful sentence differs:
 *    closed  — when it opens. The reader is deciding whether to wait.
 *    soon    — how long is left. At 18:45 «تغلق 7:00 مساءً» is a timetable;
 *              «تغلق بعد 15 دقيقة» is a decision. This is the one a driver
 *              needs and the old card never had.
 *    open    — when it closes, so the trip can be planned against it.
 *
 *  Two states the old line got wrong outright and this does not: a temporarily
 *  shut station printed its normal hours as if they explained the closure, and
 *  a 24-hour station shut by its owner printed «مغلقة الآن · أوقات العمل
 *  مفتوحة 24 ساعة», a sentence that contradicts itself. */
export const CLOSING_SOON_MINUTES = 60;

/** Arabic counts its nouns differently at 1, 2, 3-10 and 11+. «بعد 1 دقيقة»
 *  is what a template produces; it is not what a person writes. */
function minutesLabel(n: number): string {
  if (n <= 1) return 'دقيقة';
  if (n === 2) return 'دقيقتين';
  if (n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

export function statusNote(station: {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed?: boolean;
}): { text: string; tone: 'open' | 'soon' | 'closed' } {
  if (station.temp_closed) return { text: 'مغلقة مؤقتاً', tone: 'closed' };
  if (station.is_24h) return { text: 'مفتوحة 24 ساعة', tone: 'open' };

  const now = baghdadMinutesNow();
  const opens = timeToMinutes(station.opens_at);
  const closes = timeToMinutes(station.closes_at);
  const open =
    closes > opens ? now >= opens && now < closes : now >= opens || now < closes;

  if (!open) return { text: `مغلقة · تفتح الساعة ${formatTime(station.opens_at)}`, tone: 'closed' };

  // Wrap-aware: a station closing at 01:00 is 90 minutes away at 23:30, not
  // minus 1350.
  const left = (closes - now + 1440) % 1440;
  if (left <= CLOSING_SOON_MINUTES) return { text: `تغلق بعد ${minutesLabel(left)}`, tone: 'soon' };
  return { text: `مفتوحة · تغلق الساعة ${formatTime(station.closes_at)}`, tone: 'open' };
}

/** الحالة مقسومةً: شارةٌ تُلمح، وجملةٌ تُقرأ.
 *
 *  البطاقة كانت تعرض الشارة ومعها المدى خاماً — «مغلقة» ثم «6:00 صباحاً –
 *  9:00 مساءً». والمدى صحيحٌ ولا يُجيب: من يقف أمام محطةٍ مغلقة يسأل «متى
 *  تفتح؟» لا «ما دوامها؟»، ومن يقف أمام مفتوحةٍ يسأل «كم بقي؟».
 *
 *  فالجملة تقول الجواب المباشر وحده، وتُشتقّ من statusNote نفسها — فلا
 *  تنحرف عنها صفحةُ المحطة بعد شهر. */
export function openingLine(station: {
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed?: boolean;
}): { badge: string; detail: string; tone: 'open' | 'soon' | 'closed' } {
  const s = statusNote(station);
  if (station.temp_closed) return { badge: 'مغلقة مؤقتاً', detail: 'حتى تُعلن المحطة عودتها', tone: 'closed' };
  if (station.is_24h) return { badge: 'مفتوحة', detail: 'على مدار 24 ساعة', tone: 'open' };
  // «تغلق بعد ٢٥ دقيقة» جملةٌ كاملة بلا شارة تسبقها — وهي الحالة التي
  // تُغيّر قراراً، فتُعرض كما هي.
  if (s.tone === 'soon') return { badge: 'مفتوحة', detail: s.text, tone: 'soon' };
  const [badge, ...rest] = s.text.split(' · ');
  return { badge, detail: rest.join(' · '), tone: s.tone };
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

/** ومتى يُسحب الادّعاء لا يُشاخ وحسب.
 *
 *  `FRESH_HOURS` تُسقط الأخضر بعد يوم، فيبقى المنتج معروضاً رماديّاً ومعه
 *  عمرُه — وهو الصواب ليومٍ أو يومين: خبرٌ قديمٌ صريحُ القِدَم أنفعُ من لا شيء.
 *
 *  **لكنه بعد يومين لم يعد خبراً.** محطةٌ في اللوحة لم تُلمس منذ عشرة أيام،
 *  وأربعٌ بين يومين وأسبوع؛ وشريحتُها الرمادية تقول «بانزين · قبل ١٠ أيام»،
 *  وهي جملةٌ لا تحمل معلومةً يبني عليها مسافرٌ قراراً. فتُسحب.
 *
 *  والسحبُ عرضٌ لا حذف: `is_available` باقيةٌ في القاعدة كما تركها صاحبُها،
 *  و`updated_at` لا تُلمس — فضغطةُ «أكّد التوفّر» تُعيد كلَّ شيء في لحظة.
 *  ولذلك يُقال لصاحبها إنها سُحبت، وإلا اختفى وهو لا يدري. */
export const WITHDRAW_HOURS = 48;

export function isWithdrawn(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() >= WITHDRAW_HOURS * 3600_000;
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
