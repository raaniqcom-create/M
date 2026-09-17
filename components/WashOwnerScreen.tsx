'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { forgetLogin } from '@/lib/biometric';
import { ADMIN_WA, displayPhone, isValidIraqiMobile, normalizePhone } from '@/lib/phone';
import { num } from '@/lib/num';
import {
  ACTION_LABELS,
  ACTIVE_STATUSES,
  BOOKING_LABELS,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  at12,
  bgdDate,
  dateLine,
  dayLabel,
  daysLeft,
  nextStatuses,
  iqd,
  limitLabel,
  offerPrice,
  pct,
  planOf,
  profileCompletion,
  type BookingStatus,
  type CarWash,
  type VehicleType,
  type WashBooking,
  type WashClosure,
  type WashConfig,
  type WashOffer,
  type WashReview,
  type WashService,
} from '@/lib/wash';
import { pokeWashTick, useWashConfig } from '@/lib/washConfig';
import { IconGrid, type IconGridItem } from './IconGrid';
import { Sheet } from './Sheet';
import { TimeSelect } from './TimeSelect';
import { WashPhotoUpload } from './WashPhotoUpload';
import { WashDeviceLink } from './WashDeviceLink';
import { WashDashboard } from './WashDashboard';
import { WashStaff } from './WashStaff';
import { VehiclePicker } from './VehiclePicker';
import { CarThumb, asVehicle } from './WashBookingScreen';
import {
  CalendarIcon,
  CarIcon,
  EyeOffIcon,
  ImageIcon,
  LogOutIcon,
  PhoneIcon,
  PlusIcon,
  AlertTriangleIcon,
  ChartIcon,
  UserIcon,
  ShieldIcon,
  SpinnerIcon,
  StarIcon,
  StoreIcon,
  WhatsappIcon,
  XIcon,
} from './icons';

/** الحجزُ كما يُقرأ من الجدول: سياراتُ الطلب الواحد تتشارك group_key. */
type OwnerBooking = WashBooking & { group_key?: string | null };

type Tab = 'today' | 'tomorrow' | 'past';
type SheetKind = 'services' | 'offers' | 'hours' | 'profile' | 'photo' | 'pause' | 'walkin' | 'reviews' | 'stats' | 'staff' | null;

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'tomorrow', label: 'غداً' },
  { key: 'past', label: 'السابقة' },
];
const MINUTES = Array.from({ length: 8 }, (_, i) => (i + 1) * 15);
const SLOTS = [15, 30, 45, 60];
const LOYALTY = [0, 4, 5, 6, 8, 10];

/** بدايةُ يومٍ بغداديّ كحدٍّ لـtimestamptz. */
const dayStart = (day: string) => `${day}T00:00:00+03:00`;
const bookingDay = (b: WashBooking) => bgdDate(0, Date.parse(b.starts_at));
/** «19 أيلول 2026» — تاريخُ الاشتراك بأرقامٍ إنجليزيّة. */
const longDay = (d: string) => dateLine(d, { day: 'numeric', month: 'long', year: 'numeric' });
/** «18/9 4:00 PM» — لحظةٌ قصيرة بتوقيت بغداد. */
const shortAt = (iso: string) => `${dateLine(iso, { day: 'numeric', month: 'numeric' })} ${at12(iso)}`;
/** الحجزُ الذي لا يُحتسب إيراداً: أُلغي أو فات أو لم يحضر. */
const LOST: BookingStatus[] = ['cancelled', 'cancelled_by_business', 'expired', 'no_show'];

const PILL: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-brand-100 text-brand-800',
  arrived: 'bg-sky-100 text-sky-800',
  in_service: 'bg-sky-100 text-sky-800',
  completed: 'bg-slate-100 text-slate-600',
  no_show: 'bg-red-50 text-traffic-red',
  cancelled: 'bg-red-50 text-traffic-red',
  cancelled_by_business: 'bg-red-50 text-traffic-red',
  expired: 'bg-slate-100 text-slate-500',
};
/** زرُّ الانتقال: الأخضرُ للتقدّم، والرماديُّ للغياب، والأحمرُ للإلغاء. */
const ACTION_CLS: Partial<Record<BookingStatus, string>> = {
  confirmed: 'btn-primary',
  arrived: 'btn-primary',
  in_service: 'btn-primary',
  completed: 'btn-primary',
  no_show: 'btn-ghost',
  cancelled_by_business: 'btn-ghost text-traffic-red',
};

function banner(w: CarWash, today: string): { cls: string; text: string } {
  if (w.status === 'pending')
    return { cls: 'border-amber-300 bg-amber-50 text-amber-900', text: 'طلبك قيد المراجعة — سنتواصل معك لتفعيل الاشتراك' };
  if (w.status === 'rejected')
    return { cls: 'border-red-200 bg-red-50 text-traffic-red', text: `رُفض الطلب${w.admin_note ? ` — ${w.admin_note}` : ''}` };
  if (w.status === 'suspended') return { cls: 'border-red-200 bg-red-50 text-traffic-red', text: 'موقوفة من الإدارة' };
  if (w.paid_until && w.paid_until >= today) {
    const left = Math.round((Date.parse(w.paid_until) - Date.parse(today)) / 86_400_000);
    return { cls: 'border-brand-200 bg-brand-50 text-brand-800', text: `الاشتراك فعّال حتى ${longDay(w.paid_until)}${left <= 7 ? ' — يجدَّد قريباً' : ''}` };
  }
  return { cls: 'border-red-200 bg-red-50 text-traffic-red', text: 'انتهى الاشتراك — مغسلتك مخفيّة عن الزبائن حتى التجديد' };
}

