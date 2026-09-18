// «غسيل» — بوتُ «محطة الغسل»: الأجزاءُ الصرفة، بلا شبكةٍ ولا قاعدة.
//
// رموزُ الأزرار (callback_data ≤ 64 بايت)، الأقربُ بهافرسين، أيّامُ الحجز، لوحاتُ المفاتيح،
// وسطرُ الحجز. تُستورد من wash-bot (المعالج) وwash-tick (أزرارُ الإشعار) وتُفحص من node:
//   node scripts/test-wash-bot.mjs
// لا يُستورد lib/stations.ts (يجرّ عميلَ المتصفّح) — هافرسين ثمانيةُ أسطر.
import { ANBAR_CITIES } from '../../../lib/cities.ts';
import { ACTION_LABELS, BOOKING_LABELS, at12, bgdDate, dayLabel, nextStatuses, type BookingStatus } from '../../../lib/wash.ts';

/** رمزُ الحالة في الزرّ: حرفان بدل الاسم كي يتّسع المعرّفُ معه. */
export const ST = { ok: 'confirmed', no: 'cancelled_by_business', ar: 'arrived', in: 'in_service', dn: 'completed', ns: 'no_show' } as const;
export type StCode = keyof typeof ST;
export const ST_CODE = Object.fromEntries(Object.entries(ST).map(([k, v]) => [v, k])) as Record<(typeof ST)[StCode], StCode>;

/** «w:» + الأجزاءُ بنقطتين — ويرمي فوق ٦٤ بايتاً (حدُّ تيليجرام) لا يرسل زرّاً ميّتاً. */
export const cb = (...parts: (string | number)[]): string => {
  const s = `w:${parts.join(':')}`;
  if (new TextEncoder().encode(s).length > 64) throw new Error(`callback_data > 64: ${s}`);
  return s;
};
export const parseCb = (s: string): string[] | null => (s.startsWith('w:') ? s.slice(2).split(':') : null);

/** المسافةُ بالكيلومتر (هافرسين). */
export function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** الأقربُ ضمن km، مرتّبةً تصاعديّاً، أوّلُ n. */
export function nearest<T extends { lat: number; lng: number }>(rows: T[], lat: number, lng: number, km = 30, n = 8): (T & { km: number })[] {
  return rows
    .map((w) => ({ ...w, km: distKm(lat, lng, w.lat, w.lng) }))
    .filter((w) => w.km <= km)
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** أيّامُ الحجز المفتوحة: اليومَ وحتى الأفق (بتقويم بغداد). */
export const openDays = (horizon: number, now = Date.now()): string[] =>
  Array.from({ length: Math.max(0, horizon) + 1 }, (_, i) => bgdDate(i, now));

/** صفوفُ الأزرار: per في الصفّ. */
export const rows = <T>(items: T[], per: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, i * per + per));

type Btn = { text: string; callback_data: string };
export type InlineKb = { inline_keyboard: Btn[][] };

/** أزرارُ صاحب المغسلة تحت الحجز: الانتقالاتُ التي تسمح بها القاعدة، زرّان في الصفّ. */
export const ownerButtons = (b: { id: string; status: BookingStatus }): InlineKb => ({
  inline_keyboard: rows(nextStatuses(b.status).map((s) => ({ text: ACTION_LABELS[s] ?? s, callback_data: cb('st', ST_CODE[s as (typeof ST)[StCode]], b.id) })), 2),
});

/** خمسُ نجومٍ في صفٍّ واحد — تُرسلها wash-tick مع «اكتملت الخدمة». */
export const starButtons = (code: string): InlineKb => ({
  inline_keyboard: [[1, 2, 3, 4, 5].map((n) => ({ text: `${n} ⭐`, callback_data: cb('r', code, n) }))],
});

/** أزرارُ المدن بفهرسها في ANBAR_CITIES (لا بالاسم: الاسمُ العربيُّ يأكل البايتات). */
export const cityButtons = (names: string[], per = 2): InlineKb => ({
  inline_keyboard: rows(
    ANBAR_CITIES.map((c, i) => ({ c, i })).filter(({ c }) => names.includes(c.name)).map(({ c, i }) => ({ text: c.name, callback_data: cb('c', i) })),
    per
  ),
});

// وسمٌ لم يُهرَّب يُسقط الرسالةَ كلَّها (400 can't parse entities) — نسخةُ telegram/index.ts.
export const esc = (v: string | null | undefined): string =>
  (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** سطرا الحجز: «<b>المغسلة</b> · الخدمة» ثمّ «اليوم 4:00 PM · #482113 · مؤكَّد». */
export const bookingLine = (b: { wash: string; service_name: string; starts_at: string; code: string; status: BookingStatus }, now = Date.now()): string =>
  `<b>${esc(b.wash)}</b> · ${esc(b.service_name)}\n${dayLabel(bgdDate(0, Date.parse(b.starts_at)), now)} ${at12(b.starts_at)} · #${b.code} · ${BOOKING_LABELS[b.status] ?? b.status}`;
