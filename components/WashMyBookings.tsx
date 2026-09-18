'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { pokeWashTick } from '@/lib/washConfig';
import {
  ACTIVE_STATUSES,
  BOOKING_LABELS,
  VEHICLE_LABELS,
  at12,
  bookingHref,
  carsLabel,
  dateLine,
  forgetBooking,
  iqd,
  readMyBookings,
  rememberBooking,
  type BookingStatus,
  type MyBooking,
  type VehicleType,
} from '@/lib/wash';
import { BOOKING_PILL, CarThumb, RouteCell, asVehicle } from './WashBookingScreen';
import { CalendarIcon, MapPinIcon, SpinnerIcon, WashIcon, XIcon } from './icons';

/** ما يردّه wash_my_bookings لكلّ رمز. */
type Remote = { code: string; status: BookingStatus; starts_at: string; ends_at: string; service: string; price: number; wash: string; wash_id: string; address: string; lat: number; lng: number; vehicle: VehicleType | null; group_key: string | null; late: boolean; service_id: string; reviewed?: boolean };
/** الصفُّ المحلّيّ + ما يُحفظ منه من القاعدة كي تعمل الصفحة بلا شبكة. */
type Row = MyBooking & { address?: string; lat?: number; lng?: number; reviewed?: boolean };
/** طلبٌ واحد: سياراتٌ تتشارك group_key، أو حجزٌ مفردٌ بلا مفتاح. */
type Order = { key: string; cars: Row[] };

type Tab = 'upcoming' | 'past' | 'cancelled';
const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'upcoming', label: 'القادمة', empty: 'لا حجوزات قادمة.' },
  { key: 'past', label: 'السابقة', empty: 'لا حجوزات سابقة.' },
  { key: 'cancelled', label: 'الملغاة', empty: 'لا حجوزات ملغاة.' },
];

const CANCELLED: (BookingStatus | undefined)[] = ['cancelled', 'cancelled_by_business'];
/** مكتملٌ ولم يُقيَّم وخلال 14 يوماً — حدودُ review_wash نفسُها. */
const canReview = (b: Row) => b.status === 'completed' && b.reviewed === false && Date.now() - new Date(b.starts_at).getTime() < 14 * 864e5;
function tabOf(b: Row, now: number): Tab {
  if (CANCELLED.includes(b.status)) return 'cancelled';
  const active = b.status === undefined || ACTIVE_STATUSES.includes(b.status);
  return active && Date.parse(b.starts_at) >= now - 2 * 3_600_000 ? 'upcoming' : 'past';
}

/** تبويبُ الطلب = أقوى تبويبٍ بين سيّاراته: إلغاءُ سيّارةٍ واحدةٍ لا ينقل الطلبَ إلى «الملغاة». */
const TAB_RANK: Record<Tab, number> = { upcoming: 0, past: 1, cancelled: 2 };
const orderTab = (o: Order, now: number): Tab => o.cars.map((c) => tabOf(c, now)).sort((a, b) => TAB_RANK[a] - TAB_RANK[b])[0];

/** يجمع الصفوفَ طلباتٍ: ما تشارك group_key بطاقةٌ واحدة، وما لا مفتاحَ له يقف وحده. */
function toOrders(rows: Row[]): Order[] {
  const map = new Map<string, Row[]>();
  for (const b of rows) {
    const k = b.group_key ? `g:${b.group_key}` : `c:${b.code}`;
    map.set(k, [...(map.get(k) ?? []), b]);
  }
  // الترتيبُ بالرمز كما تُصدّره القاعدة (group_codes مرتّبةٌ كذلك) — فترقيمُ «سيّارة 1 من 3» واحدٌ في الشاشتين.
  return [...map].map(([key, cars]) => ({ key, cars: [...cars].sort((a, b) => a.code.localeCompare(b.code)) }));
}

