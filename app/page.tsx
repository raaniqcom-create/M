'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceKm, loadStations } from '@/lib/stations';
import { useSiteStats } from '@/lib/useSiteStats';
import { useFavorites } from '@/lib/favorites';
import { useNativeApp } from '@/lib/useNativeApp';
import { homeFor, useSession } from '@/lib/useSession';
import { playAlert, unlockAudio } from '@/lib/alertSound';
import { SoundToggle } from '@/components/SoundToggle';
import { SideMenu } from '@/components/SideMenu';
import { isFresh, isOpenNow } from '@/lib/hours';
import { PRODUCT_LABELS } from '@/lib/products';
import { CITY_NAMES } from '@/lib/cities';
import { StationCard } from '@/components/StationCard';
import { PromoStrip } from '@/components/PromoStrip';
import { TripAsk } from '@/components/TripAsk';
import { ProductsDashboard } from '@/components/ProductsDashboard';
import { NewsTicker } from '@/components/NewsTicker';
import { InstallPrompt } from '@/components/InstallPrompt';
import { AlertSetup } from '@/components/AlertSetup';
import { FirstRun } from '@/components/FirstRun';
import { SearchBar, EMPTY_FILTERS, countActive, type Filters } from '@/components/SearchBar';
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
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { visits, online } = useSiteStats();
  const { toggle: toggleFavorite, isFavorite } = useFavorites();
  const native = useNativeApp();
  const { signedIn, role, ready } = useSession();

  // Send an owner or admin to their panel on open. Only once, and never when
  // they asked for the driver view — a redirect they cannot escape is worse
  // than the wrong landing page.
  useEffect(() => {
    if (!signedIn) return;
    if (new URLSearchParams(window.location.search).has('view')) return;
    const target = homeFor(role);
    if (target) router.replace(target);
  }, [signedIn, role, router]);

  // the realtime handler is registered once; read favourites through a ref so
  // it always sees the current set instead of the one captured on mount
  const favoriteRef = useRef(isFavorite);
  favoriteRef.current = isFavorite;

  // browsers block audio until the page has been interacted with
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'station_products' },
        (payload) => {
          // Only fuel *arriving* at a starred station is worth a sound. A
          // product going out of stock, or any change elsewhere, is silent.
          const row = payload.new as { station_id?: string; is_available?: boolean } | null;
          const before = payload.old as { is_available?: boolean } | null;
          if (
            row?.is_available &&
            !before?.is_available &&
            row.station_id &&
            favoriteRef.current(row.station_id)
          ) {
            playAlert();
          }
          refresh();
        }
      )
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

    if (filters.openOnly) rows = rows.filter(isOpenNow);
    if (filters.city) rows = rows.filter((s) => s.city === filters.city);
    if (filters.kind) rows = rows.filter((s) => s.kind === filters.kind);
    if (filters.availableOnly) {
      rows = rows.filter(
        (s) => isOpenNow(s) && s.products.some((p) => p.is_available && isFresh(p.updated_at))
      );
    }
    if (filters.product) {
      rows = rows.filter((s) =>
        s.products.some(
          (p) =>
            p.product === filters.product &&
            (filters.availableOnly
              ? p.is_available && isFresh(p.updated_at) && isOpenNow(s)
              : (p.is_available && isFresh(p.updated_at)) || p.expected_at)
        )
      );
    }

    const q = query.trim();
    if (q) rows = rows.filter((s) => s.name.includes(q) || s.address.includes(q) || s.city.includes(q));

    // A station with nothing in stock used to be hidden outright. That reads as
    // an empty app whenever owners haven't updated yet, and it hides the one
    // thing we do know — that the station exists and where it is. Sink them
    // instead: pinned first, then anything a driver can act on now.
    const actionable = (s: StationWithStatus) =>
      s.products.some(
        (p) => (p.is_available && isFresh(p.updated_at) && isOpenNow(s)) || p.expected_at
      );

    return [...rows].sort(
      (a, b) =>
        Number(isFavorite(b.id)) - Number(isFavorite(a.id)) ||
        Number(actionable(b)) - Number(actionable(a))
    );
  }, [stations, origin, filters, query, isFavorite]);

  const cityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations ?? []) m.set(s.city, (m.get(s.city) ?? 0) + 1);
    return m;
  }, [stations]);

  return (
    <>
      <header className="safe-top bg-gradient-to-b from-brand-700 to-brand px-4 pb-5 text-white">
        <div className="mx-auto max-w-md">
          <div className="relative flex items-center justify-center gap-2">
            <FuelIcon className="h-6 w-6" />
            <h1 className="text-lg font-extrabold">المحطة التقنية</h1>
            <div className="absolute right-0">
              <SideMenu onAvailableOnly={() => setFilters({ ...EMPTY_FILTERS, availableOnly: true })} />
            </div>
            <div className="absolute left-0">
              <SoundToggle />
            </div>
          </div>
          <p className="mt-1 text-center text-xs text-white/80">منصة وقود الأنبار — نبدأ من الرمادي</p>

          {/* An empty list is only a disappointment if nothing is offered in
              its place. Tell the visitor what to do right now instead of what
              the platform lacks — and keep the honesty about calling ahead,
              which is what stops a driver burning fuel on a stale claim. */}
          <p className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-center text-[11px] leading-relaxed text-white">
            🔔 اختر <b>مدينتك</b> و<b>نوع الوقود</b> الذي يهمك، وانتظر — أول ما تسجّل
            محطة ويتوفر المنتج، يصلك إشعار.
            <br />
            المحطات تُضاف تباعاً. واتصل بالمحطة قبل أن تتحرك.
          </p>
          {/* Both of these speak to someone browsing the site. Inside the app
              they are dead weight: the download already happened, and the
              "coming soon" badge contradicts the app in their hand. */}
          {/* A signed-in admin or owner should reach their panel from the first
              screen, not by hunting through a drawer. */}
          {signedIn && (
            <a
              href={role === 'admin' ? '/admin' : '/owner'}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-brand-700"
            >
              {role === 'admin' ? '🛡 فتح لوحة الإدارة' : '🏪 العودة إلى لوحة محطتي'}
            </a>
          )}
          {/* The blinking "قريباً" pill used to sit right beside this live
              download link. Both store listings went out today; telling a
              visitor the app is still coming, next to a button that installs
              it, is the one contradiction that costs the install. */}
          {!native && !signedIn && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <a
                href="/download"
                className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-brand-700"
              >
                📱 حمّل التطبيق
              </a>
            </div>
          )}

          <div className="mt-4">
            <SearchBar
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={setFilters}
              cityCounts={cityCounts}
            />
          </div>

          {/* Coverage sits beside the counts on purpose: with no stations yet,
              "16 cities" is the only number that says how far this reaches. */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: 'زائر', value: visits ?? '—' },
              { label: 'مدينة', value: CITY_NAMES.length },
              { label: 'محطة', value: stations?.length ?? '—' },
              { label: 'متصل', value: online, live: true },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-white/10 py-2 text-center backdrop-blur-sm"
              >
                <p className="text-base font-extrabold leading-none">{stat.value}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-white/80">
                  {stat.live && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-300" />
                  )}
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-24 pt-4">
        <TripAsk stations={stations} />
        {stations && (
          <div className="mb-4">
            <ProductsDashboard
              stations={stations}
              filter={filters.product}
              onPick={(product) => setFilters({ ...filters, product })}
            />
          </div>
        )}

        <div className="mb-3">
          <PromoStrip />
        </div>

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

        <button type="button" onClick={locate} className={`btn-ghost mt-3 w-full ${origin ? 'text-brand' : ''}`}>
          <MapPinIcon className="h-4 w-4" />
          {origin ? 'مرتّبة حسب الأقرب إليك' : 'رتّب حسب الأقرب إليّ'}
        </button>

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
                  {/* The list is empty by design while the first stations
                      register, so say that plainly and point owners at
                      registration instead of showing drivers a bare
                      "no results". The platform itself is live — it is the
                      stations that are still arriving. */}
                  {!query && countActive(filters) === 0 && stations?.length === 0 ? (
                    <>
                      <p className="mt-3 text-sm font-bold text-slate-700">
                        لا توجد محطات مسجّلة بعد
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        المنصة تعمل الآن ونستقبل تسجيل المحطات في جميع مدن الأنبار.
                        لا تنتظر — اختر مدينتك ووقودك، ونحن ننبّهك أول ما تصل محطة.
                      </p>
                      <div className="mt-5 border-t border-slate-100 pt-5 text-right">
                        <AlertSetup compact />
                      </div>
                      <a href="/register" className="btn-ghost mt-5 w-full">
                        صاحب محطة؟ سجّلها مجاناً
                      </a>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-medium text-slate-600">
                      {query
                        ? `لا توجد نتائج لـ «${query}»`
                        : filters.product
                          ? `لا توجد محطة يتوفر فيها ${PRODUCT_LABELS[filters.product]} حالياً`
                          : 'لا توجد محطات متاحة الآن'}
                    </p>
                  )}
                  {(countActive(filters) > 0 || query) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilters(EMPTY_FILTERS);
                        setQuery('');
                      }}
                      className="btn-ghost mt-4 px-6"
                    >
                      عرض كل المحطات
                    </button>
                  )}
                </div>
              )}
              {visible.map((station, i) => (
                <StationCard
                  key={station.id}
                  station={station}
                  tinted={i % 2 === 1}
                  isFavorite={isFavorite(station.id)}
                  onToggleFavorite={() => toggleFavorite(station.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Registration is offered exactly once. While the map is empty the
            call sits inside the empty state, where the eye already is; once
            stations exist that block disappears and this banner takes over —
            which is also when owners start looking. Showing both at once put
            the same green button on screen twice. */}
        {!signedIn && stations !== null && stations.length > 0 && (
          <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-center">
            <p className="text-sm font-bold text-brand-900">محطتك غير مسجّلة؟</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">
              أضفها مجاناً وتظهر لآلاف السائقين في الأنبار — بلا رسوم ولا عمولة.
              التسجيل مفتوح الآن لجميع مدن المحافظة.
            </p>
            <a href="/register" className="btn-primary mt-3 w-full">
              سجّل محطتك مجاناً
            </a>
            <a href="/login" className="mt-2 block min-h-[44px] pt-2 text-xs font-semibold text-brand-700">
              لديك حساب؟ سجّل الدخول
            </a>
          </section>
        )}
        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          فكرة وتنفيذ أحمد الرفاعي
        </p>
      </main>

      {ready && !signedIn && <FirstRun />}
      <InstallPrompt />
      <NewsTicker stations={stations ?? []} />
    </>
  );
}
