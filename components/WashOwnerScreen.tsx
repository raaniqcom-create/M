'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { forgetLogin } from '@/lib/biometric';
import { ADMIN_WA, normalizePhone } from '@/lib/phone';
import {
  ACTION_LABELS,
  BOOKING_LABELS,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  bgdDate,
  dayLabel,
  daysLeft,
  nextStatuses,
  iqd,
  limitLabel,
  planOf,
  slotLabel,
  type BookingStatus,
  type CarWash,
  type WashBooking,
  type WashConfig,
  type WashOffer,
  type WashService,
} from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { IconGrid, type IconGridItem } from './IconGrid';
import { Sheet } from './Sheet';
import { TimeSelect } from './TimeSelect';
import { WashPhotoUpload } from './WashPhotoUpload';
import {
  CalendarIcon,
  CarIcon,
  EyeOffIcon,
  ImageIcon,
  LogOutIcon,
  PhoneIcon,
  SpinnerIcon,
  StarIcon,
  StoreIcon,
  WhatsappIcon,
  XIcon,
} from './icons';

type Tab = 'today' | 'tomorrow' | 'past';
type SheetKind = 'services' | 'offers' | 'hours' | 'photo' | null;

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
/** «HH:MM» بتوقيت بغداد من timestamptz. */
const bgdTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const bookingDay = (b: WashBooking) => bgdDate(0, Date.parse(b.starts_at));

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
    const until = new Date(`${w.paid_until}T12:00:00`).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });
    return { cls: 'border-brand-200 bg-brand-50 text-brand-800', text: `الاشتراك فعّال حتى ${until}${left <= 7 ? ' — يجدَّد قريباً' : ''}` };
  }
  return { cls: 'border-red-200 bg-red-50 text-traffic-red', text: 'انتهى الاشتراك — مغسلتك مخفيّة عن الزبائن حتى التجديد' };
}

