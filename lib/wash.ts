import { baghdadMinutesNow, isOpenNow, timeToMinutes } from './hours.ts';
import { plural } from './freshness.ts';

/** «غسيل» — دليلُ مغاسل السيارات وحجزُ المواعيد. قسمٌ منفصلٌ عن الوقود تماماً.
 *
 *  `active` يفتح القسمَ للجمهور (القائمةُ الجانبيّة والفهرسة)؛ قبله يبقى خلف
 *  `AdminOnly` كما بدأ «مساعد الطريق». */
export const WASH = {
  /** محلّيّاً (next dev) مفتوحٌ بلا حساب؛ التصديرُ الساكن يبقيه خلف الإدارة. */
  active: process.env.NODE_ENV === 'development',
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
  /** أقصى عددِ سياراتٍ في الطلب الواحد (wash_max_cars_order) — العدّادُ يقف عنده. */
  max_cars_order: number;
}

export const EMPTY_WASH_CONFIG: WashConfig = {
  plans: [],
  promo_first_month: 0,
  trial_days: 0,
  grace_days: 3,
  cancel_free_min: 30,
  horizon_guest: WASH.horizonDays.guest,
  horizon_sub: WASH.horizonDays.subscriber,
  max_cars_order: 5,
};

/** يضمن أنّ رأسَ المصادقة لُصق بعميل PostgREST قبل أوّل كتابةٍ بعد التسجيل/الدخول.
 *
 *  supabase-js يحدّث Authorization على عميل REST من خلال onAuthStateChange، وهو
 *  يُطلَق على macrotask بعد أن تعود signUp/signInWithPassword. فأوّلُ insert يليها
 *  مباشرةً قد يخرج بمفتاح anon (auth.uid()=null) فيرفضه RLS بـ42501 — ويبقى
 *  حسابٌ بلا مغسلة. الانتظارُ حتى تصل جلسةٌ بـtoken يُثبّت الرأسَ أوّلاً.
 *
 *  (يُمرَّر عميلُ supabase حجّةً كي لا تستورد lib/wash.ts الصرفةُ العميلَ.) */
export async function awaitAuthReady(
  client: { auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> } },
  tries = 20
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) {
      // نبضةٌ إضافيّة كي يلتقط مستمعُ onAuthStateChange الجلسةَ ويضبط الرأس.
      await new Promise((r) => setTimeout(r, 0));
      return true;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
}

export interface WashPayment {
  id: string;
  wash_id: string;
  plan: string;
  amount_iqd: number;
  days: number;
  note: string | null;
  created_at: string;
  /** claimed = إيصالٌ بانتظار التدقيق؛ paid = دفعةٌ مسجَّلة؛ rejected = رُفض (20260929). */
  status?: 'claimed' | 'paid' | 'rejected';
  method?: 'zaincash' | 'qicard' | 'later' | null;
  /** مسارٌ في حاوية wash-receipts الخاصّة — يُوقَّع عند العرض (createSignedUrl)، لا رابطٌ عامّ. */
  receipt_path?: string | null;
  admin_note?: string | null;
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

/** «60 حجز شهريّاً» / «بلا حدّ» — الأرقامُ إنجليزيّة في القسم كلِّه. */
export const limitLabel = (n: number | undefined, unit: string): string =>
  n && n > 0 ? `${n.toLocaleString('en-US')} ${unit}` : 'بلا حدّ';

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
  thumb_url?: string | null;
  photos?: string[];
  from_price?: number | null;
  featured?: boolean;
  /** المنطقةُ داخل المدينة («شارع 60») — تُعرض «الرمادي – شارع 60». */
  area?: string | null;
  /** لها إعلانُ «محطة مموَّلة» نشطٌ الآن (wash_ads kind=station) — تتصدّر ووسمُها «إعلان». */
  sponsored?: boolean;
  /** أقربُ موعدٍ حرٍّ اليوم «HH:MM» من wash_next_slot_all() — undefined قبل الجلب، null بلا موعد. */
  next_slot?: string | null;
  distanceKm?: number | null;
}

/** إعلانٌ من لوحة الإدارة (wash_ads_public): بانر في الرئيسية، أو محطةٌ مموَّلة تتصدّر، أو عرضٌ مموَّل في «عروض اليوم». */
export interface WashAd {
  id: string;
  kind: 'banner' | 'station' | 'offer';
  title: string;
  description: string | null;
  image_url: string | null;
  url: string | null;
  wash_id: string | null;
  offer_id: string | null;
  city: string | null;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  /** مموَّلٌ = يظهر عليه وسمُ «إعلان» الصغير. */
  sponsored: boolean;
  active?: boolean;
  created_at?: string;
}