/** ما تقبل القاعدةُ إلغاءه: ما لم يدخل الخدمةَ ولم ينتهِ — cancel_wash_group لا تمسّ غيرَه. */
const cancellable = (c: Row) => c.status === undefined || c.status === 'pending' || c.status === 'confirmed';

/** ‎/wash/mine/ — حجوزاتُ هذا الجهاز: الرموزُ محلّيّةٌ والحالةُ من القاعدة (wash_my_bookings). */
export function WashMyBookings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [acting, setActing] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const local = readMyBookings() as Row[];
    if (local.length === 0) return setRows([]);
    setRows(local);
    let alive = true;
    // رمزُ الحجز لا يُقرأ إلّا مع هاتفه — فنداءٌ لكلّ هاتفٍ على هذا الجهاز.
    const byPhone = new Map<string, string[]>();
    for (const b of local) byPhone.set(b.phone, [...(byPhone.get(b.phone) ?? []), b.code]);
    Promise.all([...byPhone].map(([phone, codes]) => supabase.rpc('wash_my_bookings', { p_codes: codes.slice(0, 20), p_phone: phone })))
      .then((res) => {
        if (!alive) return;
        // حارسُ المحاولات أو هاتفٌ لا يطابق: data فارغةٌ بلا استثناء — نقولها بدل عرض حالةٍ قديمةٍ بصمت.
        if (res.some((r) => r.error)) setErr('تعذّر تحديث حالة الحجوزات — تُعرض آخر حالةٍ محفوظة.');
        const remote = new Map(res.flatMap((r) => ((r.data ?? []) as Remote[]).map((x) => [x.code, x] as const)));
        const merged = local.map((b) => {
          const r = remote.get(b.code);
          // ‎?? المحلّيّ: الموقعُ ينشر في دقائقَ والهجرةُ قد تتأخّر — قاعدةٌ أقدمُ لا تعيد group_key/vehicle فلا نمحوهما.
          return r ? { ...b, status: r.status, starts_at: r.starts_at, service: r.service, price: r.price, wash: r.wash, wash_id: r.wash_id, address: r.address, lat: r.lat, lng: r.lng, group_key: r.group_key ?? b.group_key, vehicle: r.vehicle ?? b.vehicle, reviewed: r.reviewed } : b;
        });
        // تُحفظ معكوسةً لأنّ rememberBooking تُصدّر — فيبقى الترتيبُ كما كان.
        [...merged].reverse().forEach(rememberBooking);
        setRows(merged);
      })
      .catch(() => {
        if (alive) setErr('تعذّر الاتّصال — تُعرض آخر حالةٍ محفوظة.');
      });
    return () => {
      alive = false;
    };
  }, []);

  /** الإلغاء: الطلبُ كلُّه بمفتاحه، والحجزُ المفردُ برمزه — والعدُّ على ما يُلغى فعلاً لا على كلّ سيّارات الطلب. */
  async function cancel(o: Order) {
    const live = o.cars.filter(cancellable);
    if (live.length === 0) return;
    const many = !!o.cars[0].group_key && live.length > 1;
    if (!confirm(many ? `إلغاء الطلب كامل (${live.length} سيارات)؟` : 'إلغاء الحجز؟')) return;
    setErr('');
    setActing(o.key);
    const { data, error } = many
      ? await supabase.rpc('cancel_wash_group', { p_group: o.cars[0].group_key, p_phone: live[0].phone })
      : await supabase.rpc('cancel_wash_booking', { p_code: live[0].code, p_phone: live[0].phone });
    setActing('');
    if (error || !data) return setErr(error?.message ?? 'تعذّر الإلغاء.');
    pokeWashTick();
    if (many && (data as number) < live.length) setErr('أُلغيت بعض السيارات فقط — سيّارةٌ قيد الخدمة لا تُلغى.');
    // لا تُعلَّم إلّا ما كان قابلاً للإلغاء: القاعدةُ تترك ما دخل الخدمةَ حيّاً.
    const codes = new Set(many ? live.map((c) => c.code) : [live[0].code]);
    const next = (rows ?? []).map((x) => (codes.has(x.code) ? { ...x, status: 'cancelled' as const } : x));
    next.filter((x) => codes.has(x.code)).forEach(rememberBooking);
    setRows(next);
  }

  /** تعديلُ موعد طلبٍ متعدّد السيارات: ‎replace= يُلغي رمزاً واحداً فيبقى بقيّةُ الطلب حيّاً
   *  ويرفض الحجزَ الجديد (حجزٌ في المغسلة نفسِها اليومَ نفسَه) — فيُلغى الطلبُ كلُّه ثمّ يُحجز من جديد. */
  async function editGroup(o: Order) {
    const live = o.cars.filter(cancellable);
    if (live.length === 0) return;
    if (!confirm('تعديلُ موعد الطلب يُلغيه أوّلاً ثمّ تحجز بالموعد الجديد. متابعة؟')) return;
    setErr('');
    setActing(o.key);
    const { data, error } = await supabase.rpc('cancel_wash_group', { p_group: o.cars[0].group_key, p_phone: live[0].phone });
    if (error || !data) {
      setActing('');
      return setErr(error?.message ?? 'تعذّر الإلغاء.');
    }
    live.forEach((c) => forgetBooking(c.code));
    pokeWashTick();
    window.location.href = `/wash/book/?id=${o.cars[0].wash_id}`;
  }

  if (rows === null) {
    return (
      <main className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }
  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 pb-24 pt-3">
        <h1 className="text-xl font-extrabold text-slate-800">حجوزاتي</h1>
        <div className="card mt-6 flex flex-col items-center p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand">
            <WashIcon className="h-8 w-8" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">لا حجوزات على هذا الجهاز بعد</p>
          <p className="mt-1 text-[12px] text-slate-500">احجز موعد غسيل وستجده هنا.</p>
          <a href="/wash/" className="btn-primary mt-4 w-full">
            تصفّح المغاسل
          </a>
        </div>
      </main>
    );
  }

  const now = Date.now();
  const list = toOrders(rows)
    .filter((o) => orderTab(o, now) === tab)
    .sort((a, b) => (tab === 'upcoming' ? Date.parse(a.cars[0].starts_at) - Date.parse(b.cars[0].starts_at) : Date.parse(b.cars[0].starts_at) - Date.parse(a.cars[0].starts_at)));

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-3">
      <h1 className="text-xl font-extrabold text-slate-800">حجوزاتي</h1>

      <div role="tablist" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`min-h-[36px] rounded-lg text-xs font-bold ${tab === t.key ? 'bg-white text-brand-800 shadow-soft' : 'text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
          {err}
        </p>
      )}

      {list.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-slate-400">{TABS.find((t) => t.key === tab)!.empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {list.map((o) => {
            const head = o.cars[0];
            const grouped = !!head.group_key && o.cars.length > 1;
            const editable = tab === 'upcoming' && o.cars.some(cancellable);
            /** حالةٌ واحدةٌ للطلب إن اتّفقت سيّاراتُه، وإلّا «حالات مختلفة» وقائمةٌ بها. */
            const statuses = [...new Set(o.cars.map((c) => c.status))];
            const mixed = statuses.length > 1;
            const priced = o.cars.filter((c) => c.price != null);
            const total = priced.reduce((s, c) => s + (c.price ?? 0), 0);
            return (
              <li key={o.key}>
                {/* الحافّةُ الخضراء تحت البطاقة — لغةُ القسم كلِّه. */}
                <div className="rounded-[26px] bg-brand-600/90 pb-[5px]">
                  <div className="rounded-[26px] border border-brand-100 bg-white p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-slate-800">{head.wash}</p>
                        {head.service && <p className="mt-0.5 text-[12px] text-slate-500">{head.service}</p>}
                        <p className="mt-1 flex items-center gap-1 text-[13px] text-slate-700">
                          <CalendarIcon className="h-3.5 w-3.5 text-brand" />
                          {dateLine(head.starts_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {at12(head.starts_at)}
                        </p>
                        {grouped && <p className="mt-0.5 text-[11px] font-bold text-brand-700">{carsLabel(o.cars.length)} في هذا الطلب</p>}
                      </div>
                      <div className="shrink-0 text-end">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${mixed ? 'bg-slate-100 text-slate-600' : head.status ? BOOKING_PILL[head.status] : 'bg-slate-100 text-slate-500'}`}>
                          {mixed ? 'حالات مختلفة' : head.status ? BOOKING_LABELS[head.status] : '—'}
                        </span>
                        {priced.length > 0 && <p className="mt-1 text-[12px] font-bold text-brand-700">{iqd(total)}</p>}
                      </div>
                    </div>

                    {mixed && (
                      <ul className="mt-2 space-y-0.5 rounded-xl bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                        {o.cars.map((c) => (
                          <li key={c.code} className="flex items-center justify-between gap-2">
                            <span>
                              {VEHICLE_LABELS[asVehicle(c.vehicle)]} ·{' '}
                              <span className="font-mono" dir="ltr">
                                {c.code}
                              </span>
                            </span>
                            <span className="font-bold">{c.status ? BOOKING_LABELS[c.status] : '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {(grouped || head.vehicle) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {o.cars.map((c) => (
                          <span key={c.code} className="flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 px-2 py-1">
                            {/* أيُّ className يُمرَّر يستبدل الافتراضيَّ كلَّه — فالتلوينُ يُعاد هنا صراحةً، وإلّا خرج ظلُّ «أخرى» أسودَ. */}
                            <CarThumb vehicle={c.vehicle} className="h-9 w-9 text-slate-400" />
                            <span className="leading-tight">
                              <span className="block text-[11px] font-bold text-slate-700">{VEHICLE_LABELS[asVehicle(c.vehicle)]}</span>
                              <span className="block font-mono text-[10px] text-slate-400" dir="ltr">
                                {c.code}
                              </span>
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex min-h-[44px] items-center gap-2 border-t border-slate-100 pt-3">
                      <a href={bookingHref(head.code, head.phone)} className="flex min-h-[44px] flex-1 items-center text-[12px] font-bold text-brand-700 underline">
                        عرض الحجز
                      </a>
                      {canReview(head) && (
                        <a href={bookingHref(head.code, head.phone)} className="btn-primary min-h-[36px] px-3 text-[12px]">
                          قيّم تجربتك ⭐
                        </a>
                      )}
                      {!grouped && (
                        <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                          {head.code}
                        </span>
                      )}
                    </div>

                    {editable && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {grouped ? (
                          <button type="button" onClick={() => editGroup(o)} disabled={acting === o.key} className="btn-ghost min-h-[40px] px-2 text-[12px]">
                            <CalendarIcon className="h-4 w-4" />
                            تعديل الموعد
                          </button>
                        ) : (
                          <a href={`/wash/book/?id=${head.wash_id}&replace=${encodeURIComponent(head.code)}`} className="btn-ghost min-h-[40px] px-2 text-[12px]">
                            <CalendarIcon className="h-4 w-4" />
                            تعديل الموعد
                          </a>
                        )}
                        <button type="button" onClick={() => cancel(o)} disabled={acting === o.key} className="btn min-h-[40px] border border-red-100 px-2 text-[12px] text-red-700 active:bg-red-50">
                          {acting === o.key ? <SpinnerIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                          {grouped ? 'إلغاء الطلب' : 'إلغاء'}
                        </button>
                        {head.lat != null && head.lng != null && (
                          <RouteCell lat={head.lat} lng={head.lng} compact className="rounded-xl border border-brand-100 [&>div>button]:min-h-[40px]" labelClass="text-[12px] font-bold text-brand-700">
                            <MapPinIcon className="h-4 w-4" />
                            الموقع
                          </RouteCell>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-[11px] text-slate-400">تُحفظ حجوزاتك على هذا الجهاز.</p>
    </main>
  );
}
