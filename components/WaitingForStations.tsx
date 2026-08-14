'use client';

import { useEffect, useState } from 'react';
import { ALERTS_CHANGED, readChoice, type AlertChoice } from '@/lib/alerts';
import { PRODUCT_LABELS } from '@/lib/products';
import { AlertSetup } from './AlertSetup';
import { BellIcon } from './icons';

/** What the empty list should say depends on whether the driver has already
 *  done the one thing it can ask of him.
 *
 *  Before he subscribes it is a call to action. After — showing the same form
 *  again reads as "that didn't work", which is the opposite of true: he is
 *  finished, and the waiting is now ours. */
export function WaitingForStations() {
  const [choice, setChoice] = useState<AlertChoice | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const sync = () => setChoice(readChoice());
    sync();
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  if (choice && !editing) {
    const where = choice.cities.length ? choice.cities.join('، ') : 'كل مدن الأنبار';
    const what = choice.products.length
      ? choice.products.map((p) => PRODUCT_LABELS[p]).join('، ')
      : 'كل المنتجات';

    return (
      <>
        <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <BellIcon className="h-6 w-6 text-brand" />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-700">تنبيهاتك مفعّلة — انتظر الإشعار</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          لا توجد محطات مسجّلة بعد. أول ما تسجّل محطة في{' '}
          <span className="font-bold text-brand-700">{where}</span> ويتوفر فيها{' '}
          <span className="font-bold text-brand-700">{what}</span>، يصلك إشعار على هاتفك.
          لا داعي لفتح التطبيق كل يوم.
        </p>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-ghost mt-5 w-full"
        >
          تعديل اختياري
        </button>
        <a href="/register" className="mt-2 block min-h-[44px] pt-3 text-xs font-semibold text-slate-400">
          صاحب محطة؟ سجّلها مجاناً
        </a>
      </>
    );
  }

  return (
    <>
      <p className="mt-3 text-sm font-bold text-slate-700">لا توجد محطات مسجّلة بعد</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        المنصة تعمل الآن ونستقبل تسجيل المحطات في جميع مدن الأنبار. لا تنتظر — اختر مدينتك
        ووقودك، ونحن ننبّهك أول ما تصل محطة.
      </p>
      <div className="mt-5 border-t border-slate-100 pt-5 text-right">
        <AlertSetup compact onSaved={() => setEditing(false)} />
      </div>
      <a href="/register" className="btn-ghost mt-5 w-full">
        صاحب محطة؟ سجّلها مجاناً
      </a>
    </>
  );
}
