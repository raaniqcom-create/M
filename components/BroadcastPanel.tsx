'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CITY_NAMES } from '@/lib/cities';
import { SpinnerIcon } from './icons';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function call(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? 'تعذّر إتمام الطلب');
  return out;
}

/** Sending costs credit and reaches real phones, so the flow is deliberately
 *  two steps: see the count, then confirm. No single tap can spend the balance. */
export function BroadcastPanel() {
  const [message, setMessage] = useState('');
  const [city, setCity] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const { count: n } = await call({ action: 'count', city: city || null });
      setCount(n);
    } catch {
      setCount(null);
    }
  }, [city]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await call({ action: 'send', message, city: city || null });
      setResult(`أُرسلت إلى ${r.sent} من ${r.total}${r.failed ? ` · تعذّر ${r.failed}` : ''}`);
      setMessage('');
      setConfirming(false);
      await refreshCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold">إرسال عرض للمشتركين</h2>
      <p className="mt-1 text-xs text-slate-400">
        تصل رسالة نصية لمن سجّلوا في «اشترك بالعروض». كل رسالة تُحتسب من رصيدك.
      </p>

      <label htmlFor="bc-city" className="mt-4 block text-xs font-bold text-slate-600">
        المدينة
      </label>
      <select
        id="bc-city"
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          setConfirming(false);
        }}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
      >
        <option value="">كل المشتركين</option>
        {CITY_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label htmlFor="bc-msg" className="mt-3 block text-xs font-bold text-slate-600">
        نصّ الرسالة
      </label>
      <textarea
        id="bc-msg"
        rows={3}
        value={message}
        maxLength={300}
        onChange={(e) => {
          setMessage(e.target.value);
          setConfirming(false);
        }}
        placeholder="مثال: بانزين محسن متوفر الآن في محطة السينما — الرمادي"
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
      />
      <p className="mt-1 text-[11px] text-slate-400">
        {message.length}/300 · المستلمون: <b>{count ?? '—'}</b>
      </p>

      {!confirming ? (
        <button
          type="button"
          disabled={message.trim().length < 5 || !count}
          onClick={() => setConfirming(true)}
          className="btn-primary mt-3 w-full"
        >
          مراجعة قبل الإرسال
        </button>
      ) : (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-900">
            سترسل هذه الرسالة إلى {count} رقماً. لا يمكن التراجع بعد الإرسال.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={send} className="btn-primary">
              {busy && <SpinnerIcon className="h-4 w-4" />}
              تأكيد الإرسال
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-ghost">
              رجوع
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">{result}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
