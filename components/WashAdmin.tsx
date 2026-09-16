'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hoursLabel } from '@/lib/hours';
import { num } from '@/lib/num';
import { displayPhone, normalizePhone, whatsappLink } from '@/lib/phone';
import { BOOKING_LABELS, bgdDate, firstMonthPrice, iqd, planName, type CarWash, type WashBooking, type WashConfig, type WashPayment } from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { WashPlansAdmin } from './WashPlansAdmin';
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

/** واتساب صاحب المغسلة الجديدة — رسالةُ الاشتراك بسعر باقته وعرضِ الإطلاق إن كان. */
function waSignup(w: CarWash, cfg: WashConfig | null): string {
  const plan = cfg?.plans.find((p) => p.code === w.plan);
  const price = plan ? firstMonthPrice(plan, cfg?.promo_first_month ?? 0, false) : null;
  const line = plan && price !== null
    ? `الاشتراك (${plan.name}) ${iqd(price)} لأوّل شهر${price !== plan.price_iqd ? ` ثمّ ${iqd(plan.price_iqd)} شهريّاً` : ' شهريّاً'}`
    : 'الاشتراك الشهريّ';
  const text = `السلام عليكم، وصل طلب تسجيل مغسلة ${w.name} في المحطة التقنية. ${line} — بعد التحويل نفعّل الصفحة مباشرة.`;
  return `https://wa.me/964${normalizePhone(w.phone)}?text=${encodeURIComponent(text)}`;
}

