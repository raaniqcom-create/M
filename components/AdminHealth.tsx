'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { ageLabel, isFresh, isOpenNow } from '@/lib/hours';
import { PRODUCT_LABELS } from '@/lib/products';
import { CheckIcon, SpinnerIcon, XIcon } from './icons';
import type { Station } from '@/types/database';

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}
interface Report {
  checks: Check[];
  counts: { stations: number; subscribers: number; devices: number };
  at: string;
}
interface Row extends Station {
  station_products: { product: string; is_available: boolean; updated_at: string | null }[];
}

const FN = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1';

/** The panel that answers "is it working?" without anyone guessing.
 *
 *  Every outage here looked the same from the outside — a green screen and no
 *  notification. So nothing on this page reports a stored setting: each row is
 *  the result of actually asking the vendor. Apple signs a token or it does
 *  not; Google issues one or it does not. A check that merely confirmed a
 *  secret was present would have passed on every day the platform was down. */
export function AdminHealth() {
  const [report, setReport] = useState<Report | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [title, setTitle] = useState('⛽ المحطة التقنية');
  const [text, setText] = useState('');
  const [reach, setReach] = useState<{ ios: number; android: number; web: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);

    const [h, s] = await Promise.all([
      callFn<Report>('health'),
      supabase
        .from('stations')
        .select('*, station_products(product, is_available, updated_at)')
        .in('status', ['approved', 'suspended'])
        .order('city'),
    ]);

    setError(h.error);
    setReport(h.data);
    setRows((s.data as Row[]) ?? []);
    setBusy(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Sends to this phone only, through the same path a real alert takes — a
   *  test that used a different path would prove nothing about the real one. */
  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const deviceToken = localStorage.getItem('device-token');
      if (!deviceToken) {
        setTestResult('لا يوجد رمز لهذا الجهاز — افتح التطبيق على هاتفك وفعّل الإشعارات أولاً.');
        return;
      }
      const res = await fetch(`${FN}/test-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ deviceToken }),
      });
      const out = await res.json().catch(() => null);
      setTestResult(
        res.ok && out?.sent
          ? '✅ أُرسل — تحقّق من هاتفك خلال ثوانٍ.'
          : `تعذّر الإرسال: ${out?.error ?? res.status}`
      );
    } catch {
      setTestResult('تعذّر الإرسال. تأكد من الاتصال.');
    } finally {
      setTesting(false);
    }
  }

  async function callAnnounce(dryRun: boolean) {
    const r = await callFn<{
      audience: { ios: number; android: number; web: number };
      ok: number;
      failed: number;
      pruned: number;
    }>('announce', { title, body: text, dryRun });
    return { ok: r.ok, out: r.data, error: r.error };
  }

  /** Counts before it sends. A notification cannot be recalled, so the number
   *  of phones about to buzz is shown while the decision is still reversible. */
  async function preview() {
    setSendResult(null);
    const { ok, out, error: why } = await callAnnounce(true);
    if (!ok || !out) return setSendResult(why ?? 'تعذّر الاتصال');
    setReach(out.audience);
    setConfirming(true);
  }

  async function confirmSend() {
    setSending(true);
    setSendResult(null);
    try {
      const { ok, out, error: why } = await callAnnounce(false);
      if (!ok || !out) {
        setSendResult(why ?? 'تعذّر الإرسال');
        return;
      }
      setSendResult(
        `✅ وصل ${out.ok}` +
          (out.failed ? ` · فشل ${out.failed}` : '') +
          (out.pruned ? ` · حُذف ${out.pruned} جهاز لم يعد موجوداً` : '')
      );
      setConfirming(false);
      setText('');
    } finally {
      setSending(false);
    }
  }

  if (!rows) {
    return (
      <div className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  const allOk = report?.checks.every((c) => c.ok) ?? false;

  return (
    <div className="space-y-4">
      <section className={`card p-5 ${report && !allOk ? 'border-traffic-red' : ''}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">حالة النظام</h2>
          <button type="button" onClick={load} className="text-[11px] font-bold text-brand-700">
            إعادة الفحص
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          كل سطر نتيجة سؤال حقيقي للطرف الآخر، لا قراءة إعداد محفوظ
        </p>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 p-3">
            <p className="text-xs leading-relaxed text-traffic-red">{error}</p>
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="mt-2 text-[11px] font-bold text-traffic-red underline disabled:opacity-50"
            >
              {busy ? 'جارٍ المحاولة…' : 'أعد المحاولة'}
            </button>
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {(report?.checks ?? []).map((c) => (
            <li
              key={c.key}
              className={`flex items-start gap-2.5 rounded-xl p-3 ${
                c.ok ? 'bg-brand-50' : 'bg-red-50'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${c.ok ? 'text-brand' : 'text-traffic-red'}`}>
                {c.ok ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-xs font-bold ${c.ok ? 'text-brand-700' : 'text-traffic-red'}`}>
                  {c.label}
                </span>
                <span className="block text-[11px] leading-relaxed text-slate-500">{c.detail}</span>
              </span>
            </li>
          ))}
          {!report && !error && (
            <li className="flex justify-center py-4">
              <SpinnerIcon className="h-5 w-5 text-brand" />
            </li>
          )}
        </ul>

        {report && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini label="محطة معتمدة" value={report.counts.stations} />
            <Mini label="مشترك بالتنبيهات" value={report.counts.subscribers} />
            <Mini label="جهاز مسجّل" value={report.counts.devices} />
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">إشعار تجريبي</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          يُرسل إلى هذا الجهاز وحده، عبر نفس المسار الذي يسلكه الإشعار الحقيقي —
          اختبارٌ بمسارٍ آخر لا يثبت شيئاً عن المسار الحقيقي.
        </p>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing}
          className="btn-primary mt-3 w-full disabled:opacity-60"
        >
          {testing ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'أرسل إشعاراً إلى هاتفي'}
        </button>
        {testResult && (
          <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {testResult}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">إعلان لكل المستخدمين</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          يصل كل جهاز مسجّل. الإشعار لا يُسترجَع بعد إرساله، لذا يُعرض عدد الهواتف قبل
          الإرسال لا بعده.
        </p>

        <label htmlFor="an-title" className="label mt-3">العنوان</label>
        <input
          id="an-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setConfirming(false);
          }}
          maxLength={64}
          className="field"
          placeholder="⛽ المحطة التقنية"
        />

        <label htmlFor="an-body" className="label mt-3">النص</label>
        <textarea
          id="an-body"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConfirming(false);
          }}
          maxLength={178}
          rows={3}
          className="field py-2"
          placeholder="هذا صوت المنصة — ستسمعه عند توفر الوقود."
        />
        <p className="mt-1 text-[11px] text-slate-400">{text.length} / 178 حرفاً</p>

        {!confirming ? (
          <button
            type="button"
            onClick={preview}
            disabled={!title.trim() || !text.trim()}
            className="btn-ghost mt-3 w-full disabled:opacity-40"
          >
            كم جهازاً سيصله؟
          </button>
        ) : (
          <>
            <div className="mt-3 rounded-xl bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">
                سيصل {(reach?.ios ?? 0) + (reach?.android ?? 0) + (reach?.web ?? 0)} جهازاً —
                {' '}{reach?.ios ?? 0} آيفون · {reach?.android ?? 0} أندرويد · {reach?.web ?? 0} متصفح
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                راجع النص مرة أخيرة. لا يمكن سحبه بعد الإرسال.
              </p>
            </div>
            <button
              type="button"
              onClick={confirmSend}
              disabled={sending}
              className="btn-primary mt-2 w-full disabled:opacity-60"
            >
              {sending ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'أرسل الآن'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="mt-1 min-h-[44px] w-full text-center text-xs font-semibold text-slate-400"
            >
              تراجع
            </button>
          </>
        )}

        {sendResult && (
          <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {sendResult}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">المحطات — آخر تحديث</h2>
        <p className="mt-1 text-xs text-slate-400">
          الأخضر حدّث خلال يوم · الأصفر مفتوح ولم يحدّث · الأحمر صامت
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">لا توجد محطات معتمدة بعد</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((s) => {
              const products = s.station_products ?? [];
              const newest = products
                .map((p) => p.updated_at)
                .filter(Boolean)
                .sort()
                .at(-1) as string | undefined;
              const fresh = products.some((p) => isFresh(p.updated_at));
              const open = isOpenNow(s);
              const tone = fresh ? 'brand' : open ? 'amber' : 'red';
              const available = products.filter((p) => p.is_available && isFresh(p.updated_at));

              return (
                <li
                  key={s.id}
                  className={`rounded-xl border-e-4 p-3 ${
                    tone === 'brand'
                      ? 'border-e-brand bg-brand-50'
                      : tone === 'amber'
                        ? 'border-e-amber-400 bg-amber-50'
                        : 'border-e-traffic-red bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`/admin/station/?id=${s.id}`}
                      className="text-xs font-bold text-slate-800 underline"
                    >
                      {s.name}
                    </a>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                      {newest ? ageLabel(newest) : 'لم يُحدَّث قط'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {s.city} · {open ? 'مفتوحة الآن' : s.temp_closed ? 'مغلقة مؤقتاً' : 'خارج الدوام'}
                    {' · '}
                    <span className="ltr">{s.phone}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">
                    {available.length
                      ? available.map((p) => PRODUCT_LABELS[p.product as keyof typeof PRODUCT_LABELS]).join('، ')
                      : 'لا يوجد منتج معلن الآن'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2.5 text-center">
      <p className="text-lg font-extrabold leading-none text-slate-700">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}
