'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ANBAR_CITIES } from '@/lib/cities';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { ANNOUNCE_TEMPLATES, tooLong, type TemplateInput } from '@/lib/announceTemplates';
import { SpinnerIcon } from './icons';
import type { FuelProduct } from '@/types/database';

const CITY_NAMES = ANBAR_CITIES.map((c) => c.name);

/** Announcing fuel at a station that has not joined the platform yet.
 *
 *  A stop-gap by design: once a station registers, its own owner does this from
 *  their panel and the announcement carries their name and links to their page.
 *  Until then the choice is between telling people nothing and telling them
 *  what the directorate told us — and the people who installed the app this
 *  week are owed the second.
 *
 *  Nothing here sends directly. It writes a row, and the sweep that already
 *  runs every two minutes delivers it: one code path for a scheduled send and
 *  an immediate one, so "now" cannot behave differently from "at ten". */
export function StationAnnouncePanel() {
  const [templateId, setTemplateId] = useState(ANNOUNCE_TEMPLATES[0].id);
  const [station, setStation] = useState('');
  const [product, setProduct] = useState<FuelProduct>('gasoline_premium');
  const [city, setCity] = useState<string>(CITY_NAMES[0]);
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [hours, setHours] = useState(3);

  const [reach, setReach] = useState<{ ios: number; android: number; web: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const template = ANNOUNCE_TEMPLATES.find((t) => t.id === templateId)!;
  const input: TemplateInput = { station: station.trim() || '…', city, product };

  // Everyone who will be notified: the station's own city, plus any neighbour
  // the admin adds — someone in Amiriyat may well drive to Falluja for fuel.
  const audience = useMemo(
    () => [...new Set([city, ...extraCities])],
    [city, extraCities]
  );

  const title = template.title(input);
  const line = template.line(input);
  const ticker = audience.map(() => template.ticker(input));
  const lengthError = station.trim() ? tooLong(template, input) : null;

  function toggleExtra(c: string) {
    setExtraCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  /** Counts before it sends. A notification cannot be recalled, so the number of
   *  phones about to buzz is shown while the decision is still reversible. */
  async function countReach() {
    setErr(null);
    setReach(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('announce_reach', {
        p_cities: audience,
        p_product: product,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as { ios?: number; android?: number; web?: number };
      setReach({ ios: r.ios ?? 0, android: r.android ?? 0, web: r.web ?? 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذّر حساب العدد');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setErr(null);
    setNote(null);

    if (!station.trim()) return setErr('اكتب اسم المحطة.');
    if (lengthError) return setErr(lengthError);
    if (when === 'later' && !at) return setErr('اختر وقت الظهور.');

    // A local datetime-local value is wall-clock in the admin's own timezone;
    // new Date() reads it that way, and toISOString converts it correctly.
    const sendAt = when === 'now' ? new Date() : new Date(at);
    if (when === 'later' && Number.isNaN(sendAt.getTime())) return setErr('وقت غير صالح.');
    if (when === 'later' && sendAt.getTime() < Date.now() - 60_000) {
      return setErr('الوقت المختار في الماضي.');
    }

    setBusy(true);
    const { error } = await supabase.from('announcements').insert({
      title,
      // one line per city, so the sweep can hand each city its own sentence
      body: audience.map((c) => `• ${c}: ${template.line({ ...input, city: c })}`).join('\n'),
      note: 'هذه المحطة لم تسجّل في التطبيق بعد. ننشر الخبر لأن وصول المعلومة إليكم أهمّ من انتظارها. وإن كنت صاحب محطة أو تعرف صاحبها فالتسجيل مجاني، ويجعل خبر محطتك يصل أهل مدينتك بنفسه لحظة تعلنه.',
      source: 'إدارة المحطة التقنية',
      product,
      cities: audience,
      ticker: audience.map((c) => template.ticker({ ...input, city: c })),
      send_at: sendAt.toISOString(),
      expires_at: new Date(sendAt.getTime() + hours * 3600_000).toISOString(),
      active: true,
    });
    setBusy(false);

    if (error) return setErr(`تعذّر الحفظ: ${error.message}`);
    setNote(
      when === 'now'
        ? 'حُفظ. يُرسل خلال دقيقتين ويظهر في الشريط عند إرساله.'
        : `حُفظ. يُرسل ${sendAt.toLocaleString('ar-IQ')} ويظهر في الشريط عندها.`
    );
    setStation('');
    setReach(null);
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-bold">إشعارات المحطات</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          لإعلان توفّر الوقود في محطة لم تسجّل بعد. مؤقّت — حين تسجّل المحطة يصبح صاحبها
          هو من يعلن، ويحمل الإشعار اسمه ورابط صفحته.
        </p>

        <label className="label mt-4 block">النموذج</label>
        <div className="grid grid-cols-1 gap-2">
          {ANNOUNCE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              aria-pressed={t.id === templateId}
              className={`rounded-xl border p-3 text-start transition-colors duration-200 ${
                t.id === templateId
                  ? 'border-brand bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`block text-sm font-bold ${t.id === templateId ? 'text-brand-700' : 'text-slate-700'}`}>
                {t.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>

        <label htmlFor="an-station" className="label mt-4 block">
          اسم المحطة <span className="text-traffic-red">*</span>
        </label>
        <input
          id="an-station"
          value={station}
          onChange={(e) => setStation(e.target.value)}
          placeholder="الرمادي القديمة (السينما)"
          className="field"
        />

        <label htmlFor="an-product" className="label mt-4 block">نوع المنتج</label>
        <select
          id="an-product"
          value={product}
          onChange={(e) => setProduct(e.target.value as FuelProduct)}
          className="field"
        >
          {PRODUCT_ORDER.map((p) => (
            <option key={p} value={p}>{PRODUCT_LABELS[p]}</option>
          ))}
        </select>

        <label htmlFor="an-city" className="label mt-4 block">مدينة المحطة</label>
        <select
          id="an-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="field"
        >
          {CITY_NAMES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <p className="label mt-4">مدن إضافية يصلها الإشعار (اختياري)</p>
        <div className="flex flex-wrap gap-1.5">
          {CITY_NAMES.filter((c) => c !== city).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleExtra(c)}
              aria-pressed={extraCities.includes(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                extraCities.includes(c)
                  ? 'border-brand bg-brand-100 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-sm font-bold">وقت الظهور</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([['now', 'الآن'], ['later', 'بوقت محدّد']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setWhen(v)}
              aria-pressed={when === v}
              className={`min-h-[44px] rounded-xl border text-sm font-bold ${
                when === v ? 'border-brand bg-brand-100 text-brand' : 'border-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {when === 'later' && (
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="field mt-3"
            aria-label="وقت الظهور"
          />
        )}

        <label htmlFor="an-hours" className="label mt-4 block">
          يبقى في الشريط (ساعات)
        </label>
        <input
          id="an-hours"
          type="number"
          min={1}
          max={24}
          value={hours}
          onChange={(e) => setHours(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
          className="field"
          dir="ltr"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          بعدها يختفي وحده. خبر الوقود يفسد بسرعة — وبقاؤه بعد نفاد الكمية أسوأ من
          عدم نشره.
        </p>
      </section>

      {/* What the phone will actually show, built by the same functions that
          build the real thing — not a description of it. */}
      <section className="card p-5">
        <h3 className="text-sm font-bold">المعاينة</h3>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-extrabold text-slate-800">{title}</p>
          <p className="mt-1 text-xs text-slate-600">{line}</p>
          <p className="mt-2 text-[11px] text-slate-400" dir="ltr">
            {title.length}/64 · {line.length}/178
          </p>
        </div>

        <p className="mt-3 text-[11px] font-bold text-slate-500">في الشريط السفلي:</p>
        <p className="mt-1 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-semibold text-white">
          {ticker[0]}
        </p>

        {lengthError && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-traffic-red">
            {lengthError}
          </p>
        )}

        <button
          type="button"
          onClick={countReach}
          disabled={busy}
          className="btn-ghost mt-4 w-full disabled:opacity-60"
        >
          {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'كم شخصاً سيصله؟'}
        </button>

        {reach && (
          <p className="mt-2 rounded-xl bg-brand-50 p-3 text-xs font-semibold leading-relaxed text-brand-900">
            سيصل <strong dir="ltr">{reach.ios + reach.android + reach.web}</strong> شخصاً —{' '}
            <span dir="ltr">{reach.ios}</span> آيفون · <span dir="ltr">{reach.android}</span> أندرويد ·{' '}
            <span dir="ltr">{reach.web}</span> متصفح، في {audience.join(' و ')}.
          </p>
        )}
      </section>

      <section className="card p-5">
        <button
          type="button"
          onClick={publish}
          disabled={busy || !station.trim() || !!lengthError}
          className="btn-primary w-full disabled:opacity-50"
        >
          {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : when === 'now' ? 'انشر الآن' : 'جدول النشر'}
        </button>

        {err && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-traffic-red">{err}</p>
        )}
        {note && (
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs font-semibold leading-relaxed text-brand-700">
            {note}
          </p>
        )}
      </section>
    </div>
  );
}
