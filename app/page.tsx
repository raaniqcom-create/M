'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceKm, loadStations } from '@/lib/stations';
import { useSiteStats } from '@/lib/useSiteStats';
import { useNativeApp } from '@/lib/useNativeApp';
import { homeFor, useSession } from '@/lib/useSession';
import { playAlert, unlockAudio } from '@/lib/alertSound';
import { SoundToggle } from '@/components/SoundToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { SideMenu } from '@/components/SideMenu';
import { isFresh, isOpenNow } from '@/lib/hours';
import { plural } from '@/lib/freshness';
import { PRODUCT_LABELS, isOffered } from '@/lib/products';
import { CITY_NAMES } from '@/lib/cities';
import { StationCard } from '@/components/StationCard';
import { PromoStrip } from '@/components/PromoStrip';
import { AlertsPrompt } from '@/components/AlertsPrompt';
import { useAlertChoice, useFollowedStations } from '@/lib/alerts';
import { TripAsk } from '@/components/TripAsk';
import { UnregisteredBoard } from '@/components/UnregisteredBoard';
import { AvailabilityPopup } from '@/components/AvailabilityPopup';
import { forCities, useOpenAnnouncements } from '@/lib/announcements';

/** يربط بطاقة المنتج المعلَن بخبره أسفل الصفحة. */
const UNREGISTERED_BOARD_ID = 'unregistered-board';
import { ProductsDashboard } from '@/components/ProductsDashboard';
import { NewsTicker } from '@/components/NewsTicker';
import { InstallPrompt } from '@/components/InstallPrompt';
import { WaitingForStations } from '@/components/WaitingForStations';
import { FirstRun } from '@/components/FirstRun';
import { SearchBar, EMPTY_FILTERS, countActive, type Filters } from '@/components/SearchBar';
import {
  BellIcon,
  DownloadIcon,
  FuelIcon,
  ListIcon,
  MapPinIcon,
  SearchIcon,
  ShieldIcon,
  SpinnerIcon,
  StoreIcon,
} from '@/components/icons';
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
  // «اعرض الباقي» — لحظيّ لا محفوظ: من وسّع مرةً لا يعني أنه غيّر اشتراكه.
  const [showAll, setShowAll] = useState(false);
  const { choice } = useAlertChoice();

  // خمس مدن فأكثر: النطاق كل الأنبار ابتداءً.
  //
  // ليس اختصاراً في النصّ بل صدقاً فيه — سردُ خمسة أسماء لا يُقرأ على زرّ،
  // وكتابة «كل الأنبار» فوق تصفيةٍ تحجب إحدى عشرة مدينة كذبٌ صريح. ومن اختار
  // هذا العدد يبحث في المحافظة أصلاً، والزرّ يبقى ليقصره على مدنه متى شاء.
  const wideChoice = (choice?.cities?.length ?? 0) > 4;
  useEffect(() => {
    if (wideChoice) setShowAll(true);
  }, [wideChoice]);
  // نداء واحد يغذّي اللوحة الحمراء ولوحة المنتجات معاً.
  const { announcements, reload: reloadAnnouncements } = useOpenAnnouncements();
  const { visits, online } = useSiteStats();
  // The star is the follow now — see useFollowedStations in lib/alerts.ts.
  const { isFollowed, toggle: toggleFollow } = useFollowedStations();
  const [followNote, setFollowNote] = useState<string | null>(null);

  async function onStar(id: string) {
    const r = await toggleFollow(id);
    setFollowNote(
      r === 'ok' || r === 'off'
        ? null
        : r === 'denied'
          ? 'الإشعارات موقوفة لهذا التطبيق على جهازك. أعِدها من صفحة التنبيهات — فيها الخطوات — فالنجمة تعني أن يصلك خبرها.'
          : r === 'unsupported'
            ? 'هذا المتصفح لا يدعم الإشعارات — حمّل التطبيق لتصلك أخبار محطاتك.'
            : r === 'pending'
              ? 'التسجيل لم يكتمل بعد. انتظر لحظة وأعد المحاولة.'
              : 'تعذّر حفظ المتابعة. تأكد من الاتصال وأعد المحاولة.'
    );
  }
  const native = useNativeApp();
  const { signedIn, role, ready } = useSession();

  // Send an owner or admin to their panel on open. Only once, and never when
  // they asked for the visitor view — a redirect they cannot escape is worse
  // than the wrong landing page.
  useEffect(() => {
    if (!signedIn) return;
    if (new URLSearchParams(window.location.search).has('view')) return;
    const target = homeFor(role);
    if (target) router.replace(target);
  }, [signedIn, role, router]);

  // the realtime handler is registered once; read favourites through a ref so
  // it always sees the current set instead of the one captured on mount
  const favoriteRef = useRef(isFollowed);
  favoriteRef.current = isFollowed;

  // browsers block audio until the page has been interacted with
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    // A dropped connection must surface as a retry prompt, not an endless
    // spinner — and that was the intent here, but nothing enforced it. If a
    // request neither resolves nor rejects (a WebView that suspends mid-flight
    // is the common way), .catch never runs and the first screen of the app is
    // a spinner that never stops. So the wait is bounded here rather than
    // trusted to the transport.
    const withDeadline = (p: Promise<StationWithStatus[]>, ms: number) =>
      new Promise<StationWithStatus[]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        p.then(resolve, reject).finally(() => clearTimeout(t));
      });

    const refresh = () =>
      withDeadline(loadStations(), 15000)
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

  // موقعٌ بلا استئذان، لمن أذن سابقاً.
  //
  // TripAsk يحسب هذا الموقع نفسه على هذه الصفحة منذ البداية — يفحص الإذن أولاً
  // ولا يطلب شيئاً إن لم يكن ممنوحاً — ثم يرميه بعد أن يقرّر قُربه من محطة.
  // فالحساب واقعٌ أصلاً، وكل ما ينقص أن يُستفاد منه في الترتيب.
  //
  // وقاعدة المشروع تبقى كما هي: لا نافذة إذن تظهر لأحد لم يطلبها. من لم يأذن
  // يرى الترتيب المعتاد، وزرّ «رتّب حسب الأقرب إليّ» في مكانه.
  useEffect(() => {
    if (origin || !navigator.geolocation) return;
    let cancelled = false;
    (async () => {
      try {
        const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (st && st.state !== 'granted') return;
      } catch {
        return; // بلا واجهة أذونات: الصمت أسلم من مخاطرة نافذة
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          !cancelled && setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { maximumAge: 60_000, timeout: 8_000 }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [origin]);

  const visible = useMemo(() => {
    if (!stations) return null;
    let rows = origin
      ? stations
          .map((s) => ({ ...s, distanceKm: distanceKm(origin, s) }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
      : stations;

    // مدن المستخدم أولاً، وما عداها خلف زرّ.
    //
    // سبعون بالمئة من المشتركين اختاروا مدينة واحدة، وكانوا يرون محطات ستّ عشرة
    // مدينة. والإخفاء الحازم كان يحجب بانزيناً في الخالدية عمّن اختار الرمادي
    // وبينهما ربع ساعة — فالتصفية افتراضية لا نهائية، وتحتها عدّ صريح وزرّ.
    //
    // ولا تُطبَّق إلا حين يختار المستخدم مدينةً بعينها في شرائح البحث: اختياره
    // اللحظي أولى من اشتراكه المحفوظ.
    const mine = choice?.cities?.length ? choice.cities : null;
    if (mine && !showAll && !filters.city) rows = rows.filter((s) => mine.includes(s.city));

    if (filters.openOnly) rows = rows.filter(isOpenNow);
    if (filters.city) rows = rows.filter((s) => s.city === filters.city);
    if (filters.kind) rows = rows.filter((s) => s.kind === filters.kind);
    if (filters.availableOnly) {
      rows = rows.filter(
        (s) => s.products.some((p) => isOffered(s, p))
      );
    }
    if (filters.product) {
      rows = rows.filter((s) =>
        s.products.some(
          (p) =>
            p.product === filters.product &&
            (filters.availableOnly
              ? isOffered(s, p)
              : isOffered(s, p) || !!p.expected_at)
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
        (p) => isOffered(s, p) || !!p.expected_at
      );

    return [...rows].sort(
      (a, b) =>
        Number(isFollowed(b.id)) - Number(isFollowed(a.id)) ||
        Number(actionable(b)) - Number(actionable(a))
    );
  }, [stations, origin, filters, query, isFollowed, choice, showAll]);

  // كم محطة تُخفيها التصفية — الرقم نفسه الذي يظهر على الزرّ.
  const hiddenElsewhere = useMemo(() => {
    const mine = choice?.cities?.length ? choice.cities : null;
    if (!mine || showAll || filters.city) return 0;
    return (stations ?? []).filter((s) => !mine.includes(s.city)).length;
  }, [stations, choice, showAll, filters.city]);

  // ما يُعرض الآن، لا ما سيحدث عند الضغط.
  //
  // ولا يظهر أصلاً لمن لا اشتراك له أو لمن لا محطات خارج مدنه: زرٌّ لا يغيّر
  // شيئاً هو أثاثٌ يُشغل مكاناً ويُعلَّم أنه بلا فائدة.
  const scopeLabel = useMemo(() => {
    const mine = choice?.cities?.length ? choice.cities : null;
    if (!mine || filters.city) return null;
    if (showAll) return 'محطات كل الأنبار';
    if (!hiddenElsewhere) return null;
    // الأسماء صريحة: «محطات الرمادي، الفلوجة» أوضح من «محطات مدني (2)» —
    // القارئ يرى نطاقه بلا أن يفتح إعداداته ليتذكّره.
    return `محطات ${mine.join('، ')}`;
  }, [choice, showAll, filters.city, hiddenElsewhere]);

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
            {/* «رجعت لم أعرف أين أجد الإشعارات» — beside the sound control,
                which is where the user asked for it and where anything about
                notifications already lives. */}
            <div className="absolute left-0 flex items-center">
              <NotificationBell />
              <SoundToggle />
            </div>
          </div>
          <p className="mt-1 text-center text-xs text-white/80">منصة وقود الأنبار — في كل مدن الأنبار</p>

          {/* An empty list is only a disappointment if nothing is offered in
              its place. Tell the visitor what to do right now instead of what
              the platform lacks — and keep the honesty about calling ahead,
              which is what stops a driver burning fuel on a stale claim. */}
          {/* This told the visitor to "choose your city and your fuel" and gave
              them nothing to tap — while the nearest green button on the screen
              was «سجّل محطتك مجاناً». An instruction with no target sends people
              to the loudest control instead, which is exactly how citizens ended
              up on the owner registration form. */}
          <a
            href="/alerts"
            className="mt-2 flex items-start gap-2 rounded-lg bg-white/15 px-3 py-2 text-[11px] leading-relaxed text-white"
          >
            <BellIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              اختر <b>مدينتك</b> و<b>نوع الوقود</b> الذي يهمك، وانتظر — أول ما تسجّل محطة
              ويتوفر المنتج، يصلك إشعار. <b className="underline">اختر الآن ←</b>
              <br />
              المحطات تُضاف تباعاً. وكل حالة يُكتب معها وقتها.
            </span>
          </a>
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
              {role === 'admin' ? (
                <>
                  <ShieldIcon className="h-4 w-4" />
                  فتح لوحة التحكم
                </>
              ) : (
                <>
                  <StoreIcon className="h-4 w-4" />
                  العودة إلى لوحة محطتي
                </>
              )}
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
                <DownloadIcon className="h-4 w-4" />
                حمّل التطبيق
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
            {/* onPickAnnounced: منتجٌ لا محطة مسجّلة له — الضغط يقود إلى خبره
                لا إلى قائمة فارغة. وبمعرّفٍ في DOM لا بمرجع React، لأن اللوحة
                تُركَّب داخل فرعٍ شرطيّ آخر فقد يكون المرجع فارغاً لحظة الضغط.

                والتعليق هنا لا بين الخصائص: تعليقٌ داخل وسم JSX يبتلع الخاصّية
                التي تليه صامتاً — تُمرَّر undefined، ويصير `?.()` لا شيء، ولا
                خطأ في أي مكان. ضاع في تتبّعه وقتٌ يستحقّ هذا السطر. */}
            <ProductsDashboard
              stations={stations}
              filter={filters.product}
              onPick={(product) => setFilters({ ...filters, product })}
              announced={forCities(announcements, choice?.cities)}
              onPickAnnounced={() =>
                document
                  .getElementById(UNREGISTERED_BOARD_ID)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            />
          </div>
        )}

        <div className="mb-3">
          <PromoStrip />
        </div>

        {/* حقلٌ واحد بثلاثة أوجه، لا زرّان متراكمان.
          *
          *  «قريبة لي» كان زرّاً منفصلاً بعرض الشاشة يوحي بأنه إجراء آخر، وهو
          *  وجهٌ ثالث لنفس السؤال: كيف أرى المحطات؟ وضمُّه إلى الصفّ يجعل
          *  الحالة الفعّالة واحدةً ظاهرة بدل حالتين متجاورتين. */}
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-brand-50 p-1">
          {(['list', 'map', 'near'] as const).map((v) => {
            const active = v === 'near' ? !!origin : view === v && !origin;
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  if (v === 'near') return locate();
                  // العودة إلى قائمة أو خريطة تُنهي ترتيب القُرب، وإلا بقي
                  // القسم الثالث مُضاءً بينما المستخدم يظنّ أنه خرج منه.
                  setOrigin(null);
                  setView(v);
                }}
                aria-pressed={active}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                  active ? 'bg-white text-brand shadow-soft' : 'text-brand-700'
                }`}
              >
                {v === 'list' ? <ListIcon className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
                {v === 'list' ? 'قائمة' : v === 'map' ? 'خريطة' : 'قريبة لي'}
              </button>
            );
          })}
        </div>

        {/* الحقل الثاني: النطاق. يقول ما يُعرض الآن لا ما سيفعله إن ضُغط. */}
        {scopeLabel && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="btn-ghost mt-2 w-full text-brand"
          >
            <ListIcon className="h-4 w-4" />
            {scopeLabel}
          </button>
        )}

        <div className="mt-4">
          {failed && stations === null && (
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

          {visible && view === 'map' && (
            <StationMap stations={visible} onSelect={(id) => router.push(`/station/${id}`)} />
          )}

          {visible && view === 'list' && (
            <div className="space-y-3">
              {/* فوق القائمة: خبرٌ عاجل عن محطة لا نملك عنها إلا لحظة واحدة —
              فمكانه قبل المحطات التي نعرف عنها كل شيء. */}
              <div id={UNREGISTERED_BOARD_ID}>
                <UnregisteredBoard rows={announcements} onVoted={reloadAnnouncements} />
                {/* وخبر المسجّلة في شاشته: مسارٌ منفصل تماماً، فلا يظهر اسم
                    محطة معروفة تحت عنوان ينفي تسجيلها. */}
                <AvailabilityPopup rows={announcements} />
              </div>

          {visible.length === 0 && (
                <div className="card p-8 text-center">
                  <FuelIcon className="mx-auto h-8 w-8 text-brand-200" />
                  {/* The list is empty by design while the first stations
                      register, so say that plainly and point owners at
                      registration instead of showing drivers a bare
                      "no results". The platform itself is live — it is the
                      stations that are still arriving. */}
                  {!query && countActive(filters) === 0 && stations?.length === 0 ? (
                    <WaitingForStations />
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
                  isFavorite={isFollowed(station.id)}
                  onToggleFavorite={() => onStar(station.id)}
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
        {followNote && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            {followNote}
          </p>
        )}

        {/* Above the owner banner, not below it: whoever has not chosen a city
            and a fuel yet is the visitor this platform exists for. */}
        {!signedIn && <AlertsPrompt />}

        {!signedIn && stations !== null && stations.length > 0 && (
          <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-center">
            <p className="text-sm font-bold text-brand-900">صاحب محطة؟ محطتك غير مسجّلة؟</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">
              أضفها مجاناً وتظهر لآلاف المستخدمين في الأنبار — بلا رسوم ولا عمولة.
              التسجيل مفتوح الآن لجميع مدن المحافظة.
            </p>
            {/* Ghost, not primary: this block speaks to a few dozen owners and
                sits in front of everyone else. It should be findable, not loud. */}
            <a href="/register" className="btn-ghost mt-3 w-full">
              سجّل محطتك مجاناً
            </a>
            <p className="mt-3 border-t border-brand-100 pt-3 text-xs text-brand-800">
              لست صاحب محطة؟{' '}
              <a href="/alerts" className="font-bold underline">
                فعّل التنبيهات ليصلك خبر الوقود
              </a>
            </p>
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
