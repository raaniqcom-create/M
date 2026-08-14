'use client';

import { useEffect, useState } from 'react';
import { CITY_NAMES } from '@/lib/cities';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { readChoice, saveChoice, clearChoice, type AlertChoice } from '@/lib/alerts';
import { BellIcon, SpinnerIcon } from '@/components/icons';
import type { FuelProduct } from '@/types/database';

/** The promise the platform can keep on day one, before a single station has
 *  registered: pick your city and your fuel, and the phone rings the moment
 *  one appears. Nothing here needs an account. */
export function AlertSetup({ compact = false }: { compact?: boolean }) {
  const [cities, setCities] = useState<string[]>([]);
  const [products, setProducts] = useState<FuelProduct[]>([]);
  const [saved, setSaved] = useState<AlertChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = readChoice();
    if (c) {
      setSaved(c);
      setCities(c.cities);
      setProducts(c.products);
    }
  }, []);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function save() {
    setBusy(true);
    setError(null);
    const result = await saveChoice({ cities, products });
    setBusy(false);
    if (result === 'ok') {
      setSaved({ cities, products });
      return;
    }
    setError(
      result === 'no-permission'
        ? 'لم يُسمح بالإشعارات. فعّلها من إعدادات المتصفح أو الهاتف ثم أعد المحاولة.'
        : 'تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.'
    );
  }

  async function stop() {
    setBusy(true);
    await clearChoice();
    setBusy(false);
    setSaved(null);
    setCities([]);
    setProducts([]);
  }

  const cityLabel = cities.length ? cities.join('، ') : 'كل مدن الأنبار';
  const productLabel = products.length
    ? products.map((p) => PRODUCT_LABELS[p]).join('، ')
    : 'كل المنتجات';

  return (
    <section className={compact ? '' : 'card p-5'}>
      <div className="flex items-center gap-2">
        <BellIcon className="h-5 w-5 text-brand" />
        <h2 className="text-base font-bold">نبّهني عند توفر الوقود</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        اختر مدينتك ونوع الوقود الذي يهمك. أول ما تسجّل محطة ويتوفر المنتج، يصلك
        إشعار فوراً — بلا حساب وبلا رقم هاتف.
      </p>

      <p className="mt-4 text-xs font-bold text-slate-700">
        المدينة <span className="font-normal text-slate-400">(اتركها فارغة = كل المدن)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {CITY_NAMES.map((c) => {
          const on = cities.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCities(toggle(cities, c))}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                on
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs font-bold text-slate-700">
        نوع الوقود <span className="font-normal text-slate-400">(اتركه فارغاً = الكل)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRODUCT_ORDER.map((p) => {
          const on = products.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => setProducts(toggle(products, p))}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                on
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {PRODUCT_LABELS[p]}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="btn-primary mt-5 w-full disabled:opacity-60"
      >
        {busy ? (
          <SpinnerIcon className="mx-auto h-5 w-5" />
        ) : saved ? (
          'تحديث التنبيهات'
        ) : (
          'فعّل التنبيهات'
        )}
      </button>

      {saved && (
        <>
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed font-semibold text-brand-700">
            ✅ التنبيهات مفعّلة — {productLabel} في {cityLabel}.
          </p>
          <button
            type="button"
            onClick={stop}
            disabled={busy}
            className="mt-2 w-full text-center text-xs font-semibold text-slate-400"
          >
            إيقاف التنبيهات
          </button>
        </>
      )}
    </section>
  );
}
