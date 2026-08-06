'use client';

import { useState } from 'react';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { KIND_LABELS, KINDS } from '@/lib/stationMeta';
import { CITY_NAMES } from '@/lib/cities';
import { SearchIcon, XIcon } from './icons';
import type { FuelProduct, StationKind } from '@/types/database';

export interface Filters {
  product: FuelProduct | null;
  city: string | null;
  kind: StationKind | null;
  openOnly: boolean;
  availableOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  product: null,
  city: null,
  kind: null,
  openOnly: false,
  availableOnly: false,
};

export function countActive(f: Filters): number {
  return (
    (f.product ? 1 : 0) +
    (f.city ? 1 : 0) +
    (f.kind ? 1 : 0) +
    (f.openOnly ? 1 : 0) +
    (f.availableOnly ? 1 : 0)
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[38px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200 ${
        active ? 'bg-brand text-white' : 'bg-white text-brand-700 ring-1 ring-brand-100'
      }`}
    >
      {children}
    </button>
  );
}

export function AdvancedFilter({
  filters,
  onChange,
  cityCounts,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  cityCounts: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const active = countActive(filters);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between px-4"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-brand-900">
          <SearchIcon className="h-4 w-4" />
          بحث متقدم
          {active > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] text-white">
              {active}
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{open ? 'إخفاء' : 'عرض'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-brand-100 px-4 py-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">نوع الوقود</p>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              <Chip active={filters.product === null} onClick={() => set({ product: null })}>
                الكل
              </Chip>
              {PRODUCT_ORDER.map((p) => (
                <Chip
                  key={p}
                  active={filters.product === p}
                  onClick={() => set({ product: filters.product === p ? null : p })}
                >
                  {PRODUCT_LABELS[p]}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">المدينة</p>
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              <Chip active={filters.city === null} onClick={() => set({ city: null })}>
                كل الأنبار
              </Chip>
              {CITY_NAMES.filter((c) => (cityCounts.get(c) ?? 0) > 0 || filters.city === c).map(
                (c) => (
                  <Chip
                    key={c}
                    active={filters.city === c}
                    onClick={() => set({ city: filters.city === c ? null : c })}
                  >
                    {c} ({cityCounts.get(c) ?? 0})
                  </Chip>
                )
              )}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">نوع المحطة</p>
            <div className="flex gap-1.5">
              <Chip active={filters.kind === null} onClick={() => set({ kind: null })}>
                الكل
              </Chip>
              {KINDS.map((k) => (
                <Chip
                  key={k}
                  active={filters.kind === k}
                  onClick={() => set({ kind: filters.kind === k ? null : k })}
                >
                  {KIND_LABELS[k]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
              <input
                type="checkbox"
                checked={filters.availableOnly}
                onChange={(e) => set({ availableOnly: e.target.checked })}
                className="h-4 w-4 accent-[#16a34a]"
              />
              <span className="text-sm">المتوفر الآن فقط (بدون الحجوزات المتوقعة)</span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
              <input
                type="checkbox"
                checked={filters.openOnly}
                onChange={(e) => set({ openOnly: e.target.checked })}
                className="h-4 w-4 accent-[#16a34a]"
              />
              <span className="text-sm">المحطات المفتوحة الآن فقط</span>
            </label>
          </div>

          {active > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="btn-ghost w-full"
            >
              <XIcon className="h-4 w-4" />
              مسح كل الفلاتر
            </button>
          )}
        </div>
      )}
    </section>
  );
}
