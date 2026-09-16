import { formatTime, isOpenNow, timeToMinutes } from './hours.ts';
import { plural } from './freshness.ts';

/** «غسيل» — دليلُ مغاسل السيارات وحجزُ المواعيد. قسمٌ منفصلٌ عن الوقود تماماً.
 *
 *  `active` يفتح القسمَ للجمهور (القائمةُ الجانبيّة والفهرسة)؛ قبله يبقى خلف
 *  `AdminOnly` كما بدأ «مساعد الطريق». */
export const WASH = {
  active: false,
  /** أيّامُ الحجز المسبق الافتراضيّة — الفعليّةُ من wash_config (الإدارة تضبطها). */
  horizonDays: { subscriber: 3, guest: 1 },
} as const;

/** أنواعُ الخدمة: المغاسلُ الآن، وغيرُها حين يتّسع القسمُ إلى «خدمات السيارات». */
export const KIND_LABELS: Record<string, string> = { car_wash: 'مغسلة سيارات' };

/** مزايا الباقة كما في wash_plans.features — الأصفارُ تعني «بلا حدّ». */
export interface WashFeatures {
  booking_monthly_limit?: number;
  gallery_limit?: number;
  staff_limit?: number;
  offers_enabled?: boolean;
  featured?: boolean;
  analytics?: boolean;
  sms_monthly_limit?: number;
}

export interface WashPlan {
  code: string;
  name: string;
  price_iqd: number;
  features: WashFeatures;
  sort?: number;
  public?: boolean;
  active?: boolean;
}

/** ما تردّه wash_config(): الباقاتُ العامّة وحدودُ الحجز. */
export interface WashConfig {
  plans: WashPlan[];
  promo_first_month: number;
  trial_days: number;
  grace_days: number;
  cancel_free_min: number;
  horizon_guest: number;
  horizon_sub: number;
}

export const EMPTY_WASH_CONFIG: WashConfig = {
  plans: [],
  promo_first_month: 0,
  trial_days: 0,
  grace_days: 3,
  cancel_free_min: 30,
  horizon_guest: WASH.horizonDays.guest,
  horizon_sub: WASH.horizonDays.subscriber,
};

export interface WashPayment {
  id: string;
  wash_id: string;
  plan: string;
  amount_iqd: number;
  days: number;
  note: string | null;
  created_at: string;
}

export const planOf = (cfg: Pick<WashConfig, 'plans'> | null, code: string): WashPlan | undefined =>
  cfg?.plans.find((p) => p.code === code);

export const planName = (cfg: Pick<WashConfig, 'plans'> | null, code: string): string =>
  planOf(cfg, code)?.name ?? (code === 'free' ? 'مجّانيّة' : code);

/** سعرُ أوّل شهرٍ: عرضُ الإطلاق إن كان ولم تُسجَّل دفعةٌ قبلَه، وإلّا سعرُ الباقة. */
export function firstMonthPrice(plan: WashPlan, promo: number, paidBefore: boolean): number {
  return !paidBefore && promo > 0 && promo < plan.price_iqd ? promo : plan.price_iqd;
}

/** أيّامُ الاشتراك المتبقّية (سالبةٌ بعد الانتهاء)، أو null بلا اشتراك. */
export function daysLeft(paidUntil: string | null, now = Date.now()): number | null {
  if (!paidUntil) return null;
  return Math.round((Date.parse(paidUntil) - Date.parse(bgdDate(0, now))) / 86_400_000);
}

/** «٦٠ حجزاً شهريّاً» / «بلا حدّ». */
export const limitLabel = (n: number | undefined, unit: string): string =>
  n && n > 0 ? `${n.toLocaleString('ar-IQ')} ${unit}` : 'بلا حدّ';

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
  /** لا تستقبل حجوزاتٍ الآن (bookings_paused_until في المستقبل). */
  paused?: boolean;
  rating_avg?: number | null;
  rating_n?: number;
}

export interface WashReview {
  id?: string;
  booking_id?: string;
  wash_id: string;
  stars: number;
  comment: string | null;
  name: string | null;
  hidden?: boolean;
  created_at: string;
}

/** «★ ٤٫٥ · ١٢ تقييماً» أو null بلا تقييمات. */
export function ratingLine(avg: number | null | undefined, n: number | undefined): string | null {
  if (!n || avg == null) return null;
  return `★ ${Number(avg).toLocaleString('ar-IQ', { maximumFractionDigits: 1 })} · ${plural(n, 'تقييم واحد', 'تقييمان', 'تقييمات', 'تقييماً')}`;
}