/** بطاقةُ الاشتراك (§44): الباقةُ وسعرُها وانتهاؤها والمتبقّي وحدودُها وزرُّ التجديد. */
function SubscriptionCard({ wash, cfg }: { wash: CarWash; cfg: WashConfig | null }) {
  const plan = planOf(cfg, wash.plan);
  const left = daysLeft(wash.paid_until);
  const grace = cfg?.grace_days ?? 3;
  const f = plan?.features ?? {};
  const until = wash.paid_until ? longDay(wash.paid_until) : null;
  /** حجوزاتُ الشهر من wash_dashboard — العدُّ المحلّيّ (اليوم وغداً و50 سابقة) لا يكفي. */
  const [used, setUsed] = useState<{ used_bookings: number; limit: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const today = bgdDate(0);
    supabase
      .rpc('wash_dashboard', { p_wash: wash.id, p_from: `${today.slice(0, 7)}-01`, p_to: today })
      .then(({ data }) => {
        const s = (data as { subscription?: { used_bookings: number; limit: number } } | null)?.subscription;
        if (alive && s) setUsed(s);
      });
    return () => {
      alive = false;
    };
  }, [wash.id]);
  const renew = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(
    `السلام عليكم، أريد تجديد اشتراك مغسلة «${wash.name}» (${plan?.name ?? wash.plan}) في المحطة التقنية.`
  )}`;
  const tone =
    left === null || left < -grace ? 'border-red-200 bg-red-50' : left < 0 ? 'border-amber-300 bg-amber-50' : left <= 7 ? 'border-amber-200 bg-amber-50/60' : 'border-brand-200 bg-brand-50';
  return (
    <section className={`mt-3 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-slate-800">باقة {plan?.name ?? wash.plan}</p>
        {plan && <p className="text-[12px] font-bold text-slate-600">{iqd(plan.price_iqd)} / شهر</p>}
      </div>
      <p className="mt-1 text-[12px] text-slate-600">
        {left === null
          ? 'لم يُفعَّل الاشتراك بعد.'
          : left >= 0
            ? `فعّال حتى ${until} — بقي ${left} يوماً`
            : left >= -grace
              ? `انتهى في ${until} — فترة سماح ${grace} أيام، صفحتك لا تزال ظاهرة`
              : `انتهى في ${until} — مغسلتك مخفيّة عن الزبائن حتى التجديد`}
      </p>
      {plan && (
        <p className="mt-1 text-[11px] text-slate-500">
          {limitLabel(f.booking_monthly_limit, 'حجز شهريّاً')} · {limitLabel(f.gallery_limit, 'صور')} · {limitLabel(f.staff_limit, 'موظّفين')}
          {f.offers_enabled ? ' · العروض' : ''}
          {f.featured ? ' · ظهور مميّز' : ''}
        </p>
      )}
      {used && (
        <p className="mt-1 text-[11px] text-slate-500">
          حجوزات هذا الشهر: {num(used.used_bookings)}{used.limit > 0 ? ` من ${limitLabel(used.limit, 'حجز')}` : ' — بلا حدّ'}
        </p>
      )}
      {(f.sms_monthly_limit ?? 0) > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">رسائل SMS: {num(f.sms_monthly_limit)} شهرياً — تُفعَّل لاحقاً</p>
      )}
      {(left === null || left <= 7) && (
        <a href={renew} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 w-full text-xs">
          <WhatsappIcon className="h-4 w-4" />
          {left === null ? 'تفعيل الاشتراك عبر واتساب' : 'تجديد الاشتراك عبر واتساب'}
        </a>
      )}
    </section>
  );
}

