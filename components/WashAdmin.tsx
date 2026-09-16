'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hoursLabel } from '@/lib/hours';
import { num } from '@/lib/num';
import { displayPhone, normalizePhone, whatsappLink } from '@/lib/phone';
import { BOOKING_LABELS, PLAN_LABELS, WASH, bgdDate, iqd, type CarWash, type WashBooking } from '@/lib/wash';
import { CheckIcon, EyeIcon, PhoneIcon, SpinnerIcon, WhatsappIcon, XIcon } from './icons';

/** ما تردّه wash_admin_stats: منشورةٌ الآن، معلّقة، تنتهي خلال أسبوع، منتهية؛ وحجوزاتُ اليوم والشهر. */
interface Stats {
  live: number;
  pending: number;
  expiring: number;
  expired: number;
  today: number;
  month: number;
}

type Booking = Pick<WashBooking, 'id' | 'code' | 'name' | 'phone' | 'starts_at' | 'status' | 'service_name'>;

const STATUS: Record<CarWash['status'], { label: string; cls: string }> = {
  pending: { label: 'بانتظار الاعتماد', cls: 'bg-amber-50 text-amber-800' },
  approved: { label: 'فعّالة', cls: 'bg-brand-50 text-brand-700' },
  rejected: { label: 'مرفوضة', cls: 'bg-slate-100 text-slate-500' },
  suspended: { label: 'موقوفة', cls: 'bg-red-50 text-traffic-red' },
};
const ORDER: Record<CarWash['status'], number> = { approved: 0, suspended: 1, rejected: 2, pending: 3 };

const DAY = 86_400_000;

/** واتساب صاحب المغسلة الجديدة — رسالةُ الاشتراك جاهزة. */
function waSignup(w: CarWash): string {
  const text = `السلام عليكم، وصل طلب تسجيل مغسلة ${w.name} في المحطة التقنية. الاشتراك ${iqd(WASH.monthlyIqd)} شهريّاً — بعد التحويل نفعّل الصفحة مباشرة.`;
  return `https://wa.me/964${normalizePhone(w.phone)}?text=${encodeURIComponent(text)}`;
}

const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });

const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** «ينتهي خلال ٣ أيام» / «منتهٍ» — أو لا شيء حين الوقتُ بعيد. */
function paidBadge(paid: string | null): { text: string; cls: string } | null {
  if (!paid) return null;
  const days = Math.round((Date.parse(paid) - Date.parse(bgdDate())) / DAY);
  if (days < 0) return { text: 'منتهٍ', cls: 'bg-red-50 text-traffic-red' };
  if (days <= 7) return { text: `ينتهي خلال ${days} أيام`, cls: 'bg-amber-50 text-amber-800' };
  return null;
}

