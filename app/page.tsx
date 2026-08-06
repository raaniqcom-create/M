'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceKm, loadStations } from '@/lib/stations';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { StationCard } from '@/components/StationCard';
import { AdBanner } from '@/components/AdBanner';
import { PromoStrip } from '@/components/PromoStrip';
import { NewsTicker } from '@/components/NewsTicker';
import { FuelIcon, ListIcon, MapPinIcon, SearchIcon, SpinnerIcon } from '@/components/icons';
import type { FuelProduct, StationWithStatus } from '@/types/database';

// Leaflet touches window at import time, so it can't be server-rendered
const StationMap = dynamic(() => import('@/components/StationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-2xl bg-brand-50">
      <SpinnerIcon className="h-6 w-6 text-brand" />
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();
  const [stations, setStations] = useState<StationWithStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [filter, setFilter] = useState<FuelProduct | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    // a dropped connection must surface as a retry prompt, not an endless spinner
    const refresh = () =>
      loadStations()
        .then((rows) => {
          setStations(rows);
          setFailed(false);
        })
        .catch(() => setFailed(true));

    refresh();

    // any availability toggle or new vote just refetches — station counts are
    // small (single city), so this beats hand-merging every event type
    const channel = supabase
      .channel('home-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_products' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'traffic_votes' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stations' }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function locate() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }

  const visible = useMemo(() => {
    if (!stations) return null;
    let rows = origin
      ? stations
          .map((s) => ({ ...s, distanceKm: distanceKm(origin, s) }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
      : stations;

    if (filter) {
      rows = rows.filter((s) => s.products.some((p) => p.product === filter && p.is_available));
    }
    const q = query.trim();
    if (q) {
      rows = rows.filter((s) => s.name.includes(q) || s.address.includes(q));
    }
    return rows;
  }, [stations, origin, filter, query]);

  const openCount = stations?.filter((s) => s.products.some((p) => p.is_available)).length ?? 0;

  return (
    <>
      <header className="bg-gradient-to-b from-brand-700 to-brand px-4 pb-5 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-center gap-2">
            <FuelIcon className="h-6 w-6" />
            <h1 className="text-lg font-extrabold">المحطة التقنية</h1>
          </div>
          <p className="mt-1 text-center text-xs text-white/80">منصة وقود الأنبار — الرمادي</p>

          <div className="relative mt-4">
            <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المحطة أو المنطقة"
              aria-label="بحث عن محطة"
              className="min-h-[46px] w-full rounded-xl border-0 bg-white pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>

          {stations && (
            <div className="mt-3 flex justify-center gap-4 text-xs text-white/90">
              <span>{stations.length} محطة</span>
              <span aria-hidden>•</span>
              <span>{openCount} متوفر فيها وقود</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-24 pt-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-brand-50 p-1">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                view === v ? 'bg-white text-brand shadow-soft' : 'text-brand-700'
              }`}
            >
              {v === 'list' ? <ListIcon className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
              {v === 'list' ? 'قائمة' : 'خريطة'}
            </button>
          ))}
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            type="button"
            onClick={() => setFilter(null)}
            aria-pressed={filter === null}
            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${
              filter === null ? 'bg-brand text-white' : 'bg-white text-brand-700 ring-1 ring-brand-100'
            }`}
          >
            الكل
          </button>
          {PRODUCT_ORDER.map((product) => (
            <button
              key={product}
              type="button"
              onClick={() => setFilter(filter === product ? null : product)}
              aria-pressed={filter === product}
              className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${
                filter === product
                  ? 'bg-brand text-white'
                  : 'bg-white text-brand-700 ring-1 ring-brand-100'
              }`}
            >
              {PRODUCT_LABELS[product]}
            </button>
          ))}
        </div>

        <button type="button" onClick={locate} className={`btn-ghost mt-3 w-full ${origin ? 'text-brand' : ''}`}>
          <MapPinIcon className="h-4 w-4" />
          {origin ? 'مرتّبة حسب الأقرب إليك' : 'رتّب حسب الأقرب إليّ'}
        </button>

        <div className="mt-4">
          <AdBanner />
        </div>

        <div className="mt-4">
          {failed && (
            <div className="card p-8 text-center" role="alert">
              <p className="text-sm font-medium text-slate-600">
                تعذّر تحميل المحطات. تحقق من اتصالك بالإنترنت.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-ghost mt-4 px-6"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {!failed && visible === null && (
            <div className="flex justify-center py-10">
              <SpinnerIcon className="h-6 w-6 text-brand" />
            </div>
          )}

          {!failed && visible && view === 'map' && (
            <StationMap stations={visible} onSelect={(id) => router.push(`/station/${id}`)} />
          )}

          {!failed && visible && view === 'list' && (
            <div className="space-y-3">
              {visible.length === 0 && (
                <div className="card p-8 text-center">
                  <FuelIcon className="mx-auto h-8 w-8 text-brand-200" />
                  <p className="mt-3 text-sm font-medium text-slate-600">
                    {query
                      ? `لا توجد نتائج لـ «${query}»`
                      : filter
                        ? `لا توجد محطة يتوفر فيها ${PRODUCT_LABELS[filter]} حالياً`
                        : 'لا توجد محطات معتمدة بعد'}
                  </p>
                  {(filter || query) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilter(null);
                        setQuery('');
                      }}
                      className="btn-ghost mt-4 px-6"
                    >
                      عرض كل المحطات
                    </button>
                  )}
                </div>
              )}
              {visible.map((station) => (
                <StationCard key={station.id} station={station} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <PromoStrip />
        </div>

        <a href="/login" className="mt-6 block min-h-[44px] pt-3 text-center text-sm text-brand-700">
          هل أنت صاحب محطة؟ سجّل محطتك
        </a>
      </main>

      <NewsTicker stations={stations ?? []} />
    </>
  );
}