/** بطاقةُ الاشتراك (§44): الباقةُ وسعرُها وانتهاؤها والمتبقّي وحدودُها وزرُّ التجديد. */
function SubscriptionCard({ wash, cfg }: { wash: CarWash; cfg: WashConfig | null }) {
  const plan = planOf(cfg, wash.plan);
  const left = daysLeft(wash.paid_until);
  const grace = cfg?.grace_days ?? 3;
  const f = plan?.features ?? {};
  const until = wash.paid_until
    ? new Date(`${wash.paid_until}T12:00:00`).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
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
  const [wash, setWash] = useState<CarWash | null | undefined>(undefined);
  const [upcoming, setUpcoming] = useState<WashBooking[]>([]);
  const [past, setPast] = useState<WashBooking[]>([]);
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
    setUpcoming((up as WashBooking[] | null) ?? []);
    setPast((old as WashBooking[] | null) ?? []);
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
      if (w) await Promise.all([loadBookings(w.id), loadLists(w.id)]);
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
    if (error) setErr('تعذّر تحديث الحجز. حاول مجدداً.');
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

  const rows = tab === 'past' ? past : upcoming.filter((b) => bookingDay(b) === bgdDate(tab === 'today' ? 0 : 1));
  const pendingCount = upcoming.filter((b) => b.status === 'pending').length;
  const note = banner(wash, today);

  const grid: IconGridItem[] = [
    { key: 'services', label: 'الخدمات', icon: CarIcon, onClick: () => setSheet('services') },
    { key: 'offers', label: 'العروض', icon: StarIcon, onClick: () => setSheet('offers') },
    { key: 'hours', label: 'الدوام والمسارب', icon: CalendarIcon, onClick: () => setSheet('hours') },
    { key: 'photo', label: 'الصورة', icon: ImageIcon, onClick: () => setSheet('photo') },
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
    { key: 'page', label: 'صفحة مغسلتك', icon: StoreIcon, href: `/wash/detail/?id=${wash.id}` },
  ];

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-brand">{wash.name}</h1>
          <p className="text-[11px] font-bold text-slate-400">{wash.city}</p>
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

      {asAdmin && (
        <p className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-[12px] font-bold text-white">
          🛡 تعرض هذه اللوحةَ بصفة الإدارة — كلُّ ما تفعله هنا يقع على مغسلة «{wash.name}».{' '}
          <a href="/admin/" className="underline">العودة إلى الإدارة</a>
        </p>
      )}

      {wash.status === 'approved' ? (
        <SubscriptionCard wash={wash} cfg={cfg} />
      ) : (
        <p className={`mt-4 rounded-xl border p-3 text-[12.5px] font-bold leading-relaxed ${note.cls}`}>{note.text}</p>
      )}

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
                      {slotLabel(bgdTime(b.starts_at))}
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
                    {b.service_name} · {b.use_free ? 'مجّانيّة 🎁' : iqd(b.price)}
                  </p>
                  {b.is_subscriber && (
                    <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-extrabold text-brand-700">
                      ⭐ مشترك المحطة التقنية
                    </span>
                  )}
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
                  {b.vehicle && <p className="text-[11px] text-slate-500">{VEHICLE_LABELS[b.vehicle]}{b.walk_in ? ' · بلا حجز' : ''}</p>}
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
        <OffersEditor washId={wash.id} rows={offers} onChange={() => loadLists(wash.id)} />
      </Sheet>
      <Sheet open={sheet === 'hours'} onClose={() => setSheet(null)} title="الدوام والمسارب">
        {sheet === 'hours' && <HoursEditor wash={wash} onSave={patchWash} />}
      </Sheet>
      <Sheet open={sheet === 'photo'} onClose={() => setSheet(null)} title="الصورة" hint="تظهر في القائمة وصفحة مغسلتك.">
        <WashPhotoUpload washId={wash.id} imageUrl={wash.image_url} onChange={(url) => setWash({ ...wash, image_url: url })} />
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
    setPrices({});
    setByVehicle(false);
  }
  function edit(s: WashService) {
    setEditing(s);
    setName(s.name);
    setPrice(String(s.price));
    setMinutes(s.minutes);
    setActive(s.active);
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
    const row = { name: name.trim(), price: p, minutes, active, prices: Object.keys(pv).length ? pv : null };
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
            placeholder="السعر بالدينار"
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
function OffersEditor({ washId, rows, onChange }: { washId: string; rows: WashOffer[]; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t.length < 3 || t.length > 80) return setErr('اكتب عنوان العرض — حتى ٨٠ حرفاً.');
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from('wash_offers').insert({ wash_id: washId, title: t, ends_at: endsAt || null, active: true });
    setBusy(false);
    if (error) return setErr('تعذّر الحفظ. حاول مجدداً.');
    setTitle('');
    setEndsAt('');
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
                  {o.ends_at && <span>حتى {dayLabel(o.ends_at)}</span>}
                </span>
              </label>
              <button type="button" onClick={() => remove(o)} className="font-bold text-traffic-red underline">
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 rounded-xl bg-brand-50/60 p-3">
        <p className="text-xs font-extrabold text-brand-800">عرض جديد</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="field" placeholder="غسلة كاملة بـ٨٬٠٠٠ حتى الجمعة" aria-label="عنوان العرض" />
        <div>
          <label htmlFor="offer-ends" className="label">
            ينتهي في <span className="text-slate-400">(اختياريّ)</span>
          </label>
          <input id="offer-ends" type="date" min={bgdDate(0)} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field" dir="ltr" />
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
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await onSave({ is_24h: is24h, opens_at: opensAt, closes_at: closesAt, bays, slot_minutes: slot, loyalty_target: loyalty, confirm_mode: auto ? 'auto' : 'manual' });
    setBusy(false);
    setSaved(ok);
  }

  return (
    <div className="space-y-4">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
        <input type="checkbox" checked={is24h} onChange={(e) => setIs24h(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
        <span className="text-sm font-medium">٢٤ ساعة</span>
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
              {n === 0 ? '٠ = بلا بطاقة' : `${n} غسلات ثمّ واحدة مجّانيّة`}
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
