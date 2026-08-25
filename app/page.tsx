'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceKm, loadStations } from '@/lib/stations';
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

import { ProductsDashboard } from '@/components/ProductsDashboard';
import { NewsTicker } from '@/components/NewsTicker';
import { InstallPrompt } from '@/components/InstallPrompt';
import { SplashScreen } from '@/components/SplashScreen';
import { SiteFooter } from '@/components/SiteFooter';
import { ScopeBar } from '@/components/ScopeBar';
import { BottomDock } from '@/components/BottomDock';
import { Sheet } from '@/components/Sheet';
import { WaitingForStations } from '@/components/WaitingForStations';
import { FirstRun } from '@/components/FirstRun';
import { SearchBar, EMPTY_FILTERS, countActive, type Filters } from '@/components/SearchBar';
import {
  BellIcon,
  InfoIcon,
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

/** يربط بطاقة المنتج المعلَن بخبره أسفل الصفحة. */
const UNREGISTERED_BOARD_ID = 'unregistered-board';
// خريطةٌ فارغة ثابتة: تمنع شرائح المدن داخل الفلاتر، وتُنشأ مرّةً لا في
// كل رسم — فلا تُعيد تركيب SearchBar بمرجعٍ جديد كل مرّة.
const EMPTY_CITY_COUNTS: Map<string, number> = new Map();

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
  // مدنٌ تُختار للحظتها ولا تُحفظ.
  //
  // 70% من المشتركين اختاروا مدينةً واحدة، وهي وحدها ما يُحفظ ويُبنى عليه
  // الإشعار. ومن أراد أن يرى مدينةً ثانية اليوم — مسافراً أو سائلاً لأخيه —
  // يضيفها هنا، ويعود التطبيق إلى مدينته حين يُفتح ثانية. وحفظُ ما اختير
  // مرّةً بالخطأ يجعله يتلقّى أخبار مدنٍ لا يقصدها ولا يعرف من أين جاءته.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  /** تبديل العرض يُعيد القارئ إلى أوّله.
   *
   *  الخريطة كانت «لا تعمل»: تُركَّب وتُحمّل بلاطاتها وتُرسم علاماتها
   *  الثماني — وأعلاها عند 271 بكسلاً **فوق** الشاشة، لأن الصفحة تحتفظ
   *  بموضع تمريرها من قائمةٍ طويلة. فيضغط المستخدم «خريطة» فيجدها فوق
   *  رأسه لا أمامه، ويظنّها معطّلة.
   *
   *  والتمرير في أثرٍ بعد الرسم، لا في معالج الضغط: القائمة نحو 2400 بكسل
   *  والخريطة 487، فارتفاع الصفحة ينهار في اللحظة نفسها. وتمريرٌ سلس يبدأ
   *  قبل الانهيار يُقصّ في منتصفه — قِسته: انتهى عند 695 لا عند الصفر.
   *  فوريّاً وبعد أن يستقرّ الارتفاع. */
  const { choice } = useAlertChoice();

  // مصدرُ النطاق الواحد. كان يُقرأ من ثلاثة مواضع تتقاطع — الاشتراك المحفوظ،
  // وزرّ «كل الأنبار»، وحقل المدينة في الفلاتر — وكل جزء من الصفحة يقرأ
  // توليفةً مختلفة منها. وهي الآلة التي أنتجت كل تناقضٍ في هذه الصفحة.
  const myCities = useMemo(
    () => (picked?.length ? picked : choice?.cities?.length ? choice.cities : null),
    [picked, choice]
  );

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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view, origin]);

  const { announcements, reload: reloadAnnouncements } = useOpenAnnouncements();
  // العدّادان انتقلا إلى الشريط السفلي، ومعهما نداء useSiteStats.
  //
  // وبقاؤه هنا بعد انتقالهما لم يكن حشواً بل عطلاً: الخطّاف يفتح قناة وقتٍ
  // حقيقي باسمٍ ثابت (visit-counter)، فنداءان يفتحان القناة نفسها مرّتين —
  // «cannot add postgres_changes callbacks after subscribe()». ولا رقم
  // يتحدّث بعدها. نداءٌ واحد، في المكان الذي يعرض الرقم.
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

  /** «أقرب محطة» — والفشل يُقال ولا يُبتلع.
   *
   *  كان معالج الخطأ فارغاً: من رفض الإذن أو تعذّر تحديد موقعه يضغط الزرّ
   *  فلا يحدث شيء — لا ترتيب يتغيّر ولا كلمة تُقال. فيضغط ثانيةً وثالثة
   *  ويظنّ التطبيق معطّلاً. */
  function locate() {
    if (!navigator.geolocation) {
      setFollowNote('هذا المتصفّح لا يستطيع تحديد موقعك. استعمل قائمة المدن بدلاً منه.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setFollowNote(null);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setFollowNote(
          err.code === err.PERMISSION_DENIED
            ? 'إذن الموقع مرفوض لهذا الموقع. فعّله من إعدادات المتصفّح، أو اختر مدينتك من الشريط الأخضر في الأعلى.'
            : 'تعذّر تحديد موقعك الآن. جرّب ثانيةً، أو اختر مدينتك من الشريط الأخضر في الأعلى.'
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
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
    const mine = myCities;
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

    // والمسافة تسبق كل شيء متى عُرف الموقع.
    //
    // كانت rows تُرتَّب بالمسافة أعلاه ثم يُعاد فرزها هنا بالمتابَعة ثم
    // القابلية للتنفيذ — والفرز مستقرّ، فتبقى المسافة داخل كل مجموعة وحدها.
    // أي أن محطةً متابَعة على بعد خمسين كيلومتراً تسبق أقربَ محطةٍ إليك،
    // ومن ضغط «أقرب محطة» يرى ترتيباً لا علاقة له بالقُرب.
    //
    // فمتى ضغط الزرّ صراحةً، القُرب هو السؤال — والباقي تفاضلٌ عند التساوي.
    return [...rows].sort(
      (a, b) =>
        (origin ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0) ||
        Number(isFollowed(b.id)) - Number(isFollowed(a.id)) ||
        Number(actionable(b)) - Number(actionable(a))
    );
  }, [stations, origin, filters, query, isFollowed, myCities, showAll]);

  // كم محطة تُخفيها التصفية — الرقم نفسه الذي يظهر على الزرّ.
  const hiddenElsewhere = useMemo(() => {
    const mine = myCities;
    if (!mine || showAll || filters.city) return 0;
    return (stations ?? []).filter((s) => !mine.includes(s.city)).length;
  }, [stations, myCities, showAll, filters.city]);

  // ما يُعرض الآن، لا ما سيحدث عند الضغط.
  //
  // ولا يظهر أصلاً لمن لا اشتراك له أو لمن لا محطات خارج مدنه: زرٌّ لا يغيّر
  // شيئاً هو أثاثٌ يُشغل مكاناً ويُعلَّم أنه بلا فائدة.
  const scopeLabel = useMemo(() => {
    const mine = myCities;
    if (!mine || filters.city) return null;
    if (showAll) return 'محطات كل الأنبار';
    if (!hiddenElsewhere) return null;
    // الأسماء صريحة: «محطات الرمادي، الفلوجة» أوضح من «محطات مدني (2)» —
    // القارئ يرى نطاقه بلا أن يفتح إعداداته ليتذكّره.
    return `محطات ${mine.join('، ')}`;
  }, [myCities, choice, showAll, filters.city, hiddenElsewhere]);

  // كم محطة يجدها البحث نفسه خارج مدنه.
  //
  // لوحة المنتجات تعدّ الأنبار كلها، والقائمة تحتها مقصورة على مدنه. فيقرأ
  // «بانزين محسن ١» ثم «لا توجد محطة» — رقمان صحيحان يتناقضان في عين القارئ،
  // لأن أحدهما لا يقول نطاقه. فالحالة الفارغة تقول السبب وتفتح الباب.
  const elsewhereMatching = useMemo(() => {
    const mineCities = myCities;
    if (!stations || !mineCities || showAll || filters.city) return 0;
    const q = query.trim();
    return stations.filter((s) => {
      if (mineCities.includes(s.city)) return false;
      if (filters.openOnly && !isOpenNow(s)) return false;
      if (filters.kind && s.kind !== filters.kind) return false;
      if (filters.availableOnly && !s.products.some((p) => isOffered(s, p))) return false;
      if (
        filters.product &&
        !s.products.some(
          (p) =>
            p.product === filters.product &&
            (filters.availableOnly ? isOffered(s, p) : isOffered(s, p) || !!p.expected_at)
        )
      )
        return false;
      if (q && !(s.name.includes(q) || s.address.includes(q) || s.city.includes(q))) return false;
      return true;
    }).length;
  }, [stations, myCities, showAll, filters, query]);

  // أنواع المنتجات بأعدادها داخل النطاق — تُعرض في ورقة المدن، فمن فتحها
  // يبحث عن شيء وأقصر طريقٍ إليه أن يضغط نوعه مباشرةً.
  const productCounts = useMemo(() => {
    const m = new Map<FuelProduct, number>();
    for (const s of visible ?? []) {
      for (const pr of s.products) if (isOffered(s, pr)) m.set(pr.product, (m.get(pr.product) ?? 0) + 1);
    }
    return [...m.entries()].map(([product, n]) => ({ product, n }));
  }, [visible]);

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
          <ScopeBar
            homeCities={choice?.cities?.length ? choice.cities : null}
            picked={picked}
            allAnbar={showAll}
            onChange={(next, all) => {
              setPicked(next);
              setShowAll(all);
            }}
            cityCounts={cityCounts}
            total={visible?.length ?? 0}
            productCounts={productCounts}
            activeProduct={filters.product}
            onPickProduct={(p) => setFilters({ ...filters, product: p })}
          />

          {/* إسنادٌ ساكن لا شريطٌ يتبدّل كل ثلاث ثوانٍ.
            *
            *  المؤقّت كان يُجبر الصفحة كلها على إعادة الرسم عشرين مرّة في
            *  الدقيقة والمستخدم لم يلمس شيئاً — وعند 119 بطاقة يصير تلعثماً
            *  محسوساً على أندرويد المتوسط، وهو ثلثا أجهزتنا. والنصّ نفسه كان
            *  يفوت نصف القرّاء: من نظر في الثانية الخطأ لم يره قطّ.
            *
            *  والجملة تبقى لأنها تحمي المنصّة من لومٍ ليس لها: القارئ يظنّها
            *  هي التي تُحصي المحطات وتتفقّدها، فإن وجد خبراً قديماً لامها. */}
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-white/15 px-3 py-2 text-[11px] leading-relaxed text-white">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>توفّر المنتجات وتحديثها لحظةً بلحظة من إدارة المحطة نفسها</b> — والمنصّة تنقل
              ما تُعلنه، ومعه وقتُه.
            </span>
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
        </div>
      </header>

      {/* الفسحة أسفل المحتوى تُحسب لا تُقدَّر: الشريط السفلي 94 بكسل
          (أزرارٌ وشريطٌ متحرك)، وقرص «أقرب محطة» يرتفع فوقه 11 بكسلاً
          بهالته، وتحته منطقة الهاتف الآمنة. فالحساب ثلاثة لا واحد.
          وpb-24 كانت تترك بكسلين، ثم تركت 7rem سبعةً — فجلس القرص على
          سطر «فكرة وتنفيذ وبرمجة أحمد الرفاعي» وقطعه من وسطه. */}
      <main
        className="mx-auto max-w-md px-4 pt-4"
        style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))' }}
      >
        <TripAsk stations={stations} />
        {/* لوحة المنتجات والشريط الترويجي للقائمة وحدها.
            في وضع الخريطة كانا يدفعانها 424 بكسلاً لأسفل، فلا يظهر منها
            إلا ثلاثة أرباعها — والخريطة تُفتح لتُرى كاملة. */}
        {stations && view === 'list' && (
          <div className="mb-4">
            {/* onPickAnnounced: منتجٌ لا محطة مسجّلة له — الضغط يقود إلى خبره
                لا إلى قائمة فارغة. وبمعرّفٍ في DOM لا بمرجع React، لأن اللوحة
                تُركَّب داخل فرعٍ شرطيّ آخر فقد يكون المرجع فارغاً لحظة الضغط.

                والتعليق هنا لا بين الخصائص: تعليقٌ داخل وسم JSX يبتلع الخاصّية
                التي تليه صامتاً — تُمرَّر undefined، ويصير `?.()` لا شيء، ولا
                خطأ في أي مكان. ضاع في تتبّعه وقتٌ يستحقّ هذا السطر. */}
            {/* announced بلا تصفية مدن — كالأرقام التي بجانبها.
             *
             *  كانت الشارة تُحسب من مدن الجهاز والأرقام من الأنبار كلها، فصار
             *  رقمان متجاوران بمقياسين. ولكل جهاز اختيارٌ في تخزينه: ظهرت «+٢»
             *  على الويب و«+١» على آيفون ولا شيء على أندرويد — ثلاثتها صحيحة
             *  بمقياسها، وثلاثتها تبدو عطلاً.
             *
             *  والوحدة أهمّ من الدقّة هنا: رقمٌ يختلف بين جهازين يُفقد الثقة بكل
             *  رقم آخر، ولو كان كلٌّ منهما صادقاً في سياقه. */}
            <ProductsDashboard
              scopeLabel={scopeLabel ?? undefined}
              stations={visible ?? stations}
              filter={filters.product}
              onPick={(product) => setFilters({ ...filters, product })}
              announced={announcements}
              onPickAnnounced={() => {
                // الشارة تعدّ الأنبار كلها، فالضغطة توسّع النطاق لتفي بما وعدت.
                if (announcements.some((a) => !forCities([a], choice?.cities).length)) {
                  setShowAll(true);
                }
                document
                  .getElementById(UNREGISTERED_BOARD_ID)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              }
            />
          </div>
        )}

        {/* التنبيه فوق القائمة لا تحتها.
          *
          *  كان أسفل القائمة كلها. ورسالةُ «إذن الموقع مرفوض» تلي ضغطةً على
          *  زرٍّ في الشريط السفلي — والقارئ ينظر إلى أعلى الشاشة بعدها، لا
          *  إلى ما بعد أربعٍ وأربعين بطاقة. جوابٌ لا يُرى ليس جواباً. */}
        {followNote && (
          <p
            role="status"
            className="mb-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
          >
            {followNote}
          </p>
        )}

        {view === 'list' && (
          <div className="mb-3">
            <PromoStrip />
          </div>
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
                <UnregisteredBoard rows={announcements} onVoted={reloadAnnouncements} showAll={showAll} />
                {/* وما أُشّر عليه يُقاطِع مرةً واحدة — واللوحة تبقى سجلّه بعدها. */}
                <AvailabilityPopup rows={announcements} showAll={showAll} />
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
                          ? elsewhereMatching > 0
                            ? `لا توجد محطة يتوفر فيها ${PRODUCT_LABELS[filters.product]} في مدنك`
                            : `لا توجد محطة يتوفر فيها ${PRODUCT_LABELS[filters.product]} حالياً`
                          : 'لا توجد محطات متاحة الآن'}
                    </p>
                  )}
                  {/* السببُ ثم الباب.
                    *
                    *  «لا توجد محطة» وحدها تُقرأ نفياً عن الأنبار كلها، بينما
                    *  اللوحة فوقها تقول «١». فالرقم لا يكذب والقائمة لا تكذب —
                    *  والناقص أن يقول أحدهما نطاقه. */}
                  {elsewhereMatching > 0 && (
                    <>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        ما تراه هنا محطات مدنك وحدها. وثمّة{' '}
                        <b className="text-brand">{elsewhereMatching}</b> في مدن أخرى من الأنبار.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="btn-primary mt-3 px-6"
                      >
                        اعرض كل الأنبار
                      </button>
                    </>
                  )}

                  {(countActive(filters) > 0 || query) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilters(EMPTY_FILTERS);
                        setQuery('');
                      }}
                      className="btn-ghost mt-3 px-6"
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
        <SiteFooter />
      </main>

      {/* خمسة أزرار في متناول الإبهام، والشريط المتحرك تحتها. وما كان يحتلّ
          أعلى الشاشة — العدّادان والتنقّل والبحث — صار هنا، فلا يكلّف الشاشة
          الأولى بكسلاً واحداً ولا يُحذف. */}
      <BottomDock
        view={view}
        near={!!origin}
        stationCount={visible?.length ?? 0}
        onList={() => {
          setOrigin(null);
          setView('list');
        }}
        onMap={() => {
          setOrigin(null);
          setView('map');
        }}
        onNear={locate}
        onSearch={() => setSearchOpen(true)}
        onAccount={() => router.push('/alerts')}
        stations={stations ?? []}
      />

      <Sheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="بحث وفلاتر"
        hint="البحث بالاسم يشمل الأنبار كلها — لا يحبسه اختيار المدينة."
      >
        {/* بلا شرائح مدن: المدينة تُختار من شريط النطاق وحده. ومصدرُ حقيقةٍ
            ثانٍ لسؤالٍ واحد هو تعريف التناقض — وقد كلّفنا ما كلّفنا. */}
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          filters={filters}
          onFiltersChange={setFilters}
          cityCounts={EMPTY_CITY_COUNTS}
          defaultOpen
        />
      </Sheet>

      {ready && !signedIn && <FirstRun />}
      <InstallPrompt />
      <SplashScreen ready={stations !== null || failed} />
    </>
  );
}