/** «غسيل» في الإدارة: اعتمادُ المغاسل وتمديدُ اشتراكها وحجوزاتُها. */
export function WashAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<CarWash[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** المغسلةُ التي فُتح لها حقلُ سبب الرفض. */
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  /** المغسلةُ المفتوحةُ حجوزاتُها، وما جُلب منها. */
  const [open, setOpen] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Record<string, Booking[]>>({});

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      supabase.rpc('wash_admin_stats'),
      supabase.from('car_washes').select('*').order('created_at', { ascending: false }),
    ]);
    if (s.error || w.error) setNote((s.error ?? w.error)!.message);
    setStats((s.data as Stats | null) ?? null);
    setRows((w.data as CarWash[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** admin_set_wash تُبقي ما مُرّر إليها null على حاله (coalesce). */
  async function set(w: CarWash, status: CarWash['status'], plan: CarWash['plan'] | null, paid: string | null) {
    setBusy(w.id);
    const { error } = await supabase.rpc('admin_set_wash', { p_id: w.id, p_status: status, p_plan: plan, p_paid_until: paid });
    setBusy(null);
    if (error) return setNote(error.message);
    setNote(null);
    void load();
  }

  /** الرفضُ بسببٍ: السببُ في admin_note مباشرةً، ثمّ الحالة. */
  async function reject(w: CarWash) {
    setBusy(w.id);
    const { error } = await supabase.from('car_washes').update({ admin_note: reason.trim() || null }).eq('id', w.id);
    if (error) {
      setBusy(null);
      return setNote(error.message);
    }
    await set(w, 'rejected', null, null);
    setRejecting(null);
    setReason('');
  }

  async function toggleBookings(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (bookings[id]) return;
    const { data, error } = await supabase
      .from('wash_bookings')
      .select('id, code, name, phone, starts_at, status, service_name')
      .eq('wash_id', id)
      .order('starts_at', { ascending: false })
      .limit(20);
    if (error) return setNote(error.message);
    setBookings((prev) => ({ ...prev, [id]: (data ?? []) as Booking[] }));
  }

  if (!rows) {
    return (
      <div className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  const pending = rows.filter((w) => w.status === 'pending');
  const rest = rows
    .filter((w) => w.status !== 'pending')
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, 'ar'));

  return (
    <div className="space-y-4">
      {note && (
        <div className="rounded-xl border border-traffic-red bg-red-50 p-3">
          <p className="text-xs leading-relaxed text-traffic-red">{note}</p>
          <button type="button" onClick={() => setNote(null)} className="mt-2 text-[11px] font-bold text-traffic-red underline">
            إخفاء
          </button>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-bold">المغاسل</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'منشورة الآن', value: stats?.live, tone: 'brand' },
            { label: 'بانتظار الاعتماد', value: stats?.pending, warn: !!stats?.pending },
            { label: 'تنتهي خلال أسبوع', value: stats?.expiring, warn: !!stats?.expiring },
            { label: 'منتهية', value: stats?.expired, warn: !!stats?.expired },
            { label: 'حجوزات اليوم', value: stats?.today },
            { label: 'حجوزات الشهر', value: stats?.month },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl py-2.5 text-center ${s.tone ? 'bg-brand-50' : 'bg-slate-50'}`}>
              <p className={`text-lg font-extrabold leading-none tabular-nums ${s.warn ? 'text-traffic-red' : s.tone ? 'text-brand-700' : 'text-slate-700'}`}>
                {num(s.value)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">طلبات جديدة ({pending.length})</h2>
        {pending.length === 0 && <p className="mt-2 text-sm text-slate-400">لا طلباتَ معلّقة</p>}
        <div className="mt-2 space-y-3">
          {pending.map((w) => (
            <article key={w.id} className="rounded-xl border border-slate-200 p-3">
              <h3 className="text-base font-bold">{w.name}</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                {w.city} — {w.address}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {hoursLabel(w)} · {w.bays} {w.bays === 1 ? 'خطّ' : 'خطوط'} · {fmtAt(w.created_at)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <a href={`tel:${w.phone}`} className="inline-flex min-h-[40px] items-center gap-1.5 text-brand">
                  <PhoneIcon className="h-4 w-4" />
                  <span dir="ltr">{displayPhone(w.phone)}</span>
                </a>
                <a href={waSignup(w)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 text-brand">
                  <WhatsappIcon className="h-4 w-4" />
                  واتساب الاشتراك
                </a>
                <a href={`/wash/detail/?id=${w.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 text-brand">
                  <EyeIcon className="h-4 w-4" />
                  معاينة
                </a>
              </div>
              <p className="text-[10.5px] text-slate-400">المعاينةُ تفتح بعد الاعتماد فقط.</p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === w.id} onClick={() => set(w, 'approved', 'monthly', bgdDate(30))} className="btn-primary text-xs">
                  <CheckIcon className="h-4 w-4" />
                  اعتماد + شهر
                </button>
                <button type="button" disabled={busy === w.id} onClick={() => set(w, 'approved', 'free', bgdDate(365))} className="btn-ghost text-xs">
                  اعتماد مجّاناً
                </button>
              </div>
              {rejecting === w.id ? (
                <div className="mt-2">
                  <label htmlFor={`why-${w.id}`} className="label text-xs">سبب الرفض</label>
                  <textarea id={`why-${w.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="field py-2 text-sm" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy === w.id} onClick={() => reject(w)} className="btn border border-traffic-red bg-white text-xs text-traffic-red">
                      <XIcon className="h-4 w-4" />
                      تأكيد الرفض
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className="btn-ghost text-xs">
                      تراجع
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setRejecting(w.id); setReason(''); }} className="mt-2 w-full text-xs font-bold text-traffic-red">
                  رفض
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">كلّ المغاسل ({rest.length})</h2>
        {rest.length === 0 && <p className="mt-2 text-sm text-slate-400">لا مغاسلَ بعد</p>}
        <ul className="mt-2">
          {rest.map((w) => {
            const badge = paidBadge(w.paid_until);
            const list = bookings[w.id];
            return (
              <li key={w.id} className="border-b border-slate-100 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-800">{w.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {w.city} · {PLAN_LABELS[w.plan]}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[w.status].cls}`}>
                    {STATUS[w.status].label}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  {w.paid_until ? `مدفوع حتى ${fmtDay(w.paid_until)}` : '—'}
                  {badge && <span className={`rounded-full px-2 py-px font-bold ${badge.cls}`}>{badge.text}</span>}
                </p>
                {w.admin_note && <p className="mt-1 text-[11px] text-amber-800">ملاحظة: {w.admin_note}</p>}
                <a href={whatsappLink(w.phone, w.name)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-brand">
                  <WhatsappIcon className="h-4 w-4" />
                  <span dir="ltr">{displayPhone(w.phone)}</span>
                </a>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button type="button" disabled={busy === w.id} onClick={() => set(w, 'approved', null, bgdDate(30, Math.max(Date.now(), w.paid_until ? Date.parse(w.paid_until) : 0)))} className="min-h-[40px] rounded-lg bg-brand-50 text-[11px] font-bold text-brand-800 disabled:opacity-50">
                    تمديد شهر
                  </button>
                  {w.status === 'approved' ? (
                    <button type="button" disabled={busy === w.id} onClick={() => set(w, 'suspended', null, null)} className="min-h-[40px] rounded-lg bg-red-50 text-[11px] font-bold text-traffic-red disabled:opacity-50">
                      إيقاف
                    </button>
                  ) : (
                    <button type="button" disabled={busy === w.id} onClick={() => set(w, 'approved', null, null)} className="min-h-[40px] rounded-lg bg-brand-50 text-[11px] font-bold text-brand-800 disabled:opacity-50">
                      إعادة تفعيل
                    </button>
                  )}
                  <button type="button" onClick={() => toggleBookings(w.id)} aria-expanded={open === w.id} className="min-h-[40px] rounded-lg bg-slate-100 text-[11px] font-bold text-slate-700">
                    حجوزات
                  </button>
                </div>
                {/* الدخولُ على لوحة المغسلة بصفة الإدارة — لمتابعة الوضع كما يراه صاحبُها. */}
                <a href={`/wash/owner/?id=${w.id}`} className="mt-1.5 flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700">
                  🛡 لوحة المغسلة (بصفة الإدارة)
                </a>
                {open === w.id && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-2 text-[11px]">
                    {!list ? (
                      <SpinnerIcon className="mx-auto h-4 w-4 text-brand" />
                    ) : list.length === 0 ? (
                      <p className="text-center text-slate-400">لا حجوزاتَ بعد</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {list.map((b) => (
                          <li key={b.id} className="flex flex-wrap items-center gap-x-2 border-b border-slate-200 pb-1.5 last:border-0 last:pb-0">
                            <span className="font-bold text-slate-700">{fmtAt(b.starts_at)}</span>
                            <span>{b.name}</span>
                            <span dir="ltr" className="text-slate-500">{displayPhone(b.phone)}</span>
                            <span className="text-slate-500">{b.service_name}</span>
                            <span className="ms-auto font-semibold text-slate-600">{BOOKING_LABELS[b.status]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