/** لوحةُ صاحب المغسلة: الاشتراك، والحجوزات، وما يُضبط في أوراقٍ من أسفل. */
export function WashOwnerScreen() {
  const cfg = useWashConfig();
  const [auth, setAuth] = useState<'checking' | 'none' | 'ok'>('checking');
  /** ‎?id= — الإدارةُ تدخل لوحةَ أيّ مغسلة (التجريبيّةُ أوّلاً) لمتابعة الوضع بصفتها. */
  const viewId = useSearchParams().get('id');
  const [asAdmin, setAsAdmin] = useState(false);
  const [views, setViews] = useState<{ views: number; calls: number; routes: number } | null>(null);
  /** مالكٌ (أو إدارة) لا موظّف — الأوراقُ الحسّاسة تُخفى عن الموظّف. */
  const [owns, setOwns] = useState(true);
  const [wash, setWash] = useState<CarWash | null | undefined>(undefined);
  const [upcoming, setUpcoming] = useState<OwnerBooking[]>([]);
  const [past, setPast] = useState<OwnerBooking[]>([]);
  const [tab, setTab] = useState<Tab>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [services, setServices] = useState<WashService[]>([]);
  const [offers, setOffers] = useState<WashOffer[]>([]);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = bgdDate(0);

  const loadBookings = useCallback(async (washId: string) => {
    const t0 = dayStart(bgdDate(0));
    const [{ data: up }, { data: old }] = await Promise.all([
      supabase.from('wash_bookings').select('*').eq('wash_id', washId).gte('starts_at', t0).lt('starts_at', dayStart(bgdDate(2))).order('starts_at'),
      supabase.from('wash_bookings').select('*').eq('wash_id', washId).lt('starts_at', t0).order('starts_at', { ascending: false }).limit(50),
    ]);
    setUpcoming((up as OwnerBooking[] | null) ?? []);
    setPast((old as OwnerBooking[] | null) ?? []);
  }, []);

  const loadLists = useCallback(async (washId: string) => {
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.from('wash_services').select('*').eq('wash_id', washId).order('sort'),
      supabase.from('wash_offers').select('*').eq('wash_id', washId).order('ends_at', { ascending: true, nullsFirst: false }),
    ]);
    setServices((s as WashService[] | null) ?? []);
    setOffers((o as WashOffer[] | null) ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) return setAuth('none');
      setAuth('ok');
      let w: CarWash | null = null;
      if (viewId) {
        // سياسةُ الإدارة على car_washes تقرأ كلَّ الصفوف؛ غيرُها لا يرى إلّا مغسلتَه فيعود null.
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.session.user.id).maybeSingle();
        if (profile?.role === 'admin') {
          const { data: row } = await supabase.from('car_washes').select('*').eq('id', viewId).maybeSingle();
          w = (row as CarWash | null) ?? null;
          if (alive) setAsAdmin(!!w);
        }
      }
      if (!w) {
        const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
        w = (mine as CarWash | null) ?? null;
      }
      if (!alive) return;
      setWash(w);
      if (w) {
        await Promise.all([loadBookings(w.id), loadLists(w.id)]);
        const [{ data: v }, { data: o }] = await Promise.all([
          supabase.rpc('wash_views_for', { p_wash: w.id }),
          supabase.rpc('owns_wash', { p_wash: w.id }),
        ]);
        if (alive && v) setViews(v as { views: number; calls: number; routes: number });
        if (alive) setOwns(o !== false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadBookings, loadLists, viewId]);

  async function refresh() {
    if (!wash) return;
    setRefreshing(true);
    await loadBookings(wash.id);
    setRefreshing(false);
  }

  async function signOut() {
    await forgetLogin();
    await supabase.auth.signOut();
    window.location.href = '/wash/';
  }

  /** تعديلُ صفّ المغسلة — لا status/plan/paid_until/admin_note: المُشغّل يرفضها. */
  async function patchWash(p: Partial<CarWash>): Promise<boolean> {
    if (!wash) return false;
    setErr(null);
    const { error } = await supabase.from('car_washes').update(p).eq('id', wash.id);
    if (error) {
      setErr('تعذّر الحفظ. حاول مجدداً.');
      return false;
    }
    setWash({ ...wash, ...p });
    return true;
  }

  async function setStatus(id: string, status: BookingStatus) {
    if (!wash) return;
    setActing(id);
    setErr(null);
    const { error } = await supabase.rpc('set_wash_booking_status', { p_id: id, p_status: status });
    if (error) setErr(error.message.startsWith('لا يمكن') ? error.message : 'تعذّر تحديث الحجز. حاول مجدداً.');
    else pokeWashTick();
    await loadBookings(wash.id);
    setActing(null);
  }

  if (auth === 'checking' || (auth === 'ok' && wash === undefined)) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-7 w-7 text-brand" />
      </main>
    );
  }

  if (auth === 'none') {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-extrabold text-slate-800">سجّل الدخول أوّلاً</h1>
        <a href="/login/" className="btn-primary mt-6 w-full">
          تسجيل الدخول
        </a>
      </main>
    );
  }

  if (!wash) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-extrabold text-slate-800">لا مغسلة على هذا الحساب</h1>
        <a href="/wash/register/" className="btn-primary mt-6 w-full">
          سجّل مغسلتك
        </a>
        <button type="button" onClick={signOut} className="btn-ghost mt-2 w-full">
          تسجيل الخروج
        </button>
      </main>
    );
  }

  const paused = !!wash.bookings_paused_until && Date.parse(wash.bookings_paused_until) > Date.now();
  const rows = tab === 'past' ? past : upcoming.filter((b) => bookingDay(b) === bgdDate(tab === 'today' ? 0 : 1));
  const pendingCount = upcoming.filter((b) => b.status === 'pending').length;
  /** كم سيّارةً في كلّ طلب — عدّاً من الحجوزات المحمَّلة أصلاً، بلا نداءٍ جديد. */
  const groupSizes = new Map<string, number>();
  for (const b of [...upcoming, ...past]) if (b.group_key) groupSizes.set(b.group_key, (groupSizes.get(b.group_key) ?? 0) + 1);
  const note = banner(wash, today);
  /** إحصائيّاتُ اليوم من الحجوزات المجلوبة أصلاً — لا نداءَ إضافيّاً. */
  const todays = upcoming.filter((b) => bookingDay(b) === today);
  const now = Date.now();
  const todayStats: { label: string; value: string; wide?: boolean }[] = [
    { label: 'الحجوزات', value: num(todays.length) },
    { label: 'مكتملة', value: num(todays.filter((b) => b.status === 'completed').length) },
    { label: 'قادمة', value: num(todays.filter((b) => ACTIVE_STATUSES.includes(b.status) && Date.parse(b.starts_at) >= now).length) },
    { label: 'الإيراد المتوقع', value: iqd(todays.filter((b) => !LOST.includes(b.status)).reduce((s, b) => s + (b.use_free ? 0 : b.price), 0)), wide: true },
    { label: 'مشاهدات الصفحة', value: num(views?.views) },
  ];

  const grid: IconGridItem[] = [
    ...(owns
      ? ([
          { key: 'services', label: 'الخدمات', icon: CarIcon, onClick: () => setSheet('services') },
          { key: 'offers', label: 'العروض', icon: StarIcon, onClick: () => setSheet('offers') },
          { key: 'hours', label: 'الدوام والمسارب', icon: CalendarIcon, onClick: () => setSheet('hours') },
          { key: 'profile', label: 'بيانات المغسلة', icon: StoreIcon, onClick: () => setSheet('profile') },
          { key: 'photo', label: 'الصورة', icon: ImageIcon, onClick: () => setSheet('photo') },
          { key: 'staff', label: 'الموظّفون', icon: UserIcon, onClick: () => setSheet('staff') },
        ] as IconGridItem[])
      : []),
    { key: 'walkin', label: 'سيارة الآن', icon: PlusIcon, onClick: () => setSheet('walkin') },
    { key: 'reviews', label: 'التقييمات', icon: StarIcon, onClick: () => setSheet('reviews') },
    { key: 'stats', label: 'الإحصائيّات', icon: ChartIcon, onClick: () => setSheet('stats') },
    ...(owns
      ? ([
          {
            key: 'pause',
            label: paused ? 'الحجوزات متوقّفة' : 'إيقاف الحجوزات',
            icon: AlertTriangleIcon,
            tone: paused ? 'red' : undefined,
            onClick: () => setSheet('pause'),
          },
          {
            key: 'closed',
            label: wash.temp_closed ? 'مغلقة مؤقّتاً' : 'إغلاق مؤقّت',
            icon: XIcon,
            tone: wash.temp_closed ? 'red' : undefined,
            onClick: () => void patchWash({ temp_closed: !wash.temp_closed }),
          },
          {
            key: 'phone',
            label: wash.phone_hidden ? 'رقمي مخفيّ' : 'إخفاء رقمي',
            icon: EyeOffIcon,
            active: wash.phone_hidden,
            onClick: () => void patchWash({ phone_hidden: !wash.phone_hidden }),
          },
        ] as IconGridItem[])
      : []),
    { key: 'page', label: 'صفحة مغسلتك', icon: StoreIcon, href: `/wash/detail/?id=${wash.id}` },
  ];

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-brand">مرحباً، {wash.name}</h1>
          <p className="text-[12px] text-slate-500">
            {wash.city}
            {wash.area ? ` – ${wash.area}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      {!asAdmin && <WashDeviceLink linked={!!wash.owner_device} />}
      {(() => {
        const pc = profileCompletion(wash, services.length);
        return pc.pct < 100 ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-bold text-slate-700">حسابك مكتمل {pct(pc.pct)}</span>
              <span className="text-slate-400">{pc.missing[0]}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand" style={{ width: `${pc.pct}%` }} />
            </div>
          </div>
        ) : null;
      })()}
      {views && (
        <p className="mt-2 text-[11px] text-slate-400">
          مشاهداتُ صفحتك {num(views.views)} · اتصال {num(views.calls)} · طريق {num(views.routes)}
        </p>
      )}
      {asAdmin && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-[12px] font-bold text-white">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            تعرض هذه اللوحةَ بصفة الإدارة — كلُّ ما تفعله هنا يقع على مغسلة «{wash.name}».{' '}
            <a href="/admin/" className="underline">العودة إلى الإدارة</a>
          </span>
        </p>
      )}

      {wash.status === 'approved' ? (
        <SubscriptionCard wash={wash} cfg={cfg} />
      ) : (
        <p className={`mt-4 rounded-xl border p-3 text-[12.5px] font-bold leading-relaxed ${note.cls}`}>{note.text}</p>
      )}

      <section className="mt-3">
        <h2 className="text-sm font-extrabold text-slate-800">إحصائيات اليوم</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {todayStats.map((s) => (
            <div key={s.label} className={`rounded-xl bg-brand-50 py-2.5 text-center ${s.wide ? 'col-span-2' : ''}`}>
              <p className="text-lg font-extrabold leading-none tabular-nums text-brand-700">{s.value}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {err && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {err}
        </p>
      )}

      <div className="mt-5">
        <IconGrid items={grid} label="إعدادات المغسلة" />
      </div>

      {/* ── الحجوزات ─────────────────────────────────────────────────────── */}
      <section className="card mt-5 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-800">الحجوزات</h2>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-900">
                {pendingCount} بانتظار التأكيد
              </span>
            )}
            <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost min-h-[36px] px-3 text-xs">
              {refreshing ? <SpinnerIcon className="h-4 w-4" /> : 'تحديث'}
            </button>
          </div>
        </div>

        <div role="tablist" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-[36px] rounded-lg text-xs font-bold ${tab === t.key ? 'bg-white text-brand-800 shadow-soft' : 'text-slate-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">لا حجوزات.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((b) => {
              const busy = acting === b.id;
              return (
                <li key={b.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-slate-800">
                      {tab === 'past' && <span className="text-slate-500">{dayLabel(bookingDay(b))} · </span>}
                      {at12(b.starts_at)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${PILL[b.status]}`}>
                      {BOOKING_LABELS[b.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {b.name}
                    {b.car && <span className="font-medium text-slate-500"> · {b.car}</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {b.service_name} · {b.use_free ? 'مجّانيّة' : iqd(b.price)}
                  </p>
                  {b.is_subscriber && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-extrabold text-brand-700">
                      <StarIcon className="h-3 w-3" />
                      مشترك المحطة التقنية
                    </span>
                  )}
                  {/* سيّارةٌ دخلت بلا هاتف (add_walk_in) — لا أزرارَ اتّصال. */}
                  {b.phone && (
                    <div className="mt-2 flex gap-2">
                      <a href={`tel:${b.phone}`} className="btn-ghost min-h-[40px] flex-1 text-xs" dir="ltr">
                        <PhoneIcon className="h-4 w-4" />
                        {b.phone}
                      </a>
                      <a
                        href={`https://wa.me/964${normalizePhone(b.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="واتساب"
                        className="btn-ghost min-h-[40px] px-3"
                      >
                        <WhatsappIcon className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <span dir="ltr" className="font-mono font-bold text-slate-600">{b.code}</span>
                    {b.group_key && (groupSizes.get(b.group_key) ?? 0) > 1 && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-extrabold text-brand-700">
                        {/* «السابقة» مقصوصةٌ على 50 صفّاً، فقد يَنقُص عدُّ الطلب — لا نطبع رقماً لا نثق به. */}
                        {tab === 'past' ? 'ضمن طلبٍ من عدّة سيارات' : `ضمن طلب من ${groupSizes.get(b.group_key)} سيارات`}
                      </span>
                    )}
                    {b.vehicle && (
                      <span className="flex items-center gap-1">
                        <CarThumb vehicle={b.vehicle} className="h-7 w-7" />
                        {VEHICLE_LABELS[asVehicle(b.vehicle)]}
                      </span>
                    )}
                    {b.walk_in && <span>بلا حجز</span>}
                  </p>
                  {b.status === 'pending' && Date.parse(b.starts_at) < Date.now() && (
                    <p className="mt-1 text-[11px] font-bold text-traffic-red">فات موعدُه ولم يُؤكَّد</p>
                  )}
                  {nextStatuses(b.status).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {nextStatuses(b.status).map((s, i) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(b.id, s)}
                          className={`min-h-[40px] text-xs ${i === 0 ? 'flex-1' : 'px-3'} ${ACTION_CLS[s] ?? 'btn-ghost'}`}
                        >
                          {busy && i === 0 ? <SpinnerIcon className="h-4 w-4" /> : ACTION_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={sheet === 'services'} onClose={() => setSheet(null)} title="الخدمات" hint="ما يختاره الزبون عند الحجز.">
        <ServicesEditor washId={wash.id} rows={services} onChange={() => loadLists(wash.id)} />
      </Sheet>
      <Sheet open={sheet === 'offers'} onClose={() => setSheet(null)} title="العروض" hint="سطرٌ قصير يظهر على صفحتك.">
        {sheet === 'offers' && (
          <OffersEditor
            washId={wash.id}
            rows={offers}
            services={services.filter((s) => s.active)}
            enabled={asAdmin || !!(planOf(cfg, wash.plan)?.features.offers_enabled)}
            onChange={() => loadLists(wash.id)}
          />
        )}
      </Sheet>
      <Sheet open={sheet === 'hours'} onClose={() => setSheet(null)} title="الدوام والمسارب">
        {sheet === 'hours' && (
          <>
            <HoursEditor wash={wash} onSave={patchWash} />
            <ClosuresEditor washId={wash.id} />
          </>
        )}
      </Sheet>
      <Sheet open={sheet === 'profile'} onClose={() => setSheet(null)} title="بيانات المغسلة" hint="اسمُ المسؤول وأرقامُ التواصل — للإدارة والحجوزات، لا تُعرض على صفحتك العامّة.">
        {sheet === 'profile' && <ProfileEditor wash={wash} onSave={patchWash} />}
      </Sheet>
      <Sheet open={sheet === 'staff'} onClose={() => setSheet(null)} title="موظّفو المغسلة" hint="حساباتٌ تؤكّد الحجوزاتِ وتُتمّها معك.">
        {sheet === 'staff' && (
          <WashStaff washId={wash.id} washName={wash.name} washPhone={wash.phone} isOwner={owns} staffLimit={Math.max(0, Number(planOf(cfg, wash.plan)?.features.staff_limit ?? 0))} />
        )}
      </Sheet>
      <Sheet open={sheet === 'stats'} onClose={() => setSheet(null)} title="الإحصائيّات" hint="حجوزاتك وإيرادك وزبائنك — بحسب الفترة.">
        {sheet === 'stats' && <WashDashboard washId={wash.id} />}
      </Sheet>
      <Sheet open={sheet === 'reviews'} onClose={() => setSheet(null)} title="التقييمات" hint="من زبائنَ اكتملت خدمتُهم فقط. يمكنك إخفاءَ تقييمٍ مسيء.">
        {sheet === 'reviews' && <ReviewsList washId={wash.id} />}
      </Sheet>
      <Sheet open={sheet === 'pause'} onClose={() => setSheet(null)} title="إيقاف استقبال الحجوزات" hint="الصفحةُ تبقى ظاهرة، والحجزُ يتوقّف حتى الموعد الذي تختاره.">
        <PauseSheet wash={wash} paused={paused} onSave={async (p) => { const ok = await patchWash(p); if (ok) setSheet(null); }} />
      </Sheet>
      <Sheet open={sheet === 'walkin'} onClose={() => setSheet(null)} title="سيارة دخلت الآن" hint="تُسجَّل كحجزٍ واصل فيُحجز مسربُها ولا يُعرض للناس.">
        {sheet === 'walkin' && (
          <WalkInSheet wash={wash} services={services.filter((s) => s.active)} onDone={() => { setSheet(null); void loadBookings(wash.id); }} />
        )}
      </Sheet>
      <Sheet open={sheet === 'photo'} onClose={() => setSheet(null)} title="الصورة" hint="تظهر في القائمة وصفحة مغسلتك.">
        <WashPhotoUpload
          washId={wash.id}
          imageUrl={wash.image_url}
          photos={wash.photos ?? []}
          galleryLimit={Math.max(0, Number(planOf(cfg, wash.plan)?.features.gallery_limit ?? 1))}
          onChange={(patch) => setWash({ ...wash, ...patch })}
        />
      </Sheet>
    </main>
  );
}

/* ── الخدمات ─────────────────────────────────────────────────────────────── */
function ServicesEditor({ washId, rows, onChange }: { washId: string; rows: WashService[]; onChange: () => void }) {
  const [editing, setEditing] = useState<WashService | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [active, setActive] = useState(true);
  const [desc, setDesc] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [byVehicle, setByVehicle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setEditing(null);
    setName('');
    setPrice('');
    setMinutes(30);
    setActive(true);
    setDesc('');
    setPrices({});
    setByVehicle(false);
  }
  function edit(s: WashService) {
    setEditing(s);
    setName(s.name);
    setPrice(String(s.price));
    setMinutes(s.minutes);
    setActive(s.active);
    setDesc(s.description ?? '');
    const pr = Object.fromEntries(Object.entries(s.prices ?? {}).map(([k, v]) => [k, String(v)]));
    setPrices(pr);
    setByVehicle(Object.keys(pr).length > 0);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price);
    if (name.trim().length < 2 || !Number.isFinite(p) || p < 0) return setErr('اكتب اسم الخدمة وسعرها.');
    setBusy(true);
    setErr(null);
    // أسعارُ الأنواع: ما كُتب رقماً صالحاً فقط، وإلّا null (سعرٌ واحد).
    const pv = byVehicle
      ? Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v) && (v as number) >= 0))
      : {};
    const row = { name: name.trim(), price: p, minutes, active, prices: Object.keys(pv).length ? pv : null, description: desc.trim().slice(0, 120) || null };
    const { error } = editing
      ? await supabase.from('wash_services').update(row).eq('id', editing.id)
      : await supabase.from('wash_services').insert({ ...row, wash_id: washId, sort: rows.length + 1 });
    setBusy(false);
    if (error) return setErr('تعذّر الحفظ. حاول مجدداً.');
    reset();
    onChange();
  }

  async function remove(s: WashService) {
    if (!confirm(`حذف «${s.name}»؟`)) return;
    const { error } = await supabase.from('wash_services').delete().eq('id', s.id);
    if (error) return setErr('تعذّر الحذف.');
    if (editing?.id === s.id) reset();
    onChange();
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${s.active ? 'border-slate-200' : 'border-slate-100 text-slate-400'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{s.name}</span>
                <span>
                  {iqd(s.price)} · {s.minutes} دقيقة{!s.active && ' · معطّلة'}
                </span>
                {s.description && <span className="block truncate text-[11px] text-slate-500">{s.description}</span>}
              </span>
              <button type="button" onClick={() => edit(s)} className="font-bold text-brand-700 underline">
                تعديل
              </button>
              <button type="button" onClick={() => remove(s)} className="font-bold text-traffic-red underline">
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} className="space-y-3 rounded-xl bg-brand-50/60 p-3">
        <p className="text-xs font-extrabold text-brand-800">{editing ? `تعديل «${editing.name}»` : 'خدمة جديدة'}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="اسم الخدمة" aria-label="اسم الخدمة" />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={250}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="field"
            placeholder="السعر (د.ع)"
            aria-label="السعر"
            dir="ltr"
          />
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="field" aria-label="المدّة">
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m} دقيقة
              </option>
            ))}
          </select>
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} rows={2} className="field py-2 text-sm" placeholder="الوصف (اختياريّ) — ما تشمله الخدمة" aria-label="الوصف" />
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={byVehicle} onChange={(e) => setByVehicle(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
          سعرٌ يختلف بنوع السيارة
        </label>
        {byVehicle && (
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((v) => (
              <label key={v} className="text-[11px] text-slate-600">
                {VEHICLE_LABELS[v]}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={250}
                  value={prices[v] ?? ''}
                  onChange={(e) => setPrices((p) => ({ ...p, [v]: e.target.value }))}
                  className="field mt-0.5 py-1.5 text-sm"
                  placeholder={price || 'السعر'}
                  dir="ltr"
                />
              </label>
            ))}
          </div>
        )}
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
          فعّالة
        </label>
        {err && <p role="alert" className="text-xs text-traffic-red">{err}</p>}
        <div className="flex gap-2">
          {editing && (
            <button type="button" onClick={reset} className="btn-ghost flex-1">
              إلغاء
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary flex-[2]">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            {editing ? 'حفظ' : 'إضافة'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── العروض ──────────────────────────────────────────────────────────────── */
function OffersEditor({ washId, rows, services, enabled, onChange }: { washId: string; rows: WashOffer[]; services: WashService[]; enabled: boolean; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [kind, setKind] = useState<'none' | 'price' | 'pct'>('none');
  const [amount, setAmount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [perUser, setPerUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** «بدلاً من / الآن» — معاينةُ السعر بعد العرض على الخدمة المختارة (مرآةُ book_wash). */
  const base = services.find((s) => s.id === serviceId)?.price;
  const n = Number(amount);
  const preview =
    base != null && kind !== 'none' && Number.isFinite(n) && n > 0
      ? offerPrice(base, { offer_price: kind === 'price' ? n : null, discount_pct: kind === 'pct' ? n : null })
      : null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t.length < 3 || t.length > 80) return setErr('اكتب عنوان العرض — حتى 80 حرفاً.');
    if (kind !== 'none' && (!Number.isFinite(n) || n <= 0 || (kind === 'pct' && n > 90))) return setErr(kind === 'pct' ? 'نسبةُ الخصم من 1 إلى 90.' : 'اكتب السعر الخاصّ.');
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from('wash_offers').insert({
      wash_id: washId,
      title: t,
      description: desc.trim().slice(0, 120) || null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      service_id: serviceId || null,
      offer_price: kind === 'price' ? n : null,
      discount_pct: kind === 'pct' ? n : null,
      max_redemptions: maxUses ? Number(maxUses) : null,
      per_user_limit: perUser ? Number(perUser) : null,
      active: true,
    });
    setBusy(false);
    if (error) return setErr(error.message.includes('الباقة') ? error.message : 'تعذّر الحفظ. حاول مجدداً.');
    setTitle('');
    setDesc('');
    setEndsAt('');
    setStartsAt('');
    setServiceId('');
    setKind('none');
    setAmount('');
    setMaxUses('');
    setPerUser('');
    onChange();
  }

  async function toggle(o: WashOffer) {
    const { error } = await supabase.from('wash_offers').update({ active: !o.active }).eq('id', o.id);
    if (error) return setErr('تعذّر الحفظ.');
    onChange();
  }

  async function remove(o: WashOffer) {
    if (!confirm(`حذف «${o.title}»؟`)) return;
    const { error } = await supabase.from('wash_offers').delete().eq('id', o.id);
    if (error) return setErr('تعذّر الحذف.');
    onChange();
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((o) => (
            <li key={o.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${o.active ? 'border-slate-200' : 'border-slate-100 text-slate-400'}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={o.active} onChange={() => toggle(o)} className="h-4 w-4 shrink-0 accent-[#16a34a]" aria-label="فعّال" />
                <span className="min-w-0">
                  <span className="block truncate font-bold">{o.title}</span>
                  <span className="text-slate-500">
                    {o.discount_pct != null ? `خصم ${pct(o.discount_pct)}` : o.offer_price != null ? iqd(o.offer_price) : 'إعلان'}
                    {o.service_id ? ` · ${services.find((s) => s.id === o.service_id)?.name ?? 'خدمة'}` : ''}
                    {o.ends_at ? ` · حتى ${dayLabel(o.ends_at)}` : ''}
                    {o.max_redemptions ? ` · ${num(o.max_redemptions)} مستفيداً` : ''}
                  </span>
                  {o.description && <span className="block truncate text-[11px] text-slate-400">{o.description}</span>}
                </span>
              </label>
              <button type="button" onClick={() => remove(o)} className="font-bold text-traffic-red underline">
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      {!enabled && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          العروضُ ميزةُ الباقة الاحترافيّة فما فوق — تواصل مع الإدارة لترقية اشتراكك.
        </p>
      )}
      <form onSubmit={add} className={`space-y-3 rounded-xl bg-brand-50/60 p-3 ${enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <p className="text-xs font-extrabold text-brand-800">عرض جديد</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="field" placeholder="غسلة كاملة بـ8,000 حتى الجمعة" aria-label="عنوان العرض" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} rows={2} className="field py-2 text-sm" placeholder="الوصف (اختياريّ)" aria-label="الوصف" />
        <div className="grid grid-cols-2 gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'none' | 'price' | 'pct')} className="field" aria-label="نوع العرض">
            <option value="none">إعلانٌ فقط</option>
            <option value="price">سعرٌ خاصّ</option>
            <option value="pct">خصم %</option>
          </select>
          <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={kind === 'none'} className="field" placeholder={kind === 'pct' ? 'النسبة' : 'السعر'} aria-label="القيمة" dir="ltr" />
        </div>
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="field" aria-label="الخدمة">
          <option value="">كلّ الخدمات</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {preview != null && base != null && (
          <p className="text-[12px] font-bold text-brand-800">
            <span className="text-slate-400 line-through">بدلاً من {iqd(base)}</span> / الآن {iqd(preview)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-600">
            يبدأ
            <input type="date" min={bgdDate(0)} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
          </label>
          <label className="text-[11px] text-slate-600">
            ينتهي
            <input id="offer-ends" type="date" min={bgdDate(0)} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
          </label>
          <label className="text-[11px] text-slate-600">
            عددُ المستفيدين
            <input type="number" inputMode="numeric" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="field mt-0.5 py-1.5 text-sm" placeholder="بلا حدّ" dir="ltr" />
          </label>
          <label className="text-[11px] text-slate-600">
            مرّاتٌ للزبون الواحد
            <input type="number" inputMode="numeric" min={1} value={perUser} onChange={(e) => setPerUser(e.target.value)} className="field mt-0.5 py-1.5 text-sm" placeholder="بلا حدّ" dir="ltr" />
          </label>
        </div>
        {err && <p role="alert" className="text-xs text-traffic-red">{err}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy && <SpinnerIcon className="h-4 w-4" />}
          إضافة
        </button>
      </form>
    </div>
  );
}

/* ── الدوام والمسارب ─────────────────────────────────────────────────────── */
function HoursEditor({ wash, onSave }: { wash: CarWash; onSave: (p: Partial<CarWash>) => Promise<boolean> }) {
  const [is24h, setIs24h] = useState(wash.is_24h);
  const [opensAt, setOpensAt] = useState(wash.opens_at);
  const [closesAt, setClosesAt] = useState(wash.closes_at);
  const [bays, setBays] = useState(wash.bays);
  const [slot, setSlot] = useState(wash.slot_minutes);
  const [loyalty, setLoyalty] = useState(wash.loyalty_target);
  const [auto, setAuto] = useState(wash.confirm_mode === 'auto');
  const [area, setArea] = useState(wash.area ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await onSave({ is_24h: is24h, opens_at: opensAt, closes_at: closesAt, bays, slot_minutes: slot, loyalty_target: loyalty, confirm_mode: auto ? 'auto' : 'manual', area: area.trim().slice(0, 40) || null });
    setBusy(false);
    setSaved(ok);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hours-area" className="label">
          المنطقة
        </label>
        <input id="hours-area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} className="field" placeholder="شارع 60، الحيّ العسكريّ…" />
        <p className="mt-1 text-[11px] text-slate-400">تُعرض بعد المدينة: «{wash.city} – {area.trim() || 'المنطقة'}».</p>
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
        <input type="checkbox" checked={is24h} onChange={(e) => setIs24h(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
        <span className="text-sm font-medium">24 ساعة</span>
      </label>
      {!is24h && (
        <>
          <TimeSelect id="hours-opens" label="وقت الفتح" value={opensAt} onChange={setOpensAt} />
          <TimeSelect id="hours-closes" label="وقت الإغلاق" value={closesAt} onChange={setClosesAt} />
        </>
      )}
      <div>
        <label htmlFor="hours-bays" className="label">
          المسارب
        </label>
        <select id="hours-bays" value={bays} onChange={(e) => setBays(Number(e.target.value))} className="field">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-400">كم سيّارة تُغسل في الوقت نفسه؟</p>
      </div>
      <div>
        <label htmlFor="hours-slot" className="label">
          مدّة الموعد
        </label>
        <select id="hours-slot" value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="field">
          {SLOTS.map((n) => (
            <option key={n} value={n}>
              {n} دقيقة
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="hours-loyalty" className="label">
          بطاقة الغسلات
        </label>
        <select id="hours-loyalty" value={loyalty} onChange={(e) => setLoyalty(Number(e.target.value))} className="field">
          {LOYALTY.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? '0 = بلا بطاقة' : `${n} غسلات ثمّ واحدة مجّانيّة`}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#16a34a]" />
        <span className="text-sm">
          <span className="font-medium">تأكيدٌ تلقائيّ</span>
          <span className="block text-[11px] text-slate-500">الحجزُ يُؤكَّد فورَ توفّر الموعد بلا ضغطة منك. وإلّا يبقى «بانتظار التأكيد».</span>
        </span>
      </label>
      <button type="button" onClick={save} disabled={busy} className="btn-primary w-full">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : saved ? 'حُفظ ✓' : 'حفظ'}
      </button>
    </div>
  );
}

/* ── بياناتُ المغسلة: المسؤولُ وأرقامُ التواصل ──────────────────────────── */
function ProfileEditor({ wash, onSave }: { wash: CarWash; onSave: (p: Partial<CarWash>) => Promise<boolean> }) {
  const [ownerName, setOwnerName] = useState(wash.owner_name ?? '');
  const [whatsapp, setWhatsapp] = useState(wash.whatsapp ?? '');
  const [phone2, setPhone2] = useState(wash.phone2 ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    setSaved(false);
    if (whatsapp && !isValidIraqiMobile(whatsapp)) return setErr('رقم واتساب غير صحيح.');
    if (phone2 && !isValidIraqiMobile(phone2)) return setErr('الرقم الإضافيّ غير صحيح.');
    setBusy(true);
    // كما يخزّنه التسجيل: 07XXXXXXXXX.
    const ok = await onSave({
      owner_name: ownerName.trim().slice(0, 60) || null,
      whatsapp: whatsapp ? displayPhone(whatsapp) : null,
      phone2: phone2 ? displayPhone(phone2) : null,
    });
    setBusy(false);
    setSaved(ok);
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="profile-owner" className="label">
          اسم المسؤول
        </label>
        <input id="profile-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={60} className="field" placeholder="اسم صاحب المغسلة" />
      </div>
      <div>
        <label htmlFor="profile-wa" className="label">
          رقم واتساب
        </label>
        <input id="profile-wa" type="tel" inputMode="numeric" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" />
      </div>
      <div>
        <label htmlFor="profile-phone2" className="label">
          رقم إضافي
        </label>
        <input id="profile-phone2" type="tel" inputMode="numeric" value={phone2} onChange={(e) => setPhone2(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" />
      </div>
      {err && <p role="alert" className="text-xs text-traffic-red">{err}</p>}
      <button type="button" onClick={save} disabled={busy} className="btn-primary w-full">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : saved ? 'حُفظ ✓' : 'حفظ'}
      </button>
    </div>
  );
}

/* ── إيقافُ الحجوزات ─────────────────────────────────────────────────────── */
function PauseSheet({ wash, paused, onSave }: { wash: CarWash; paused: boolean; onSave: (p: Partial<CarWash>) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const until = wash.bookings_paused_until ? shortAt(wash.bookings_paused_until) : null;
  const endOfDay = () => new Date(`${bgdDate()}T23:59:59+03:00`).toISOString();
  const options: { label: string; at: () => string | null }[] = [
    { label: '30 دقيقة', at: () => new Date(Date.now() + 30 * 60_000).toISOString() },
    { label: 'ساعة', at: () => new Date(Date.now() + 60 * 60_000).toISOString() },
    { label: 'حتى نهاية اليوم', at: endOfDay },
    { label: 'حتى أعيد التشغيل', at: () => new Date(Date.now() + 365 * 86_400_000).toISOString() },
  ];
  async function pick(label: string, at: string | null) {
    setBusy(label);
    await onSave({ bookings_paused_until: at });
    setBusy(null);
  }
  return (
    <div className="space-y-2">
      {paused && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          الحجوزات متوقّفة حتى {until}.
        </p>
      )}
      {options.map((o) => (
        <button key={o.label} type="button" disabled={!!busy} onClick={() => pick(o.label, o.at())} className="btn-ghost w-full">
          {busy === o.label ? <SpinnerIcon className="h-4 w-4" /> : o.label}
        </button>
      ))}
      {paused && (
        <button type="button" disabled={!!busy} onClick={() => pick('resume', null)} className="btn-primary w-full">
          استئناف الحجوزات الآن
        </button>
      )}
    </div>
  );
}

/* ── الإغلاقُ الاستثنائيّ ────────────────────────────────────────────────── */
function ClosuresEditor({ washId }: { washId: string }) {
  const [rows, setRows] = useState<WashClosure[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('wash_closures').select('*').eq('wash_id', washId).gte('ends_at', new Date().toISOString()).order('starts_at').limit(20);
    setRows((data as WashClosure[] | null) ?? []);
  }, [washId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setErr(null);
    if (!from || !to) return setErr('حدّد البداية والنهاية.');
    const s = new Date(`${from}:00+03:00`).toISOString();
    const e = new Date(`${to}:00+03:00`).toISOString();
    if (e <= s) return setErr('النهاية قبل البداية.');
    setBusy(true);
    const { error } = await supabase.from('wash_closures').insert({ wash_id: washId, starts_at: s, ends_at: e, reason: reason.trim() || null });
    setBusy(false);
    if (error) return setErr('تعذّر الحفظ.');
    setFrom('');
    setTo('');
    setReason('');
    void load();
  }
  async function remove(id: string) {
    await supabase.from('wash_closures').delete().eq('id', id);
    void load();
  }
  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <p className="text-sm font-bold">إغلاق استثنائيّ</p>
      <p className="text-[11px] text-slate-400">عيد، صيانة، انقطاع — لا مواعيدَ خلاله ولا يمسّ دوامك.</p>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1">
                {/* كلماتٌ عربيّة حول كلّ لحظة — وإلّا تمزّق «18‏/9» في اتّجاهين. */}
                <span className="block font-bold">من {shortAt(c.starts_at)} إلى {shortAt(c.ends_at)}</span>
                {c.reason && <span className="text-slate-500">{c.reason}</span>}
              </span>
              <button type="button" onClick={() => remove(c.id)} className="font-bold text-traffic-red underline">حذف</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-600">
          من
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
        </label>
        <label className="text-[11px] text-slate-600">
          إلى
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
        </label>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={60} className="field mt-2" placeholder="السبب (اختياريّ)" aria-label="السبب" />
      {err && <p role="alert" className="mt-1 text-xs text-traffic-red">{err}</p>}
      <button type="button" disabled={busy} onClick={add} className="btn-ghost mt-2 w-full">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : 'إضافة إغلاق'}
      </button>
    </div>
  );
}

/* ── سيّارةٌ دخلت الآن ────────────────────────────────────────────────────── */
function WalkInSheet({ wash, services, onDone }: { wash: CarWash; services: WashService[]; onDone: () => void }) {
  const nowBgd = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' });
  const [service, setService] = useState(services[0]?.id ?? '');
  const [time, setTime] = useState(nowBgd);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [car, setCar] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!service) return setErr('اختر الخدمة.');
    if (name.trim().length < 2) return setErr('اكتب اسم الزبون.');
    setBusy(true);
    const { error } = await supabase.rpc('add_walk_in', {
      p_wash: wash.id,
      p_service: service,
      p_day: bgdDate(),
      p_slot: time,
      p_name: name.trim(),
      p_phone: phone.trim() || null,
      p_car: car.trim() || null,
      p_vehicle: vehicle || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <div className="space-y-3">
      <select value={service} onChange={(e) => setService(e.target.value)} className="field" aria-label="الخدمة">
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {iqd(s.price)}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-600">
          وقت الدخول
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field mt-0.5" dir="ltr" />
        </label>
      </div>
      <div>
        <p className="text-[11px] text-slate-600">نوع السيارة</p>
        <div className="mt-1">
          <VehiclePicker value={vehicle} onChange={setVehicle} />
        </div>
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="اسم الزبون" aria-label="اسم الزبون" />
      <div className="grid grid-cols-2 gap-2">
        <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" placeholder="الهاتف (اختياريّ)" aria-label="الهاتف" dir="ltr" />
        <input value={car} onChange={(e) => setCar(e.target.value)} className="field" placeholder="السيارة" aria-label="السيارة" />
      </div>
      {err && <p role="alert" className="text-xs text-traffic-red">{err}</p>}
      <button type="button" disabled={busy} onClick={save} className="btn-primary w-full">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : 'تسجيل الدخول للغسل'}
      </button>
    </div>
  );
}

/* ── التقييمات ───────────────────────────────────────────────────────────── */
function ReviewsList({ washId }: { washId: string }) {
  const [rows, setRows] = useState<WashReview[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('wash_reviews').select('booking_id, wash_id, stars, comment, name, hidden, created_at').eq('wash_id', washId).order('created_at', { ascending: false }).limit(50);
    setRows((data as WashReview[] | null) ?? []);
  }, [washId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggle(r: WashReview) {
    await supabase.from('wash_reviews').update({ hidden: !r.hidden }).eq('booking_id', r.booking_id!);
    void load();
  }
  if (!rows) return <SpinnerIcon className="mx-auto h-5 w-5 text-brand" />;
  if (rows.length === 0) return <p className="text-sm text-slate-400">لا تقييمات بعد — تصل بعد كلّ خدمةٍ مكتملة.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.booking_id} className={`rounded-xl border px-3 py-2 text-[12px] ${r.hidden ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-amber-600">{'★'.repeat(r.stars)}</span>
            <span className="text-[11px] text-slate-400">
              {r.name} · {dateLine(r.created_at, { day: 'numeric', month: 'numeric' })}
            </span>
          </div>
          {r.comment && <p className="mt-1 text-slate-700">{r.comment}</p>}
          <button type="button" onClick={() => toggle(r)} className="mt-1 text-[11px] font-bold text-slate-500 underline">
            {r.hidden ? 'إظهار' : 'إخفاء'}
          </button>
        </li>
      ))}
    </ul>
  );
}