/** ترتيبُ الدليل: الممَوَّلةُ (إعلان) ثمّ المميّزةُ (بشارة)، ثمّ الأقربُ إن عُرف الموقع، ثمّ الأعلى تقييماً، ثمّ الاسم. */
export function rankWashes<T extends { featured?: boolean; sponsored?: boolean; rating_avg?: number | null; rating_n?: number; name: string; distanceKm?: number | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(!!b.sponsored) - Number(!!a.sponsored) ||
      Number(!!b.featured) - Number(!!a.featured) ||
      (a.distanceKm != null && b.distanceKm != null ? a.distanceKm - b.distanceKm : 0) ||
      (Number(b.rating_avg ?? 0) * Math.min(b.rating_n ?? 0, 10)) - (Number(a.rating_avg ?? 0) * Math.min(a.rating_n ?? 0, 10)) ||
      a.name.localeCompare(b.name, 'ar')
  );
}

/** «حسابك مكتمل ٨٠٪» وما ينقص — دافعٌ لا حكم (§85). */
export function profileCompletion(
  w: { image_url: string | null; address: string; owner_name?: string | null; owner_device?: string | null; photos?: string[]; loyalty_target: number },
  services: number
): { pct: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!w.image_url, 'أضف صورة الغلاف'],
    [services > 0, 'أضف خدماتك وأسعارها'],
    [services > 1, 'أضف خدمةً ثانية'],
    [!!w.owner_device, 'فعّل الإشعارات لتصلك الحجوزات'],
    [!!w.owner_name, 'اكتب اسم صاحب المغسلة'],
    [(w.photos?.length ?? 0) > 0, 'أضف صوراً إلى المعرض'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, m]) => m) };
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

/** «★ 4.8 · 127 تقييم» أو null بلا تقييمات. */
export function ratingLine(avg: number | null | undefined, n: number | undefined): string | null {
  const p = ratingParts(avg, n);
  return p ? `★ ${p.avg} · ${p.count}` : null;
}

/** التقييمُ مفصولاً للبطاقة: «4.8» و«127 تقييم». */
export function ratingParts(avg: number | null | undefined, n: number | undefined): { avg: string; count: string } | null {
  if (!n || avg == null) return null;
  return { avg: Number(avg).toFixed(1), count: `${n.toLocaleString('en-US')} ${n === 1 ? 'تقييم' : n === 2 ? 'تقييمان' : n <= 10 ? 'تقييمات' : 'تقييم'}` };
}

/** «1.8 km» / «12 km» — بعدُ المغسلة عن القارئ. */
export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  return ltr(`${km < 10 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km))} km`);
}

/** «25%». */
export const pct = (n: number): string => `${n.toLocaleString('en-US')}%`;

/** «متبقّي 3 أيام» / «ينتهي اليوم» / null بلا نهاية. */
export function offerLeft(endsAt: string | null | undefined, now = Date.now()): string | null {
  if (!endsAt) return null;
  const d = Math.round((Date.parse(`${endsAt.slice(0, 10)}T12:00:00+03:00`) - Date.parse(`${bgdDate(0, now)}T12:00:00+03:00`)) / 86_400_000);
  if (d < 0) return 'انتهى';
  if (d === 0) return 'ينتهي اليوم';
  return `متبقّي ${plural(d, 'يوم واحد', 'يومان', 'أيام', 'يوماً')}`;
}

