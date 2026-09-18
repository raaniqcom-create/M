'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useWashConfig } from '@/lib/washConfig';
import {
  SIZE_NOTE,
  VEHICLE_HINT,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  carsLabel,
  iqd,
  readSize,
  rememberSize,
  servicePrice,
  totalCars,
  type VehicleCounts,
  type VehicleType,
  type WashService,
} from '@/lib/wash';
import { VehicleImage } from './VehicleArtwork';
import { CheckIcon, SpinnerIcon } from './icons';

/** ما يلزم لحساب «يبدأ من» — الاسمُ لا يُعرض هنا. */
type PriceRow = Pick<WashService, 'id' | 'name' | 'price' | 'prices' | 'active'>;
const COLS = 'id,name,price,prices,active';

/** لسانٌ أخضرُ يطلّ تحت البطاقة — لغةُ بطاقات «غسيل». */
const LIP = 'rounded-[26px] bg-brand-600/90 pb-[5px] shadow-lift';
// h-11 لا h-10: نفسُ مقاس عدّاد VehiclePicker — الزرُّ ذاتُه في شاشتين لا يتغيّر حجمُه، و44px حدُّ اللمس.
const STEP = 'grid h-11 w-11 place-items-center rounded-full text-[20px] font-extrabold leading-none transition-colors disabled:opacity-30';

/** ‎/wash/size/?id=… — «أيُّ حجمٍ سيّارتُك؟» قبل الحجز.
 *
 *  سؤالٌ واحدٌ يُسأل مرّةً: الجوابُ يُحفظ على الجهاز (rememberSize) فتُملأ خطوةُ
 *  الحجز تلقائياً بعدها. وبـ`?id=` تُعرض أسعارُ تلك المغسلة، وبلا مُعرِّفٍ تُعرض
 *  أرخصُ أسعار المنصّة كلِّها كي يرى الزائرُ رقماً قبل أن يختار مغسلة. */
export function WashSizeScreen() {
  const id = useSearchParams().get('id') ?? '';
  const cfg = useWashConfig();

  const [name, setName] = useState('');
  /** null = ما زالت تُجلب. */
  const [services, setServices] = useState<PriceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState<VehicleCounts>({});

  // الحجمُ المحفوظ من زيارةٍ سابقة — يُقرأ في المتصفّح لا في البناء الساكن.
  useEffect(() => setCounts(readSize()), []);

  useEffect(() => {
    let alive = true;
    // تصفيرٌ قبل الجلب: لو تغيّر `id` بلا إعادة تركيب، بقيت شاشةُ الفشل أو اسمُ المغسلة السابقة معروضَين.
    setFailed(false);
    setServices(null);
    setName('');
    const rows = id
      ? supabase.from('wash_services').select(COLS).eq('wash_id', id).eq('active', true).order('sort').limit(50)
      : supabase.from('wash_services').select(COLS).eq('active', true).range(0, 999);
    void Promise.all([rows, id ? supabase.from('washes_public').select('name').eq('id', id).maybeSingle() : null]).then(([s, w]) => {
      if (!alive) return;
      if (s.error) {
        setFailed(true);
        return;
      }
      setServices((s.data ?? []) as PriceRow[]);
      // فشلُ اسم المغسلة لا يُسقط الشاشة: الأحجامُ تُختار من دونه.
      if (w?.data) setName((w.data as { name: string }).name);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const total = totalCars(counts);
  const max = cfg?.max_cars_order ?? 5;
  const set = (v: VehicleType, n: number) => {
    const next = { ...counts };
    if (n > 0) next[v] = n;
    else delete next[v];
    setCounts(next);
  };

  function go() {
    rememberSize(counts);
    // size=1 يخبر صفحةَ الحجز أنّ الخطوةَ تمّت — والعددُ يُقرأ من readSize().
    window.location.href = id ? `/wash/book/?id=${encodeURIComponent(id)}&size=1` : '/wash/';
  }

  if (failed)
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500" role="alert">
        تعذّر التحميل — تحقّق من الاتصال وأعد المحاولة.
      </main>
    );
  if (services === null)
    return (
      <main className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );

  /** «يبدأ من»: أرخصُ خدمةٍ بسعر هذا الحجم — لا شيءَ إن لم تُضَف خدماتٌ بعد.
   *  الصفرُ سعرٌ مسموحٌ في القاعدة (افتراضُ العمود)، فيُعدّ «بلا سعر» لا «أرخص»: بلا هذا
   *  المرشِّح تُفسد خدمةٌ واحدةٌ نصفُ مُدخَلةٍ في أيّ مغسلة أسعارَ الأحجام الثلاثة كلِّها. */
  const from = (v: VehicleType): number | null => {
    const p = services.map((s) => servicePrice(s, v)).filter((n) => n > 0);
    return p.length ? Math.min(...p) : null;
  };

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-4">
      <h1 className="text-[22px] font-extrabold text-slate-900">غسيل السيارات</h1>
      <p className="mt-1 text-[13px] text-slate-500">يرجى اختيار حجم السيارة لتحديد السعر والخدمة المناسبة</p>
      {name && <p className="mt-1 text-[12px] font-bold text-brand-700">في مغسلة {name}</p>}

      <div className="mt-4 space-y-2.5">
        {VEHICLE_TYPES.map((v) => {
          const n = counts[v] ?? 0;
          const label = VEHICLE_LABELS[v];
          const price = v === 'other' ? null : from(v);
          return (
            <div key={v} className={LIP}>
              <div className={`flex items-center gap-3 rounded-[26px] border p-3 transition-colors ${n > 0 ? 'border-brand bg-brand-50 ring-1 ring-brand' : 'border-slate-200 bg-white'}`}>
                <span className={n > 0 ? 'text-brand' : 'text-slate-400'}>
                  <VehicleImage v={v} className="h-[70px] w-[100px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className={`min-w-0 text-[14px] font-extrabold ${n > 0 ? 'text-brand-800' : 'text-slate-800'}`}>{label}</h2>
                    {n > 0 && (
                      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-brand text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-slate-500">{VEHICLE_HINT[v]}</p>
                  {v === 'other' ? (
                    <p className="mt-0.5 text-[11px] font-bold text-slate-500">يُحدَّد عند الوصول</p>
                  ) : (
                    price != null && <p className="mt-0.5 text-[11px] font-bold text-brand-700">يبدأ من {iqd(price)}</p>
                  )}
                </div>

                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`إنقاص ${label}`}
                    disabled={n === 0}
                    onClick={() => set(v, n - 1)}
                    className={`${STEP} bg-slate-100 text-slate-700 active:bg-slate-200`}
                  >
                    <span aria-hidden>−</span>
                  </button>
                  <span aria-live="polite" className="min-w-[24px] text-center text-[16px] font-extrabold text-slate-900">
                    {n}
                  </span>
                  <button
                    type="button"
                    aria-label={`زيادة ${label}`}
                    disabled={total >= max}
                    onClick={() => set(v, n + 1)}
                    className={`${STEP} bg-brand text-white active:bg-brand-600`}
                  >
                    <span aria-hidden>+</span>
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {total >= max && <p className="mt-2 text-[11px] font-bold text-amber-800">الحدّ الأقصى {carsLabel(max)} في الطلب الواحد.</p>}
      <p className="mt-3 text-[11.5px] leading-5 text-slate-500">{SIZE_NOTE}</p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-md px-4 py-3">
          <button type="button" onClick={go} disabled={total < 1} aria-disabled={total < 1} className="btn-primary w-full disabled:opacity-40">
            متابعة
          </button>
        </div>
      </div>
    </main>
  );
}