export interface WashClosure {
  id: string;
  wash_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

/** حالةُ المغسلة كما تُقرأ على البطاقة: مغلقةٌ مؤقّتاً تغلب الإيقاف، والإيقافُ يغلب الدوام. */
export function washStatus(
  w: { temp_closed: boolean; paused?: boolean; is_24h: boolean; opens_at: string; closes_at: string }
): 'temp_closed' | 'paused' | 'open' | 'closed' {
  if (w.temp_closed) return 'temp_closed';
  if (w.paused) return 'paused';
  return isOpenNow(w) ? 'open' : 'closed';
}

/** صفُّ `car_washes` كما يراه صاحبُها والإدارة. */
export interface CarWash extends Omit<WashPublic, 'phone' | 'has_offer'> {
  owner_id: string;
  phone: string;
  phone_hidden: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  /** رمزُ الباقة في wash_plans (basic/pro/premium/free…). */
  plan: string;
  paid_until: string | null;
  admin_note: string | null;
  created_at: string;
  kind: string;
  owner_name: string | null;
  whatsapp: string | null;
  phone2: string | null;
  confirm_mode: 'manual' | 'auto';
  owner_device?: string | null;
  owner_platform?: 'ios' | 'android' | 'web' | null;
  bookings_paused_until?: string | null;
}

export interface WashService {
  id: string;
  wash_id: string;
  name: string;
  price: number;
  minutes: number;
  sort: number;
  active: boolean;
  /** أسعارٌ بنوع السيارة {sedan, suv, …} — اختياريّة. */
  prices?: Record<string, number> | null;
  description?: string | null;
}

export interface WashOffer {
  id: string;
  wash_id: string;
  title: string;
  ends_at: string | null;
  active: boolean;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'in_service'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'cancelled_by_business'
  | 'expired';

/** نشطٌ = ما زال يشغل مسرباً. */
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'arrived', 'in_service'];

/** الانتقالاتُ التي تسمح بها القاعدة (set_wash_booking_status) — للأزرار. */
export function nextStatuses(s: BookingStatus): BookingStatus[] {
  switch (s) {
    case 'pending':
      return ['confirmed', 'cancelled_by_business'];
    case 'confirmed':
      return ['arrived', 'completed', 'no_show', 'cancelled_by_business'];
    case 'arrived':
      return ['in_service', 'completed', 'no_show'];
    case 'in_service':
      return ['completed'];
    default:
      return [];
  }
}

/** ما يكتبه زرُّ الانتقال: فعلٌ لا حالة. */
export const ACTION_LABELS: Partial<Record<BookingStatus, string>> = {
  confirmed: 'تأكيد',
  arrived: 'وصل',
  in_service: 'بدأ الغسل',
  completed: 'تمّت',
  no_show: 'لم يحضر',
  cancelled_by_business: 'إلغاء',
};

export const VEHICLE_TYPES = ['sedan', 'suv', 'pickup', 'van', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_LABELS: Record<VehicleType, string> = { sedan: 'صالون', suv: 'دفع رباعيّ', pickup: 'بيك أب', van: 'فان', other: 'أخرى' };

/** أيمكن للمواطن إلغاءُ حجزه مجّاناً؟ (قبل الموعد بأكثر من الحدّ) — وبعده يُعلَّم متأخّراً. */
export function canCancel(startsAt: string, now = Date.now()): 'free' | 'late' | 'no' {
  const left = Date.parse(startsAt) - now;
  if (left <= 0) return 'no';
  return left >= 30 * 60_000 ? 'free' : 'late';
}

/** سعرُ الخدمة لنوع السيارة إن ذُكر، وإلّا سعرُها الأساسيّ. */
export function servicePrice(s: { price: number; prices?: Record<string, number> | null }, vehicle: string | null): number {
  const v = vehicle && s.prices ? s.prices[vehicle] : undefined;
  return typeof v === 'number' && v >= 0 ? v : s.price;
}

export interface WashBooking {
  id: string;
  code: string;
  wash_id: string;
  service_name: string;
  price: number;
  starts_at: string;
  ends_at?: string | null;
  name: string;
  phone: string;
  car: string | null;
  vehicle?: VehicleType | null;
  is_subscriber: boolean;
  use_free: boolean;
  walk_in?: boolean;
  late?: boolean;
  status: BookingStatus;
  created_at: string;
}

export const BOOKING_LABELS: Record<BookingStatus, string> = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكَّد',
  arrived: 'وصل',
  in_service: 'قيد الغسل',
  completed: 'تمّت',
  no_show: 'لم يحضر',
  cancelled: 'ألغاه الزبون',
  cancelled_by_business: 'ألغته المغسلة',
  expired: 'فات الموعد',
};

/** «٢٥٬٠٠٠ دينار». */
export const iqd = (n: number): string => `${n.toLocaleString('ar-IQ')} دينار`;

/** يومٌ بتقويم بغداد + n. */
export function bgdDate(plusDays = 0, now = Date.now()): string {
  return new Date(now + plusDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
}

/** أيّامُ الحجز المتاحة: اليومَ والغدَ لكلّ أحد، وحتى ثلاثة أيّامٍ للمشترك — والأرقامُ من الإدارة. */
export function bookingDays(
  subscriber: boolean,
  now = Date.now(),
  horizon: { guest: number; subscriber: number } = WASH.horizonDays
): { day: string; locked: boolean }[] {
  const max = Math.max(horizon.subscriber, horizon.guest);
  const open = subscriber ? horizon.subscriber : horizon.guest;
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