/* ── المفضّلة — على هذا الجهاز فقط (لا حسابَ للمواطن) ────────────────────── */
const FAVS = 'wash-favs';
export function readFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAVS) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
/** يقلب المفضّلةَ ويعيد الحالةَ الجديدة. */
export function toggleFav(id: string): boolean {
  const all = readFavs();
  const on = !all.includes(id);
  try {
    localStorage.setItem(FAVS, JSON.stringify(on ? [id, ...all].slice(0, 100) : all.filter((x) => x !== id)));
  } catch {
    /* تصفّحٌ خاصّ */
  }
  return on;
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

/** الشارةُ الكاملة (§ الحالات الستّ): مفتوحة / مغلقة / مزدحمة / متاحة / الحجوزات متوقّفة / ممتلئة اليوم.
 *  `nextSlot` من wash_next_slot_all(): null = لا موعدَ حرّاً اليوم، undefined = لم يُجلب بعد. */
export type WashBadge = 'open' | 'available' | 'busy' | 'full' | 'paused' | 'closed' | 'temp_closed';
export function washBadge(
  w: { temp_closed: boolean; paused?: boolean; is_24h: boolean; opens_at: string; closes_at: string },
  nextSlot: string | null | undefined,
  now = Date.now()
): WashBadge {
  const s = washStatus(w);
  if (s !== 'open') return s;
  if (nextSlot === undefined) return 'open';
  if (nextSlot === null) return 'full';
  const wait = timeToMinutes(nextSlot) - baghdadMinutesNow();
  if (wait <= 45) return 'available';
  if (wait >= 120) return 'busy';
  void now;
  return 'open';
}
export const BADGE_LABELS: Record<WashBadge, string> = {
  open: 'مفتوحة الآن',
  available: 'متاحة',
  busy: 'مزدحمة',
  full: 'ممتلئة اليوم',
  paused: 'الحجوزات متوقّفة',
  closed: 'مغلقة',
  temp_closed: 'مغلقة مؤقّتاً',
};
/** ألوانُ الشارة — هويّةُ المنصّة: أخضرُ للمفتوح، كهرمانيٌّ للتحذير، رماديٌّ للمغلق. */
export const BADGE_TONE: Record<WashBadge, string> = {
  open: 'bg-brand-50 text-brand-700',
  available: 'bg-brand-50 text-brand-700',
  busy: 'bg-amber-50 text-amber-800',
  full: 'bg-amber-50 text-amber-800',
  paused: 'bg-slate-100 text-slate-600',
  closed: 'bg-slate-100 text-slate-500',
  temp_closed: 'bg-red-50 text-red-700',
};

/** «تغلق الساعة 11:00 PM» / «تفتح الساعة 8:00 AM» / «24 ساعة». */
export function hoursLine(w: { is_24h: boolean; opens_at: string; closes_at: string; temp_closed?: boolean }): string {
  if (w.is_24h) return 'مفتوحة 24 ساعة';
  return isOpenNow(w) ? `تغلق الساعة ${time12(w.closes_at)}` : `تفتح الساعة ${time12(w.opens_at)}`;
}

/** نصٌّ لاتينيٌّ معزولٌ اتّجاهيّاً: «9:00 AM» داخل فقرةٍ عربيّة كان يُرسَم «AM 9:00» لأنّ الأرقامَ
 *  ضعيفةُ الاتّجاه — LRI…PDI تجعله جزيرةً تُقرأ من اليسار أينما وُضع، بلا dir على كلّ عنصر. */
export const ltr = (s: string): string => `⁦${s}⁩`;

/** «HH:MM[:SS]» → «3:30 PM» — الأرقامُ إنجليزيّة (طلبُ صاحب المنصّة). */
export function time12(t: string): string {
  const m = timeToMinutes(t);
  const h = Math.floor(m / 60) % 24;
  return ltr(`${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
}
/** timestamptz → «4:00 PM» بتوقيت بغداد. */
export function at12(iso: string): string {
  return time12(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}
/** «السبت 19 سبتمبر» بأرقامٍ إنجليزيّة — من يومٍ «YYYY-MM-DD» أو timestamptz. */
export function dateLine(v: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  const d = v.length === 10 ? new Date(`${v}T12:00:00+03:00`) : new Date(v);
  return d.toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', ...opts });
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
  thumb_url?: string | null;
  photos?: string[];
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
  description?: string | null;
  starts_at?: string | null;
  service_id?: string | null;
  offer_price?: number | null;
  discount_pct?: number | null;
  max_redemptions?: number | null;
  per_user_limit?: number | null;
}

/** سعرُ الخدمة بعد العرض — مرآةُ book_wash للمعاينة قبل الحجز. */
export function offerPrice(base: number, o: Pick<WashOffer, 'offer_price' | 'discount_pct'> | null | undefined): number {
  if (!o) return base;
  if (o.offer_price != null) return o.offer_price;
  if (o.discount_pct != null) return Math.round((base * (100 - o.discount_pct)) / 100);
  return base;
}

/** أيسري العرضُ على هذه الخدمة في هذا اليوم؟ */
export function offerApplies(o: WashOffer, serviceId: string, day: string): boolean {
  if (!o.active) return false;
  if (o.service_id && o.service_id !== serviceId) return false;
  if (o.starts_at && o.starts_at > day) return false;
  if (o.ends_at && o.ends_at < day) return false;
  return true;
}

/** مفتاحُ أيقونةِ الخدمة من اسمها — الأسماءُ حرّةٌ في القاعدة، فتُطابَق بالكلمات. */
export type ServiceIconKey = 'exterior' | 'full' | 'interior' | 'polish' | 'wax' | 'seats' | 'other';
const SERVICE_WORDS: [ServiceIconKey, string[]][] = [
  ['full', ['شامل', 'كامل']],
  ['interior', ['داخلي', 'داخليّ', 'تنظيف داخلي']],
  ['polish', ['تلميع', 'بولش', 'بوليش']],
  ['wax', ['شمع', 'واكس', 'نانو', 'سيراميك']],
  ['seats', ['مقاعد', 'كراسي', 'فرش', 'سجاد']],
  ['exterior', ['خارجي', 'خارجيّ', 'غسيل', 'غسل']],
];
export function serviceIconKey(name: string): ServiceIconKey {
  for (const [key, words] of SERVICE_WORDS) if (words.some((w) => name.includes(w))) return key;
  return 'other';
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

/** نشطٌ = ما زال يشغل خانةً. */
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

/** صورةُ الحجم: صورةٌ فوتوغرافيّةٌ في public/vehicles/<type>.png للأحجام الثلاثة.
 *  و«أخرى» بلا صورة — ظلٌّ مرسومٌ عمداً كي تُقرأ مخرجاً لا حجماً رابعاً. */
export const REAL_VEHICLE_PHOTOS = true;
export const vehiclePhoto = (v: VehicleType): string => `/vehicles/${v}.png`;
/** أللحجم صورةٌ فوتوغرافيّة؟ «أخرى» لا. */
export const hasVehiclePhoto = (v: VehicleType): boolean => v !== 'other' && REAL_VEHICLE_PHOTOS;

/** أحجامُ السيارة — ثلاثةٌ بصورةٍ و«أخرى» مخرجاً. الترتيبُ هو ترتيبُ العرض والإدراج. */
export const VEHICLE_TYPES = ['small', 'mid', 'large', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_LABELS: Record<VehicleType, string> = {
  small: 'سيارة صغيرة',
  mid: 'سيارة وسط',
  large: 'سيارة كبيرة',
  other: 'أخرى',
};
/** سطرٌ صغيرٌ تحت العنوان يحسم ما يندرج تحت كلّ حجم — التسمياتُ تختلف بين الناس. */
export const VEHICLE_HINT: Record<VehicleType, string> = {
  small: 'صالون · كوبيه · هاتشباك',
  mid: 'دفع رباعيّ · كروس أوفر',
  large: 'فان · 7 ركّاب · بيك أب',
  other: 'حمل · باص · غير ذلك',
};
/** جملةُ الطمأنة أسفلَ بطاقات الحجم. */
export const SIZE_NOTE = 'سيتم تحديد السعر النهائي حسب نوع الخدمة والمحطة المختارة';

/* ── الحجمُ المختارُ يُحفظ على الجهاز: يُسأل مرّةً ثمّ تُملأ الخطوةُ تلقائياً ──────── */
const SIZE_KEY = 'wash-size';
export function rememberSize(counts: VehicleCounts): void {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(counts));
  } catch {
    /* تصفّحٌ خاصّ */
  }
}
export function readSize(): VehicleCounts {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}') as Record<string, unknown>;
    const out: VehicleCounts = {};
    for (const k of VEHICLE_TYPES) {
      const n = Number(v?.[k]);
      if (Number.isFinite(n) && n > 0) out[k] = Math.min(20, Math.floor(n));
    }
    return out;
  } catch {
    return {};
  }
}

/** أيمكن للمواطن إلغاءُ حجزه مجّاناً؟ (قبل الموعد بأكثر من الحدّ) — وبعده يُعلَّم متأخّراً. */
/* ── عدّادُ السيارات: طلبٌ واحدٌ لعدّة سيارات ──────────────────────────────── */

/** كم سيّارةً من كلّ نوع في هذا الطلب. */
export type VehicleCounts = Partial<Record<VehicleType, number>>;

export const totalCars = (c: VehicleCounts): number => VEHICLE_TYPES.reduce((n, v) => n + (c[v] ?? 0), 0);

/** العدّادُ مبسوطاً قائمةً: {sedan:2, suv:1} → ['sedan','sedan','suv'] — ترتيبُ VEHICLE_TYPES. */
export const carsList = (c: VehicleCounts): VehicleType[] =>
  VEHICLE_TYPES.flatMap((v) => Array.from({ length: Math.max(0, c[v] ?? 0) }, () => v));

/** «سيّارتان» / «3 سيارات» — عنوانُ الملخّص. */
export const carsLabel = (n: number): string => plural(n, 'سيّارة واحدة', 'سيّارتان', 'سيارات', 'سيّارة');

/** مجموعُ سعرِ الطلب: سعرُ الخدمة لكلّ نوعٍ مضروباً بعدده (والعرضُ يسري على كلّ سيّارة). */
export function orderTotal(
  service: { price: number; prices?: Record<string, number> | null },
  counts: VehicleCounts,
  offer?: Pick<WashOffer, 'offer_price' | 'discount_pct'> | null
): number {
  return carsList(counts).reduce((sum, v) => sum + offerPrice(servicePrice(service, v), offer), 0);
}

/** سيّارةٌ محجوزةٌ ضمن الطلب — ما يردّه book_wash_group. */
export interface BookedCar {
  code: string;
  vehicle: VehicleType | null;
  starts_at: string;
  price: number;
  status: BookingStatus;
}

export interface BookedGroup {
  group_key: string;
  wash: string;
  wash_id: string;
  wash_phone: string | null;
  service: string;
  cars: BookedCar[];
}

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

/** «25,000 د.ع» — الأرقامُ إنجليزيّة (طلبُ صاحب المنصّة). */
export const iqd = (n: number): string => `${n.toLocaleString('en-US')} د.ع`;

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

/** «اليوم» / «غداً» / «الخميس 18/9» — بأرقامٍ إنجليزيّة. */
export function dayLabel(day: string, now = Date.now()): string {
  if (day === bgdDate(0, now)) return 'اليوم';
  if (day === bgdDate(1, now)) return 'غداً';
  return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', weekday: 'long', day: 'numeric', month: 'numeric' });
}

/** خانةُ التقويم الأفقيّ: «اليوم / الخميس» و«غداً / الجمعة» و«السبت / 19». */
export function calendarCell(day: string, now = Date.now()): { top: string; bottom: string } {
  const d = new Date(`${day}T12:00:00+03:00`);
  const weekday = d.toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', weekday: 'long' });
  if (day === bgdDate(0, now)) return { top: 'اليوم', bottom: weekday };
  if (day === bgdDate(1, now)) return { top: 'غداً', bottom: weekday };
  return { top: weekday, bottom: d.toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', day: 'numeric', month: 'short' }) };
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

/** «10:30 AM» — الموعدُ بأرقامٍ إنجليزيّة. */
export const slotLabel = (slot: string): string => time12(slot);

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
  const when = `${dateLine(b.starts_at, { weekday: 'long' })} ${at12(b.starts_at)}`;
  const text = `السلام عليكم، حجزتُ عبر المحطة التقنية — رمز الحجز ${b.code}\n${b.name} · ${b.service_name} · ${when}${b.car ? ` · ${b.car}` : ''}`;
  return `https://wa.me/964${core}?text=${encodeURIComponent(text)}`;
}

/** «حجوزاتي» على هذا الجهاز — مرآةٌ محلّيّة، لا قراءةَ لـanon من القاعدة.
 *  الحالةُ تُجلب عند فتح الصفحة بـwash_my_bookings(codes, phone). */
export interface MyBooking {
  code: string;
  phone: string;
  wash_id: string;
  wash: string;
  starts_at: string;
  service?: string;
  price?: number;
  status?: BookingStatus;
  /** سياراتُ الطلب الواحد تتشارك المفتاح — تُعرض بطاقةً واحدة. */
  group_key?: string | null;
  vehicle?: VehicleType | null;
}
const MINE = 'wash-bookings';
export function rememberBooking(b: MyBooking): void {
  try {
    const all = readMyBookings().filter((x) => x.code !== b.code);
    all.unshift(b);
    localStorage.setItem(MINE, JSON.stringify(all.slice(0, 20)));
  } catch {
    /* تصفّحٌ خاصّ */
  }
}
export function forgetBooking(code: string): void {
  try {
    localStorage.setItem(MINE, JSON.stringify(readMyBookings().filter((x) => x.code !== code)));
  } catch {
    /* تصفّحٌ خاصّ */
  }
}
export function readMyBookings(): MyBooking[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
