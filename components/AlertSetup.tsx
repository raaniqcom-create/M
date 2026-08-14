'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_LABELS } from '@/lib/products';
import { AlertChips } from './AlertChips';
import {
  ALERTS_CHANGED,
  clearChoice,
  readChoice,
  saveChoice,
  type AlertChoice,
} from '@/lib/alerts';
import { BellIcon, SpinnerIcon } from '@/components/icons';
import { detectPlatform, storeUrl } from '@/lib/stores';
import type { FuelProduct } from '@/types/database';

/** The promise the platform can keep on day one, before a single station has
 *  registered: pick your city and your fuel, and the phone rings the moment
 *  one appears. Nothing here needs an account. */
export function AlertSetup({
  compact = false,
  onSaved,
}: {
  compact?: boolean;
  /** Lets the first-run screen step aside the moment the choice lands. */
  onSaved?: () => void;
}) {
  const [cities, setCities] = useState<string[]>([]);
  const [products, setProducts] = useState<FuelProduct[]>([]);
  const [saved, setSaved] = useState<AlertChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [store, setStore] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const c = readChoice();
      if (!c) return setSaved(null);
      setSaved(c);
      setCities(c.cities);
      setProducts(c.products);
    };
    sync();
    setStore(storeUrl(detectPlatform()));
    // the onboarding screen and the empty-state picker are mounted together
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveChoice({ cities, products });
      if (result === 'ok') {
        setSaved({ cities, products });
        onSaved?.();
        return;
      }
      // A failed save leaves nothing subscribed, so the green panel must go
      // with it — the two used to render stacked, contradicting each other.
      setSaved(null);
      setUnsupported(result === 'unsupported');
      setError(
        result === 'denied'
          ? 'الإشعارات ممنوعة لهذا التطبيق. فعّلها من إعدادات هاتفك ثم أعد المحاولة.'
          : result === 'unsupported'
            ? 'هذا المتصفح لا يدعم الإشعارات — حمّل التطبيق لتصلك التنبيهات.'
            : result === 'pending'
              ? 'التسجيل لم يكتمل بعد. انتظر لحظة وأعد المحاولة.'
              : 'تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.'
      );
    } catch {
      setSaved(null);
      setError('تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      if (!(await clearChoice())) {
        setError('تعذّر الإيقاف. تأكد من الاتصال وأعد المحاولة.');
        return;
      }
      setSaved(null);
      setCities([]);
      setProducts([]);
      setError(null);
    } finally {
      setBusy(false);
    }
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

      <AlertChips
        cities={cities}
        products={products}
        onCities={setCities}
        onProducts={setProducts}
      />

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3">
          <p className="text-xs leading-relaxed text-red-700">{error}</p>
          {/* Safari on iPhone has no Web Push outside an installed app, so the
              only honest next step is the store — not a retry that cannot
              succeed however many times it is tapped. */}
          {unsupported && store && (
            <a
              href={store}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-3 w-full"
            >
              حمّل التطبيق
            </a>
          )}
        </div>
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
