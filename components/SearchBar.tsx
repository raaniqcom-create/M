'use client';

import { useState } from 'react';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { KIND_LABELS, KINDS } from '@/lib/stationMeta';
import { CITY_NAMES } from '@/lib/cities';
import { SearchIcon, SlidersIcon, XIcon } from './icons';
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

export function SearchBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  cityCounts,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  cityCounts: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const active = countActive(filters);
  const set = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  // one flat list of what's applied, so each can be removed with a single tap
  const applied: { label: string; clear: () => void }[] = [
    filters.product && {
      label: PRODUCT_LABELS[filters.product],
      clear: () => set({ product: null }),
    },
    filters.city && { label: filters.city, clear: () => set({ city: null }) },
    filters.kind && { label: KIND_LABELS[filters.kind], clear: () => set({ kind: null }) },
    filters.availableOnly && { label: 'المتوفر الآن', clear: () => set({ availableOnly: false }) },
    filters.openOnly && { label: 'المفتوحة الآن', clear: () => set({ openOnly: false }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="ابحث باسم المحطة أو المنطقة"
          aria-label="بحث عن محطة"
          className="min-h-[48px] w-full rounded-xl border-0 bg-white pl-14 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="بحث متقدم"
          className={`absolute left-1.5 top-1/2 flex h-10 w-11 -translate-y-1/2 items-center justify-center rounded-lg transition-colors duration-200 ${
            open || active > 0 ? 'bg-brand text-white' : 'text-slate-500'
          }`}
        >
          <SlidersIcon className="h-4 w-4" />
          {active > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {active}
            </span>
          )}
        </button>
      </div>

      {applied.length > 0 && !open && (
        <div className="no-scrollbar panel-enter mt-2 flex gap-1.5 overflow-x-auto">
          {applied.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.clear}
              aria-label={`إزالة ${f.label}`}
              className="flex min-h-[30px] shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 text-[12px] font-semibold text-white backdrop-blur-sm"
            >
              {f.label}
              <XIcon className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="panel-enter mt-2 space-y-4 rounded-2xl bg-white p-4 text-right shadow-lift">
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
            <p className="mb-1.5 text-xs font-semibold text-slate-500">المدينة أو المنطقة</p>
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
              <span className="text-sm text-slate-700">المتوفر الآن فقط</span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
              <input
                type="checkbox"
                checked={filters.openOnly}
                onChange={(e) => set({ openOnly: e.target.checked })}
                className="h-4 w-4 accent-[#16a34a]"
              />
              <span className="text-sm text-slate-700">المحطات المفتوحة الآن فقط</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {active > 0 && (
              <button
                type="button"
                onClick={() => onFiltersChange(EMPTY_FILTERS)}
                className="btn-ghost"
              >
                مسح الفلاتر
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`btn-primary ${active > 0 ? '' : 'col-span-2'}`}
            >
              عرض النتائج
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
