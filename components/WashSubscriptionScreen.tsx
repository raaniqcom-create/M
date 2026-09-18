'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ADMIN_WA } from '@/lib/phone';
import { dateLine, daysLeft, firstMonthPrice, iqd, type CarWash, type WashPayment } from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { MAX_SIDE, shrinkImage } from '@/lib/washUpload';
import { Sheet } from './Sheet';
import { CheckIcon, SpinnerIcon, WhatsappIcon } from './icons';

/** جلسةُ الدفع: يذهب المالكُ إلى تطبيق البنك ويعود — اختيارُه محفوظٌ عشرين دقيقة. */
const PAY_KEY = 'wash-pay';
const PAY_MS = 20 * 60_000;
/** ما يكتبه في ملاحظات التحويل كي تعرفه الإدارة. */
const NOTE = 'المغسلة';
const METHODS = [
  { code: 'zaincash', name: 'زين كاش', lines: [['رقم زين كاش', '07844446633']], qr: '/z.png' },
  { code: 'qicard', name: 'كي كارد — سوبر كي', lines: [['رقم سوبر كي', '07844446633'], ['رقم الحساب', '7117309554']], qr: '/Q.jpg' },
] as const;
type MethodCode = (typeof METHODS)[number]['code'];
type WakeLock = { request(t: 'screen'): Promise<{ release(): Promise<void> }> };

