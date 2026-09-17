'use client';

import {
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  carsLabel,
  totalCars,
  vehicleArt,
  vehicleImg,
  type VehicleCounts,
  type VehicleType,
} from '@/lib/wash';
import { PickupIcon, SedanIcon, SuvIcon, VanIcon, VehicleIcon } from './icons';

/** أيقونةُ كلّ نوعٍ — تبقى خلف الصورة: إن غابت الصورةُ والرسمُ معاً لا ينهار الصفّ. */
export const VEHICLE_ICON: Record<VehicleType, (p: { className?: string }) => React.ReactElement> = {
  sedan: SedanIcon,
  suv: SuvIcon,
  pickup: PickupIcon,
  van: VanIcon,
  other: VehicleIcon,
};

/** صورةُ النوع: الصورةُ الحقيقيّةُ (png) ثمّ الرسمُ (svg) ثمّ الأيقونةُ الخلفيّة.
 *  الصندوقُ بارتفاعٍ ثابتٍ كي لا تُقصّر صورةٌ مكسورةٌ البطاقةَ. */
export function VehicleArt({ v, className = 'h-[104px] w-[124px]' }: { v: VehicleType; className?: string }) {
  const Icon = VEHICLE_ICON[v];
  return (
    <span className={`relative grid shrink-0 place-items-center ${className}`}>
      <Icon className="h-2/5 w-2/5 text-brand-600/35" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={vehicleImg(v)}
        alt={VEHICLE_LABELS[v]}
        loading="lazy"
        onError={(e) => {
          // سقطةٌ واحدةٌ إلى svg ثمّ إخفاء — بلا حارسٍ تُعيد ضبطُ src نداءَ onError بلا نهاية.
          const el = e.currentTarget;
          if (el.dataset.fb) el.style.display = 'none';
          else {
            el.dataset.fb = '1';
            el.src = vehicleArt(v);
          }
        }}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </span>
  );
}

/** لسانٌ أخضرُ يطلّ تحت البطاقة — لغةُ البطاقات المرفوعة في قسم «غسيل». */
const LIP = 'rounded-[26px] bg-brand-600/90 pb-[5px]';
const CARD = 'flex items-center gap-3 rounded-[26px] border p-3 text-start transition-colors';
const cardTone = (on: boolean) => (on ? 'border-brand bg-brand-50 ring-1 ring-brand' : 'border-slate-200 bg-white');

/** مُنتقي نوع السيارة صوراً لا أسماء (طلبُ صاحب المنصّة): الأسماءُ تختلف بين الناس
 *  (صالون/سيدان، بيك أب/حمل) والصورةُ تحسم. قابلٌ للإلغاء بضغطةٍ ثانية. */
export function VehiclePicker({
  value,
  onChange,
  types = VEHICLE_TYPES,
}: {
  value: VehicleType | '';
  onChange: (v: VehicleType | '') => void;
  types?: readonly VehicleType[];
}) {
  return (
    <div className="space-y-2.5">
      {types.map((v) => {
        const on = value === v;
        return (
          <div key={v} className={LIP}>
            <button type="button" aria-pressed={on} onClick={() => onChange(on ? '' : v)} className={`w-full ${CARD} ${cardTone(on)}`}>
              <VehicleArt v={v} />
              <span className={`text-[15px] font-extrabold ${on ? 'text-brand-800' : 'text-slate-800'}`}>{VEHICLE_LABELS[v]}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

const STEP = 'grid h-11 w-11 place-items-center rounded-full text-[20px] font-extrabold leading-none transition-colors disabled:opacity-30';

/** «لسيّارتين» لا «لـسيّارتان»: carsLabel صيغةُ رفعٍ للملخّص، وبعد اللام تُجَرّ — واللامُ تتّصل
 *  بالكلمة العربيّة ولا تُطوَّل إلّا قبل الرقم اللاتينيّ («لـ3 سيارات»).
 *  مكانُها الطبيعيُّ lib/wash.ts لكنّه خارج ملكيّة هذا العمل. */
export const carsTo = (n: number): string => (n === 1 ? 'لسيّارة واحدة' : n === 2 ? 'لسيّارتين' : `لـ${carsLabel(n)}`);

/** العدّاد: طلبٌ واحدٌ لعدّة سيارات — «− 0 +» على بطاقة كلّ نوع.
 *  `max` سقفُ الطلب (wash_config)، و`remaining` سعةُ الموعد المختار إن عُرفت. */
export function VehicleCounter({
  counts,
  onChange,
  max,
  remaining,
  types = VEHICLE_TYPES,
}: {
  counts: VehicleCounts;
  onChange: (next: VehicleCounts) => void;
  max: number;
  remaining?: number;
  types?: readonly VehicleType[];
}) {
  const total = totalCars(counts);
  // السقفُ الفعليّ: الأقلُّ بين حدّ الطلب وسعةِ الموعد — وواحدةٌ على الأقلّ كي لا يُقفل العدّاد.
  const cap = Math.max(1, Math.min(max, remaining ?? max));
  const set = (v: VehicleType, n: number) => {
    const next = { ...counts };
    if (n > 0) next[v] = n;
    else delete next[v];
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      {types.map((v) => {
        const n = counts[v] ?? 0;
        const label = VEHICLE_LABELS[v];
        return (
          <div key={v} className={LIP}>
            {/* الصورةُ أضيقُ هنا منها في الاختيار المفرد، والاسمُ يتقلّص (min-w-0): الصفُّ الثلاثيُّ
                مع حبّة العدّاد يتجاوز عرضَ البطاقة على شاشة 390px وإلّا خرج «+» عن حافّتها. */}
            <div className={`${CARD} ${cardTone(n > 0)}`}>
              <VehicleArt v={v} className="h-[88px] w-[88px]" />
              <span className={`min-w-0 flex-1 text-[14px] font-extrabold ${n > 0 ? 'text-brand-800' : 'text-slate-800'}`}>{label}</span>
              <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  aria-label={`إنقاص ${label}`}
                  disabled={n === 0}
                  onClick={() => set(v, n - 1)}
                  className={`${STEP} bg-slate-100 text-slate-700 active:bg-slate-200`}
                >
                  <span aria-hidden>−</span>
                </button>
                <span aria-live="polite" className="min-w-[26px] text-center text-[16px] font-extrabold text-slate-900">
                  {n}
                </span>
                <button
                  type="button"
                  aria-label={`زيادة ${label}`}
                  disabled={total >= cap}
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
      {total >= cap && (
        <p className="text-[11px] font-bold text-amber-800">
          {remaining != null && remaining < max
            ? `هذا الموعد يتّسع ${carsTo(remaining)} فقط — اختر موعداً آخر للمزيد.`
            : `الحدّ الأقصى ${carsLabel(max)} في الطلب الواحد.`}
        </p>
      )}
    </div>
  );
}
