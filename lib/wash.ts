import { formatTime, timeToMinutes } from './hours.ts';
import { plural } from './freshness.ts';

/** «غسيل» — دليلُ مغاسل السيارات وحجزُ المواعيد. قسمٌ منفصلٌ عن الوقود تماماً.
 *
 *  `active` يفتح القسمَ للجمهور (القائمةُ الجانبيّة والفهرسة)؛ قبله يبقى خلف
 *  `AdminOnly` كما بدأ «مساعد الطريق». */
export const WASH = {
  active: false,
  /** الاشتراكُ الشهريُّ لصاحب المغسلة — يُعرض في صفحة التسجيل. */
  monthlyIqd: 25_000,
  /** أيّامُ الحجز المسبق: للمشترك، ولغيره. */
  horizonDays: { subscriber: 3, guest: 1 },
} as const;

/** صفُّ `washes_public` كما يقرؤه المواطن. */
export interface WashPublic {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  image_url: string | null;
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed: boolean;
  bays: number;
  slot_minutes: number;
  loyalty_target: number;
  phone: string | null;
  has_offer: boolean;
}

/** صفُّ `car_washes` كما يراه صاحبُها والإدارة. */
export interface CarWash extends Omit<WashPublic, 'phone' | 'has_offer'> {
  owner_id: string;
  phone: string;
  phone_hidden: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  plan: 'monthly' | 'quarterly' | 'free';
  paid_until: string | null;
  admin_note: string | null;
  created_at: string;
}

export interface WashService {
  id: string;
  wash_id: string;
  name: string;
  price: number;
  minutes: number;
  sort: number;
  active: boolean;
}

export interface WashOffer {
  id: string;
  wash_id: string;
  title: string;
  ends_at: string | null;
  active: boolean;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';

export interface WashBooking {
  id: string;
  code: string;
  wash_id: string;
  service_name: string;
  price: number;
  starts_at: string;
  name: string;
  phone: string;
  car: string | null;
  is_subscriber: boolean;
  use_free: boolean;
  status: BookingStatus;
  created_at: string;
}

export const BOOKING_LABELS: Record<BookingStatus, string> = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكَّد',
  completed: 'تمّت',
  no_show: 'لم يحضر',
  cancelled: 'مُلغى',
};

export const PLAN_LABELS: Record<CarWash['plan'], string> = {
  monthly: 'شهريّ',
  quarterly: 'ربع سنويّ',
  free: 'مجّانيّ',
};

/** «٢٥٬٠٠٠ دينار». */
export const iqd = (n: number): string => `${n.toLocaleString('ar-IQ')} دينار`;

/** يومٌ بتقويم بغداد + n. */
export function bgdDate(plusDays = 0, now = Date.now()): string {
  return new Date(now + plusDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
}

/** أيّامُ الحجز المتاحة: اليومَ والغدَ لكلّ أحد، وحتى ثلاثة أيّامٍ للمشترك. */
export function bookingDays(subscriber: boolean, now = Date.now()): { day: string; locked: boolean }[] {
  const max = WASH.horizonDays.subscriber;
  const open = subscriber ? WASH.horizonDays.subscriber : WASH.horizonDays.guest;
  return Array.from({ length: max + 1 }, (_, i) => ({ day: bgdDate(i, now), locked: i > open }));
}

/** «اليوم» / «غداً» / «الخميس ١٨/٩». */
export function dayLabel(day: string, now = Date.now()): string {
  if (day === bgdDate(0, now)) return 'اليوم';
  if (day === bgdDate(1, now)) return 'غداً';
  return new Date(`${day}T12:00:00`).toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

/** شبكةُ المواعيد ليومٍ (مرآةُ wash_slots في القاعدة) — للعرض قبل وصول العدّ،
 *  وللاختبار. الدوامُ قد يعبر منتصفَ الليل. */
export function slotGrid(
  w: { is_24h: boolean; opens_at: string; closes_at: string; slot_minutes: number },
  minMinute = -1
): string[] {
  const open = w.is_24h ? 0 : timeToMinutes(w.opens_at);
  const close = w.is_24h ? 1440 : timeToMinutes(w.closes_at);
  const out: string[] = [];
  for (let m = 0; m < 1440; m += w.slot_minutes) {
    const inside = w.is_24h || (close > open ? m >= open && m < close : m >= open || m < close);
    if (!inside || m < minMinute) continue;
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

/** «١٠:٣٠ صباحاً». */
export const slotLabel = (slot: string): string => formatTime(slot.length === 5 ? `${slot}:00` : slot);

/** بطاقةُ الغسلات: «٣ من ٥ — بعد غسلتين واحدةٌ مجّانيّة». */
export function loyaltyLine(stamps: number, target: number, free: number): string | null {
  if (target <= 0) return null;
  if (free > 0) return `لك ${plural(free, 'غسلةٌ مجّانيّة', 'غسلتان مجّانيّتان', 'غسلات مجّانيّة', 'غسلة مجّانيّة')} 🎉`;
  const left = target - stamps;
  return `${stamps} من ${target} — بعد ${plural(left, 'غسلة واحدة', 'غسلتين', 'غسلات', 'غسلة')} واحدةٌ مجّانيّة`;
}

export const bookingHref = (code: string, phone: string) =>
  `/wash/booking/?code=${encodeURIComponent(code)}&p=${encodeURIComponent(phone)}`;

/** رسالةُ واتساب من المواطن إلى المغسلة برمز حجزه. */
export function whatsappBooking(washPhone: string, b: { code: string; name: string; service_name: string; starts_at: string; car: string | null }): string {
  const core = washPhone.replace(/\D/g, '').replace(/^(00)?964/, '').replace(/^0+/, '');
  const when = new Date(b.starts_at).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const text = `السلام عليكم، حجزتُ عبر المحطة التقنية — رمز الحجز ${b.code}\n${b.name} · ${b.service_name} · ${when}${b.car ? ` · ${b.car}` : ''}`;
  return `https://wa.me/964${core}?text=${encodeURIComponent(text)}`;
}

/** «حجوزاتي» على هذا الجهاز — مرآةٌ محلّيّة، لا قراءةَ لـanon من القاعدة. */
const MINE = 'wash-bookings';
export function rememberBooking(b: { code: string; phone: string; wash_id: string; wash: string; starts_at: string }): void {
  try {
    const all = readMyBookings().filter((x) => x.code !== b.code);
    all.unshift(b);
    localStorage.setItem(MINE, JSON.stringify(all.slice(0, 20)));
  } catch {
    /* تصفّحٌ خاصّ */
  }
}
export function readMyBookings(): { code: string; phone: string; wash_id: string; wash: string; starts_at: string }[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