/** ورقةُ «تسجيل دفعة»: الباقةُ والمبلغُ والأيّام — تُفعّل المغسلةَ وتمدّ الاشتراكَ (admin_wash_payment). */
function PaymentForm({
  wash,
  cfg,
  paidBefore,
  onDone,
  onCancel,
}: {
  wash: CarWash;
  cfg: WashConfig | null;
  paidBefore: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const plans = cfg?.plans ?? [];
  const [plan, setPlan] = useState(plans.some((p) => p.code === wash.plan) ? wash.plan : (plans[0]?.code ?? 'basic'));
  const chosen = plans.find((p) => p.code === plan);
  const suggested = chosen ? firstMonthPrice(chosen, cfg?.promo_first_month ?? 0, paidBefore) : 0;
  const [amount, setAmount] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = amount ?? suggested;

  async function save() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('admin_wash_payment', { p_wash: wash.id, p_plan: plan, p_amount: value, p_days: days, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <div className="mt-2 rounded-xl bg-brand-50 p-3">
      <p className="text-xs font-bold text-brand-800">تسجيل دفعة — تُفعّل الصفحة وتمدّ الاشتراك</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label htmlFor={`plan-${wash.id}`} className="label text-[11px]">الباقة</label>
          <select id={`plan-${wash.id}`} value={plan} onChange={(e) => { setPlan(e.target.value); setAmount(null); }} className="field py-2 text-sm">
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — {iqd(p.price_iqd)}
              </option>
            ))}
            {!plans.some((p) => p.code === 'free') && <option value="free">مجّانيّة</option>}
          </select>
        </div>
        <div>
          <label htmlFor={`amt-${wash.id}`} className="label text-[11px]">المبلغ المستلَم (دينار)</label>
          <input id={`amt-${wash.id}`} type="number" inputMode="numeric" min={0} step={1000} value={value} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} className="field py-2 text-sm" dir="ltr" />
          {chosen && suggested !== chosen.price_iqd && <p className="mt-0.5 text-[10.5px] text-brand-700">عرض الإطلاق لأوّل شهر</p>}
        </div>
        <div>
          <label htmlFor={`days-${wash.id}`} className="label text-[11px]">الأيّام</label>
          <select id={`days-${wash.id}`} value={days} onChange={(e) => setDays(Number(e.target.value))} className="field py-2 text-sm">
            {[30, 90, 180, 365].map((d) => (
              <option key={d} value={d}>{d} يوماً</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label htmlFor={`note-${wash.id}`} className="label text-[11px]">ملاحظة (اختياريّة)</label>
          <input id={`note-${wash.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="field py-2 text-sm" placeholder="تحويل زين كاش، رقم الوصل…" />
        </div>
      </div>
      {err && <p role="alert" className="mt-2 text-[11px] text-traffic-red">{err}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={save} className="btn-primary text-xs">
          {busy ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
          تفعيل حتى {new Date(`${bgdDate(days, Math.max(Date.now(), wash.paid_until ? Date.parse(wash.paid_until) : 0))}T12:00:00`).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'numeric' })}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">تراجع</button>
      </div>
    </div>
  );
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
  /** المغسلةُ المفتوحةُ لها ورقةُ الدفع، وسجلُّ الدفعات المجلوب. */
  const [paying, setPaying] = useState<string | null>(null);
  const [payments, setPayments] = useState<Record<string, WashPayment[]>>({});
  const [showPlans, setShowPlans] = useState(false);
  const cfg = useWashConfig();

  const load = useCallback(async () => {
    const [s, w, p] = await Promise.all([
      supabase.rpc('wash_admin_stats'),
      supabase.from('car_washes').select('*').order('created_at', { ascending: false }).range(0, 499),
      supabase.from('wash_payments').select('id, wash_id, plan, amount_iqd, days, note, created_at').order('created_at', { ascending: false }).range(0, 999),
    ]);
    if (s.error || w.error) setNote((s.error ?? w.error)!.message);
    setStats((s.data as Stats | null) ?? null);
    setRows((w.data as CarWash[] | null) ?? []);
    const byWash: Record<string, WashPayment[]> = {};
    for (const row of (p.data ?? []) as WashPayment[]) (byWash[row.wash_id] ??= []).push(row);
    setPayments(byWash);
  }, []);

  /** التجربةُ المجّانيّة: دفعةٌ بصفر دينار لعدد أيّام التجربة على باقة المغسلة. */
  async function trial(w: CarWash) {
    setBusy(w.id);
    const { error } = await supabase.rpc('admin_wash_payment', { p_wash: w.id, p_plan: w.plan, p_amount: 0, p_days: cfg?.trial_days ?? 7, p_note: 'تجربة مجّانيّة' });
    setBusy(null);
    if (error) return setNote(error.message);
    void load();
  }

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
                <a href={waSignup(w, cfg)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 text-brand">
                  <WhatsappIcon className="h-4 w-4" />
                  واتساب الاشتراك
                </a>
                <a href={`/wash/detail/?id=${w.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 text-brand">
                  <EyeIcon className="h-4 w-4" />
                  معاينة
                </a>
              </div>
              <p className="text-[10.5px] text-slate-400">
                المعاينةُ تفتح بعد الاعتماد فقط · طلب الباقة: <b>{planName(cfg, w.plan)}</b>{w.owner_name ? ` · ${w.owner_name}` : ''}
              </p>

              {paying === w.id ? (
                <PaymentForm wash={w} cfg={cfg} paidBefore={!!payments[w.id]?.length} onDone={() => { setPaying(null); void load(); }} onCancel={() => setPaying(null)} />
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy === w.id} onClick={() => setPaying(w.id)} className="btn-primary text-xs">
                    <CheckIcon className="h-4 w-4" />
                    تسجيل دفعة وتفعيل
                  </button>
                  {cfg && cfg.trial_days > 0 ? (
                    <button type="button" disabled={busy === w.id} onClick={() => trial(w)} className="btn-ghost text-xs">
                      تجربة {cfg.trial_days} أيّام
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              )}
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
                      {w.city} · {planName(cfg, w.plan)}
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
                {paying === w.id && (
                  <PaymentForm wash={w} cfg={cfg} paidBefore={!!payments[w.id]?.length} onDone={() => { setPaying(null); void load(); }} onCancel={() => setPaying(null)} />
                )}
                {!!payments[w.id]?.length && (
                  <p className="mt-1 text-[10.5px] text-slate-400">
                    آخر دفعة: {iqd(payments[w.id][0].amount_iqd)} · {payments[w.id][0].days} يوماً · {fmtDay(payments[w.id][0].created_at.slice(0, 10))}
                    {payments[w.id].length > 1 ? ` · (${payments[w.id].length} دفعات)` : ''}
                  </p>
                )}
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button type="button" disabled={busy === w.id} onClick={() => setPaying(paying === w.id ? null : w.id)} className="min-h-[40px] rounded-lg bg-brand-50 text-[11px] font-bold text-brand-800 disabled:opacity-50">
                    تسجيل دفعة
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

      <section className="card p-5">
        <button type="button" onClick={() => setShowPlans((v) => !v)} aria-expanded={showPlans} className="flex w-full items-center justify-between text-sm font-bold">
          الباقات والإعدادات
          <span className="text-[11px] font-semibold text-brand">{showPlans ? 'إخفاء' : 'فتح'}</span>
        </button>
        {showPlans && (
          <div className="mt-3">
            <WashPlansAdmin />
          </div>
        )}
      </section>
    </div>
  );
}
