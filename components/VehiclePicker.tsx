'use client';

import { VEHICLE_LABELS, VEHICLE_TYPES, type VehicleType } from '@/lib/wash';
import { PickupIcon, SedanIcon, SuvIcon, VanIcon, VehicleIcon } from './icons';

/** أيقونةُ كلّ نوعٍ — الأسماءُ تختلف بين الناس (صالون/سيدان، بيك أب/حمل)، فالصورةُ أوضح. */
export const VEHICLE_ICON: Record<VehicleType, (p: { className?: string }) => React.ReactElement> = {
  sedan: SedanIcon,
  suv: SuvIcon,
  pickup: PickupIcon,
  van: VanIcon,
  other: VehicleIcon,
};

/** مُنتقي نوع السيارة أيقوناتٍ لا أسماء (طلبُ صاحب المنصّة). قابلٌ للإلغاء بضغطةٍ ثانية.
 *  الاسمُ يبقى تحت الأيقونة صغيراً كتلميحٍ لا كعنوانٍ رئيسيّ. */
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
    <div className="flex flex-wrap gap-2">
      {types.map((v) => {
        const Icon = VEHICLE_ICON[v];
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            aria-label={VEHICLE_LABELS[v]}
            onClick={() => onChange(on ? '' : v)}
            className={`flex min-h-[60px] w-[68px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-bold transition-colors ${
              on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Icon className="h-6 w-6" />
            {VEHICLE_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}