const longDay = (d: string) => dateLine(d, { day: 'numeric', month: 'long', year: 'numeric' });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** ‎/wash/owner/subscription/ — أرقامُ التحويل ورموزُ QR، ورفعُ الإيصال أو «الدفع لاحقاً» (claim_wash_payment). */
export function WashSubscriptionScreen() {
  const cfg = useWashConfig();
  const [auth, setAuth] = useState<'checking' | 'none' | 'ok'>('checking');
  const [wash, setWash] = useState<CarWash | null | undefined>(undefined);
  /** my_wash تعيد المغسلةَ للموظّف أيضاً، وclaim_wash_payment للمالك وحدَه — فتُخفى أزرارُ الدفع عنه. */
  const [owns, setOwns] = useState(false);
  const [payments, setPayments] = useState<WashPayment[]>([]);
  const [plan, setPlan] = useState('');
  const [method, setMethod] = useState<MethodCode | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [qr, setQr] = useState<MethodCode | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const loadPayments = useCallback(async (washId: string) => {
    const { data } = await supabase.from('wash_payments').select('*').eq('wash_id', washId).order('created_at', { ascending: false }).limit(5);
    setPayments((data as WashPayment[] | null) ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) return setAuth('none');
      setAuth('ok');
      const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
      const w = (mine as CarWash | null) ?? null;
      if (w) {
        const [{ data: o }] = await Promise.all([supabase.rpc('owns_wash', { p_wash: w.id }), loadPayments(w.id)]);
        if (!alive) return;
        setOwns(o === true);
        setPlan(w.plan);
      }
      if (!alive) return;
      setWash(w);
    })();
    return () => {
      alive = false;
    };
  }, [loadPayments]);

  // استعادةُ جلسة الدفع إن لم تنقضِ العشرون دقيقة.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PAY_KEY) ?? 'null') as { method: MethodCode; startedAt: number } | null;
      if (s && Date.now() < s.startedAt + PAY_MS) {
        setMethod(s.method);
        setStartedAt(s.startedAt);
      } else localStorage.removeItem(PAY_KEY);
    } catch {}
  }, []);

  // العدُّ التنازليّ، وإبقاءُ الشاشة مضاءةً ما دامت الجلسةُ حيّة.
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => {
      if (Date.now() >= startedAt + PAY_MS) {
        try {
          localStorage.removeItem(PAY_KEY);
        } catch {}
        setStartedAt(null);
      } else setTick((t) => t + 1);
    }, 1000);
    let lock: { release(): Promise<void> } | null = null;
    const wake = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock?.request('screen')) ?? null;
      } catch {}
    };
    const onVisible = () => document.visibilityState === 'visible' && wake();
    wake();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [startedAt]);

  function startSession(m: MethodCode) {
    const t = Date.now();
    setMethod(m);
    setStartedAt(t);
    try {
      localStorage.setItem(PAY_KEY, JSON.stringify({ method: m, startedAt: t }));
    } catch {}
  }

  async function copy(v: string, m?: MethodCode) {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied(null), 3000);
    } catch {}
    if (m) startSession(m);
  }

  const paidBefore = payments.some((p) => p.status === 'paid');
  const chosen = cfg?.plans.find((p) => p.code === plan) ?? cfg?.plans[0];
  const amount = chosen && cfg ? firstMonthPrice(chosen, cfg.promo_first_month, paidBefore) : 0;
  const open = payments.find((p) => p.status === 'claimed');
  const last = payments[0];

  /** الأزرارُ لا تعمل قبل وصول الباقات (cfg) ولا لغير المالك — وإلّا رُفع إيصالٌ بلا مطالبة. */
  const ready = !!chosen && owns && !busy;

  async function claim(m: MethodCode | 'later', receipt: string | null) {
    if (!wash) return;
    setBusy(true);
    setErr(null);
    setSent(false);
    try {
      if (!chosen) throw new Error('الباقات لم تصل بعد — حدّث الصفحة وحاول مجدداً.');
      const { error } = await supabase.rpc('claim_wash_payment', {
        p_wash: wash.id,
        p_plan: chosen.code,
        p_amount: amount,
        p_method: m,
        p_receipt_path: receipt,
      });
      if (error) throw error;
      try {
        localStorage.removeItem(PAY_KEY);
      } catch {}
      setStartedAt(null);
      setSent(m !== 'later');
      await loadPayments(wash.id);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      setErr(msg.startsWith('ال') ? msg : 'تعذّر الإرسال. حاول مجدداً.');
    } finally {
      setBusy(false);
    }
  }

  async function pickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !wash) return;
    setBusy(true);
    setErr(null);
    setSent(false);
    // حاويةُ wash-receipts خاصّة: لا رابطَ عامّاً — يُخزَّن المسارُ وتُوقّعه الإدارةُ عند العرض.
    const path = `${wash.id}/receipt-${Date.now()}.jpg`;
    try {
      const { error } = await supabase.storage.from('wash-receipts').upload(path, await shrinkImage(file, MAX_SIDE), { contentType: 'image/jpeg' });
      if (error) throw error;
    } catch {
      setErr('تعذّر رفع الإيصال — جرّب صورةً أخرى.');
      setBusy(false);
      return;
    }
    await claim(method ?? 'zaincash', path);
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
      </main>
    );
  }

  const left = daysLeft(wash.paid_until);
  const until = wash.paid_until ? longDay(wash.paid_until) : null;
  const remaining = startedAt ? startedAt + PAY_MS - Date.now() : 0;
  const qrMethod = METHODS.find((m) => m.code === qr);
  const wa = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(
    `السلام عليكم، إيصال دفع اشتراك مغسلة «${wash.name}» (${chosen?.name ?? wash.plan}) — ${iqd(amount)}. ملاحظة التحويل: ${NOTE}`
  )}`;
  const copyBtn = (v: string, m?: MethodCode) => (
    <button type="button" onClick={() => copy(v, m)} className="btn-ghost shrink-0 px-3 py-1 text-xs">
      {copied === v ? <CheckIcon className="h-4 w-4 text-brand" /> : null}
      {copied === v ? 'تم النسخ' : 'نسخ'}
    </button>
  );

  return (
    <main dir="rtl" className="mx-auto max-w-md space-y-4 p-4">
      <section className="card p-5">
        <h1 className="text-lg font-extrabold text-slate-800">إدارة الاشتراك</h1>
        {chosen && (
          <p className="mt-2 text-sm font-bold text-slate-700">
            باقة {chosen.name} — {iqd(amount)}
            <span className="mr-1 text-[11px] font-normal text-slate-500">{amount !== chosen.price_iqd ? 'عرض الإطلاق لأوّل شهر' : 'شهريّاً'}</span>
          </p>
        )}
        {cfg && cfg.plans.length > 1 && (
          <select className="field mt-2" value={chosen?.code ?? plan} onChange={(e) => setPlan(e.target.value)} aria-label="الباقة">
            {cfg.plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — {iqd(p.price_iqd)}
              </option>
            ))}
          </select>
        )}
        <p className="mt-2 text-[12px] text-slate-600">
          {left === null ? 'لم يُفعَّل الاشتراك بعد' : left >= 0 ? `فعّال حتى ${until} — بقي ${left} يوماً` : `انتهى في ${until} — جدّد الاشتراك`}
        </p>
        {open?.method === 'later' ? (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
            اخترت الدفع لاحقاً — حسابك غير مفعّل حتى تضيف إيصال الدفع وتكتب في ملاحظات التحويل «{NOTE}»
          </p>
        ) : open ? (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
            إيصالك بانتظار التدقيق — سنفعّل اشتراكك بعد التحقّق
          </p>
        ) : last?.status === 'rejected' ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] leading-relaxed text-traffic-red">
            رُفض الإيصال{last.admin_note ? ` — ${last.admin_note}` : ''} — أرسل إيصالاً آخر
          </p>
        ) : null}
        {startedAt && (
          <p className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">
            جلسة الدفع محفوظة <span className="font-mono tabular-nums">{mmss(remaining)}</span> — اذهب إلى تطبيق البنك وعُد، اختيارك محفوظ
          </p>
        )}
      </section>

      {METHODS.map((m) => (
        <section key={m.code} className="card p-5">
          <h2 className="text-sm font-extrabold text-slate-800">{m.name}</h2>
          {m.lines.map(([label, value]) => (
            <div key={label} className="mt-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-slate-500">{label}</p>
                <p dir="ltr" className="select-all font-mono text-base font-bold text-slate-800">
                  {value}
                </p>
              </div>
              {copyBtn(value, m.code)}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              startSession(m.code);
              setQr(m.code);
            }}
            className="btn-primary mt-3 w-full text-xs"
          >
            عرض رمز QR
          </button>
        </section>
      ))}

      <section className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-slate-600">
            اكتب في ملاحظات التحويل: <b className="text-slate-800">«{NOTE}»</b>
          </p>
          {copyBtn(NOTE)}
        </div>
        {owns ? (
          <label className={`btn-primary mt-3 w-full cursor-pointer ${ready ? '' : 'pointer-events-none opacity-60'}`}>
            {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
            {busy ? 'جارٍ الرفع…' : 'رفع إيصال الدفع'}
            <input type="file" accept="image/*" className="hidden" onChange={pickReceipt} disabled={!ready} />
          </label>
        ) : (
          <p className="mt-3 text-[12px] text-slate-500">رفعُ الإيصال واختيارُ الدفع لصاحب المغسلة وحدَه.</p>
        )}
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-2 w-full">
          <WhatsappIcon className="h-4 w-4" />
          إرسال الإيصال عبر واتساب
        </a>
        {owns && (
          <button
            type="button"
            onClick={() => claim('later', null)}
            disabled={!ready || !!open}
            className="mt-3 w-full text-center text-[12px] font-bold text-slate-500 underline disabled:opacity-50"
          >
            الدفع لاحقاً
          </button>
        )}
        {sent && (
          <p className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-[12px] leading-relaxed text-brand-800">
            وصل إيصالك — سنفعّل اشتراكك بعد التدقيق.
          </p>
        )}
        {err && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] leading-relaxed text-traffic-red">
            {err}
          </p>
        )}
      </section>

      <a href="/wash/owner/" className="btn-ghost w-full">
        لوحة المغسلة
      </a>

      <Sheet open={!!qrMethod} onClose={() => setQr(null)} title={`ادفع عبر ${qrMethod?.name ?? ''}`}>
        <p className="text-center text-3xl font-extrabold tabular-nums text-brand-700">{iqd(amount)}</p>
        <p className="mt-1 text-center text-[12px] text-slate-600">المبلغ المطلوب — يُدخله وكيل التحويل ويرسله إلى الرمز</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[12px] text-slate-600">
            اكتب في الملاحظات: <b className="text-slate-800">{NOTE}</b>
          </p>
          {copyBtn(NOTE)}
        </div>
        {qrMethod && <img src={qrMethod.qr} alt="رمز الدفع" className="mt-3 w-full rounded-xl bg-white" />}
      </Sheet>
    </main>
  );
}
