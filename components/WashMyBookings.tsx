'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { pokeWashTick } from '@/lib/washConfig';
import { ACTIVE_STATUSES, BOOKING_LABELS, at12, bookingHref, dateLine, iqd, readMyBookings, rememberBooking, type BookingStatus, type MyBooking } from '@/lib/wash';
import { BOOKING_PILL, RouteCell } from './WashBookingScreen';
import { CalendarIcon, MapPinIcon, SpinnerIcon, WashIcon, XIcon } from './icons';

/** ما يردّه wash_my_bookings لكلّ رمز. */
type Remote = { code: string; status: BookingStatus; starts_at: string; ends_at: string; service: string; price: number; wash: string; wash_id: string; address: string; lat: number; lng: number; vehicle: string | null; late: boolean; service_id: string };
/** الصفُّ المحلّيّ + ما يُحفظ منه من القاعدة كي تعمل الصفحة بلا شبكة. */
type Row = MyBooking & { address?: string; lat?: number; lng?: number };

type Tab = 'upcoming' | 'past' | 'cancelled';
const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'upcoming', label: 'القادمة', empty: 'لا حجوزات قادمة.' },
  { key: 'past', label: 'السابقة', empty: 'لا حجوزات سابقة.' },
  { key: 'cancelled', label: 'الملغاة', empty: 'لا حجوزات ملغاة.' },
];

const CANCELLED: (BookingStatus | undefined)[] = ['cancelled', 'cancelled_by_business'];
function tabOf(b: Row, now: number): Tab {
  if (CANCELLED.includes(b.status)) return 'cancelled';
  const active = b.status === undefined || ACTIVE_STATUSES.includes(b.status);
  return active && Date.parse(b.starts_at) >= now - 2 * 3_600_000 ? 'upcoming' : 'past';
}

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
    Promise.all([...byPhone].map(([phone, codes]) => supabase.rpc('wash_my_bookings', { p_codes: codes.slice(0, 20), p_phone: phone }))).then((res) => {
      if (!alive) return;
      const remote = new Map(res.flatMap((r) => ((r.data ?? []) as Remote[]).map((x) => [x.code, x] as const)));
      const merged = local.map((b) => {
        const r = remote.get(b.code);
        return r ? { ...b, status: r.status, starts_at: r.starts_at, service: r.service, price: r.price, wash: r.wash, wash_id: r.wash_id, address: r.address, lat: r.lat, lng: r.lng } : b;
      });
      // تُحفظ معكوسةً لأنّ rememberBooking تُصدّر — فيبقى الترتيبُ كما كان.
      [...merged].reverse().forEach(rememberBooking);
      setRows(merged);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function cancel(b: Row) {
    if (!confirm('إلغاء الحجز؟')) return;
    setErr('');
    setActing(b.code);
    const { data, error } = await supabase.rpc('cancel_wash_booking', { p_code: b.code, p_phone: b.phone });
    setActing('');
    if (error || !data) return setErr(error?.message ?? 'تعذّر الإلغاء.');
    pokeWashTick();
    const next = { ...b, status: 'cancelled' as const };
    rememberBooking(next);
    setRows((all) => (all ?? []).map((x) => (x.code === b.code ? next : x)));
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
  const list = rows.filter((b) => tabOf(b, now) === tab).sort((a, b) => (tab === 'upcoming' ? Date.parse(a.starts_at) - Date.parse(b.starts_at) : Date.parse(b.starts_at) - Date.parse(a.starts_at)));

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
          {list.map((b) => {
            const editable = tab === 'upcoming' && (b.status === undefined || b.status === 'pending' || b.status === 'confirmed');
            return (
              <li key={b.code} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-800">{b.wash}</p>
                    {b.service && <p className="mt-0.5 text-[12px] text-slate-500">{b.service}</p>}
                    <p className="mt-1 flex items-center gap-1 text-[13px] text-slate-700">
                      <CalendarIcon className="h-3.5 w-3.5 text-brand" />
                      {dateLine(b.starts_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {at12(b.starts_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${b.status ? BOOKING_PILL[b.status] : 'bg-slate-100 text-slate-500'}`}>{b.status ? BOOKING_LABELS[b.status] : '—'}</span>
                    {b.price != null && <p className="mt-1 text-[12px] font-bold text-brand-700">{iqd(b.price)}</p>}
                  </div>
                </div>

                <div className="mt-3 flex min-h-[44px] items-center gap-2 border-t border-slate-100 pt-3">
                  <a href={bookingHref(b.code, b.phone)} className="flex min-h-[44px] flex-1 items-center text-[12px] font-bold text-brand-700 underline">
                    عرض الحجز
                  </a>
                  <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                    {b.code}
                  </span>
                </div>

                {editable && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <a href={`/wash/book/?id=${b.wash_id}&replace=${encodeURIComponent(b.code)}`} className="btn-ghost min-h-[40px] px-2 text-[12px]">
                      <CalendarIcon className="h-4 w-4" />
                      تعديل الموعد
                    </a>
                    <button type="button" onClick={() => cancel(b)} disabled={acting === b.code} className="btn min-h-[40px] border border-red-100 px-2 text-[12px] text-red-700 active:bg-red-50">
                      {acting === b.code ? <SpinnerIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                      إلغاء
                    </button>
                    {b.lat != null && b.lng != null && (
                      <RouteCell lat={b.lat} lng={b.lng} compact className="rounded-xl border border-brand-100 [&>div>button]:min-h-[40px]" labelClass="text-[12px] font-bold text-brand-700">
                        <MapPinIcon className="h-4 w-4" />
                        الموقع
                      </RouteCell>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-[11px] text-slate-400">تُحفظ حجوزاتك على هذا الجهاز.</p>
    </main>
  );
}
