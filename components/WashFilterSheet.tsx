'use client';

import { useEffect, useState } from 'react';
import { iqd } from '@/lib/wash';
import { Sheet } from './Sheet';

/** مرشّحاتُ دليل المغاسل — كلُّها في الورقة، واثنان منها («مفتوحة الآن» و«يوجد عرض») لهما رقاقةٌ في الصفّ أيضاً. */
export interface WashFilters {
  city: string;
  area: string;
  /** أقصى «يبدأ من» — 0 = أيّ سعر. */
  maxPrice: number;
  /** رقاقاتُ نوع الغسيل المختارة (بالاسم من WASH_KINDS). */
  kinds: string[];
  /** 0 / 4 / 4.5 */
  minRating: number;
  openNow: boolean;
  bookable: boolean;
  hasOffer: boolean;
}

export const EMPTY_FILTERS: WashFilters = { city: '', area: '', maxPrice: 0, kinds: [], minRating: 0, openNow: false, bookable: false, hasOffer: false };

/** أنواعُ الغسيل كلماتٌ تُطابَق بأسماء الخدمات في القاعدة — لا قائمةً ثابتة. */
export const WASH_KINDS: { label: string; keys: string[] }[] = [
  { label: 'خارجي', keys: ['خارجي'] },
  { label: 'شامل', keys: ['شامل', 'كامل'] },
  { label: 'داخلي', keys: ['داخلي'] },
  { label: 'تلميع', keys: ['تلميع'] },
  { label: 'شمع', keys: ['شمع'] },
];
export const kindMatches = (kind: string, serviceName: string): boolean =>
  WASH_KINDS.find((k) => k.label === kind)?.keys.some((w) => serviceName.includes(w)) ?? false;

const PRICES = [0, 5000, 10000, 15000];
const RATINGS = [0, 4, 4.5];

/** عددُ المرشّحات الفعّالة التي لا رقاقةَ لها في الصفّ — لشارة «كل المحطات». */
export const sheetFilterCount = (f: WashFilters): number =>
  Number(!!f.city) + Number(!!f.area.trim()) + Number(f.maxPrice > 0) + Number(f.kinds.length > 0) + Number(f.minRating > 0) + Number(f.bookable);

export const chipCls = (on: boolean) =>
  `min-h-[36px] whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-colors ${
    on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-600'
  }`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function WashFilterSheet({
  open,
  onClose,
  value,
  onApply,
  cities,
  kinds,
}: {
  open: boolean;
  onClose: () => void;
  value: WashFilters;
  onApply: (f: WashFilters) => void;
  /** المدنُ الموجودةُ في البيانات فعلاً. */
  cities: string[];
  /** أنواعُ الغسيل التي تطابقها خدمةٌ واحدةٌ على الأقلّ. */
  kinds: string[];
}) {
  // مسوّدةٌ تُثبَّت بـ«تطبيق» — فالإغلاقُ بالخلفية لا يغيّر شيئاً.
  const [d, setD] = useState(value);
  useEffect(() => {
    if (open) setD(value);
  }, [open, value]);
  const set = <K extends keyof WashFilters>(k: K, v: WashFilters[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggleKind = (k: string) => set('kinds', d.kinds.includes(k) ? d.kinds.filter((x) => x !== k) : [...d.kinds, k]);

  return (
    <Sheet open={open} onClose={onClose} title="كل المحطات" hint="ضيّق القائمة بما يهمّك، ثمّ اضغط «تطبيق».">
      <div className="mt-1">
        <p className="label">المنطقة</p>
        <select value={d.city} onChange={(e) => set('city', e.target.value)} aria-label="المدينة" className="field">
          <option value="">كل المدن</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={d.area}
          onChange={(e) => set('area', e.target.value)}
          className="field mt-2"
          placeholder="المنطقة أو الشارع (اختياري)"
          aria-label="المنطقة"
          maxLength={40}
        />
      </div>

      <Row label="السعر">
        {PRICES.map((p) => (
          <button key={p} type="button" aria-pressed={d.maxPrice === p} onClick={() => set('maxPrice', p)} className={chipCls(d.maxPrice === p)}>
            {p === 0 ? 'أيّ سعر' : `حتى ${iqd(p)}`}
          </button>
        ))}
      </Row>

      {kinds.length > 0 && (
        <Row label="نوع الغسيل">
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={d.kinds.includes(k)} onClick={() => toggleKind(k)} className={chipCls(d.kinds.includes(k))}>
              {k}
            </button>
          ))}
        </Row>
      )}

      <Row label="التقييم">
        {RATINGS.map((r) => (
          <button key={r} type="button" aria-pressed={d.minRating === r} onClick={() => set('minRating', r)} className={chipCls(d.minRating === r)}>
            {r === 0 ? 'الكل' : `${r}+ ★`}
          </button>
        ))}
      </Row>

      <Row label="الحالة">
        <button type="button" aria-pressed={d.openNow} onClick={() => set('openNow', !d.openNow)} className={chipCls(d.openNow)}>
          مفتوحة الآن
        </button>
        <button type="button" aria-pressed={d.bookable} onClick={() => set('bookable', !d.bookable)} className={chipCls(d.bookable)}>
          تقبل الحجز
        </button>
        <button type="button" aria-pressed={d.hasOffer} onClick={() => set('hasOffer', !d.hasOffer)} className={chipCls(d.hasOffer)}>
          يوجد عرض
        </button>
      </Row>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onApply(d);
            onClose();
          }}
          className="btn-primary flex-1"
        >
          تطبيق
        </button>
        <button
          type="button"
          onClick={() => {
            setD(EMPTY_FILTERS);
            onApply(EMPTY_FILTERS);
            onClose();
          }}
          className="btn-ghost px-5"
        >
          مسح الكل
        </button>
      </div>
    </Sheet>
  );
}
