'use client';

import { StaleBanner } from '@/components/StaleBanner';
import { StoryStrip } from '@/components/StoryStrip';
import { PlateTurn } from '@/components/PlateTurn';
import { RATION } from '@/lib/ration';
import { STATUS_RECHECK } from '@/lib/status';
import { readFailure, withDeadline } from '@/lib/fn';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { distanceKm, loadCachedStations, loadStations } from '@/lib/stations';
import { useNativeApp } from '@/lib/useNativeApp';
import { homeFor, useSession } from '@/lib/useSession';
import { playAlert, unlockAudio } from '@/lib/alertSound';
import { SoundToggle } from '@/components/SoundToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { SideMenu } from '@/components/SideMenu';
import { isFresh, isOpenNow } from '@/lib/hours';
import { PRODUCT_LABELS, PRODUCT_ORDER, expectedText, isExpectedLate, isOffered, listTier } from '@/lib/products';
import { plural } from '@/lib/freshness';
import { CITY_NAMES } from '@/lib/cities';
import { StationCard } from '@/components/StationCard';
import { PromoStrip } from '@/components/PromoStrip';
import { AlertsPrompt } from '@/components/AlertsPrompt';
import { useAlertChoice, useFollowedStations } from '@/lib/alerts';
import { TripAsk } from '@/components/TripAsk';
import { UnregisteredBoard } from '@/components/UnregisteredBoard';
import { AvailabilityPopup } from '@/components/AvailabilityPopup';
import { useOpenAnnouncements } from '@/lib/announcements';

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
/** مفتاحُ «كل الأنبار» المحفوظ على الجهاز. */
const SCOPE_ALL = 'scope-all';
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
  /** ساعةُ وصول ما هو معروضٌ الآن — تُملأ حين يسقط الاتصال ويبقى المعروض قديماً.
   *  و`null` تعني «حيّ»، فلا يظهر الشريط في الحال الطبيعيّة. */
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const [staleWhy, setStaleWhy] = useState<string | null>(null);
  /** يُقرآن داخل ردٍّ أُنشئ مرّةً مع الأثر، فقراءةُ الحالة هناك تُرجع قيمةَ
   *  أوّل رسمٍ إلى الأبد. */
  const failedRef = useRef(false);
  failedRef.current = failed;
  const refreshRef = useRef<() => void>(() => {});
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // «كل الأنبار» يُحفظ على الجهاز — الإشعاراتُ تبقى على مدينته المحفوظة.
  //
  // كان لحظيّاً: «طلبتُ أن يعرض لي كلَّ محطات الأنبار، وعندما أدخل تظهر فقط
  // المدينةُ الأساسية!» — صاحبُ المنصّة. فمن اختار المحافظةَ كلَّها يجدها حين
  // يعود، ومن عاد إلى مدينةٍ بعينها يُمحى الاختيار. أمّا المدنُ المضافة
  // للجلسة (`picked`) فتبقى لحظيّة كما هي.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(SCOPE_ALL) === '1') setShowAll(true);
    } catch {
      /* تصفّحٌ خاصّ */
    }
  }, []);
  // مدنٌ تُختار للحظتها ولا تُحفظ.
  //
  // 70% من المشتركين اختاروا مدينةً واحدة، وهي وحدها ما يُحفظ ويُبنى عليه
  // الإشعار. ومن أراد أن يرى مدينةً ثانية اليوم — مسافراً أو سائلاً لأخيه —
  // يضيفها هنا، ويعود التطبيق إلى مدينته حين يُفتح ثانية. وحفظُ ما اختير
  // مرّةً بالخطأ يجعله يتلقّى أخبار مدنٍ لا يقصدها ولا يعرف من أين جاءته.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** «اعرض المحطات التي لا وقود لديها» — لحظيّ لا محفوظ. */
  const [showRest, setShowRest] = useState(false);
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
  const { signedIn, role, branch, ready } = useSession();

  // Send an owner or admin to their panel on open. Only once, and never when
  // they asked for the visitor view — a redirect they cannot escape is worse
  // than the wrong landing page.
  useEffect(() => {
    if (!signedIn) return;
    if (new URLSearchParams(window.location.search).has('view')) return;
    const target = homeFor(role, branch);
    if (target) router.replace(target);
  }, [signedIn, role, router]);

  // ── ولا قائمةَ لمن معه جلسة ──────────────────────────────────────────────
  //
  // التحويلُ أعلاه يقع بعد الرسم، فكان صاحبُ المحطة يرى القائمةَ العامّة —
  // «من أعلن ومن لم يُعلن» — ريثما تُحسم `role` من نداء `profiles`. وقد لاحظه
  // صاحبُ المنصّة. فمن يحمل جلسةً محفوظة (مفتاحُها في localStorage، قراءةٌ
  // متزامنة) ولم يطلب عرضَ الزائر بـ?view تُعرض له دوّارةٌ حتى تُحسم.
  //
  // `useSyncExternalStore` لا `useState`: لقطةُ الخادم `false` تطابق التصديرَ
  // الساكن فلا يختلف الترطيبُ، ولقطةُ العميل تُقرأ بعده مباشرة. والزائرُ بلا
  // مفتاحٍ لا ينتظر شيئاً — وهو أربعةَ عشرَ ألفاً.
  const holding = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return (
          !!localStorage.getItem('muhta-auth') &&
          !new URLSearchParams(window.location.search).has('view')
        );
      } catch {
        return false;
      }
    },
    () => false
  );

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
    // آخرُ لحظةٍ وصلت فيها بياناتٌ حيّة. في ref لا في state: تُقرأ داخل مُعالِج
    // الفشل الذي أُنشئ مرّةً واحدةً مع التأثير، فقراءةُ state هناك تُرجع قيمةَ
    // أوّل رسمٍ إلى الأبد.
    const okAt = { current: null as string | null };
    // **وساعةٌ ثانيةٌ للمحاولة لا للنجاح.** `okAt` تُكتب في فرع النجاح وحدَه،
    // فهي المقياسُ الصحيح لِما يُعرض للناس («البيانات من قبل ساعة») والمقياسُ
    // الخاطئُ تماماً لكبح الطلبات: يومَ تسقط القاعدةُ لا نجاحَ يقع، فتبقى
    // صفراً، فيمرّ كلُّ كبحٍ مبنيٍّ عليها. انظر `.subscribe` أدناه.
    const triedAt = { current: 0 };

    const refresh = () => (
      (triedAt.current = Date.now()),
      withDeadline(loadStations(), 15000)
        .then((rows) => {
          setStations(rows);
          setFailed(false);
          setStaleAt(null);
          setStaleWhy(null);
          okAt.current = new Date().toISOString();
        })
        .catch((e) => {
          setFailed(true);
          // **والسببُ يُحفظ لا يُبتلع.** كان `catch` فارغاً، فيقرأ صاحبُ الجهاز
          // «الاتصال منقطع» سواءٌ انتهت المهلةُ أم رُفض المفتاحُ أم سقطت
          // الشبكة — ثلاثةُ أسبابٍ بجملةٍ واحدة، ولا سبيلَ إلى تمييزها من صورةِ
          // شاشة. و`readFailure` تفصل البطءَ عن الانقطاع بلفظين.
          setStaleWhy(readFailure(e));
          // ربّما ليست شبكةً بل صيانةٌ بدأت والتبويبُ مفتوح — تُسأل مرّةً.
          window.dispatchEvent(new Event(STATUS_RECHECK));
          // **وهنا كان الصمت.** الشرطُ في الأسفل كان يعرض بطاقةَ الخطأ حين
          // `stations === null` وحدَها، فسقوطُ الشبكة بعد تحميلٍ ناجح لم يكن
          // يعرض شيئاً: لا خطأ ولا مغزل، والأرقامُ القديمة تُقرأ حاضرة.
          if (okAt.current) {
            setStaleAt(okAt.current);
            return;
          }
          // ولم يصل شيءٌ قطّ في هذه الجلسة: تُعرض آخرُ لقطةٍ في الجهاز إن
          // وُجدت — معلومةٌ مؤرَّخةٌ خيرٌ من شاشةٍ فارغة.
          const snap = loadCachedStations();
          if (snap) {
            setStations(snap.rows);
            setStaleAt(snap.at);
          }
        })
    );

    refresh();

    // ── والحدثُ لا يجرّ جلباً فوريّاً ──────────────────────────────────────
    //
    // **صوتٌ واحدٌ كان يكلّف مئتَي طلب.** الأحداثُ الثلاثة تحت كانت تنادي
    // `refresh` مباشرةً، و`refresh` أربعةُ استعلاماتٍ ثقيلة. فتصويتُ مستخدمٍ
    // واحدٍ على الازدحام = حدثٌ واحد × ٤٩ جهازاً مفتوحاً × ٤ = ١٩٦ طلباً
    // وأربعةُ ميغابايت، من لمسةٍ واحدة.
    //
    // وأسوأُ منه: `confirmAvailability` في لوحة المحطة تكتب صفوفَ المنتجات
    // السبعةَ بجملةٍ واحدة، ويُخرجها السجلُّ سبعةَ أحداثٍ منفصلة — ١٬٣٧٢ طلباً
    // من ضغطةِ «تأكيد» واحدة.
    //
    // فمهلةٌ لاحقةٌ بثانيتين تجمع الرشقةَ كلَّها في جلبةٍ واحدة: السبعةُ تصير
    // واحداً. والثانيتان لا تُقرآن تأخيراً — الحدثُ نفسُه يقطع الشبكةَ في
    // مئاتِ الأجزاء أصلاً، والجلبُ بعده نصفَ ثانية.
    // أقصى قِدَمٍ يُحتمل على جهازٍ سقطت قناتُه الحيّة — انظر `.subscribe` أدناه.
    const DEAF_POLL_MS = 120_000;

    let bumpTimer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(bumpTimer);
      bumpTimer = setTimeout(refresh, 2000);
    };

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
          // والصوتُ فوريّ والجلبُ مؤجَّل: الأذنُ تسمع لحظتَها، والرقمُ يلحق.
          bump();
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'traffic_votes' }, bump)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stations' }, bump)
      // ── الزناد ─────────────────────────────────────────────────────────
      //
      // **بدونه لا يُعلن الانقطاعُ أبداً.** `refresh` تُنادى مرّةً عند الفتح،
      // ثمّ من أحداث هذه القناة وحدَها — وهي بعينها ما ينقطع حين ينقطع النت.
      // فتبقى `failed` كاذبةً واللوحةُ قديمةً بلا قول، وهي الحالُ التي وُضع
      // لها الشريطُ أصلاً.
      //
      // والقناةُ تعرف قبل الصفحة: نبضُها يكشف الموتَ خلال ثلاثين ثانيةً إلى
      // ستّين، ويكشف العودةَ كذلك — فيزول الشريطُ وحدَه بلا لمسة.
      //
      // ── والفشلُ لا يُجلَب عليه ────────────────────────────────────────
      //
      // كان فرعُ `CHANNEL_ERROR` ينادي `refresh` — وحارسُه `failedRef` لا
      // يمنع شيئاً: الجلبُ ينجح (الشبكةُ حيّة، القناةُ وحدَها ميّتة) فتعود
      // `failed` كاذبةً، فيُجلب في الدورة التالية، وهكذا بلا نهاية.
      //
      // وإعادةُ الاشتراك تتراجع إلى عشر ثوانٍ سقفاً، أي ستُّ محاولاتٍ في
      // الدقيقة: ٦ × ٤ = ٢٤ طلباً في الدقيقة من هاتفٍ واحدٍ ساكنٍ على الشاشة.
      // وقياسُ اليوم أنّ ٩٢٪ من نداءات Realtime تفشل — أي أنّ أكثرَ الأجهزة
      // كانت في هذه الحلقة: ٤٩ جهازاً × ٢٤ = ١٬١٧٦ طلباً في الدقيقة، سبعون
      // ألفاً في الساعة. وقياسُ البوّابة ٤٤٬٤٢٥ طلباً في الساعة.
      //
      // **لكنّ حذفَه بالكلّيّة خطأٌ آخر، وقد أُدخل ثمّ صُحّح في اليوم نفسِه.**
      // القناةُ حين تسقط هي **الشيءُ الوحيد** الذي يُحدّث الصفحة؛ فبلا جلبٍ
      // هنا يبقى الجهازُ على أوّل ما حمّل، بلا شريطٍ ولا خطأ — لأنّ الجلبَ لم
      // يفشل، بل لم يقع. وصلت لقطتان لنفس العنوان في الدقيقة نفسِها: واحدةٌ
      // تقول «٢ كاز» والقاعدةُ فيها إحدى عشرةَ محطةَ كاز حديثة.
      //
      // فالحدُّ لا الحذف: جلبةٌ واحدةٌ كلَّ دقيقتين على الأكثر. أي نصفُ طلبٍ
      // في الدقيقة بدل أربعةٍ وعشرين — ثمانيةٌ وأربعون ضعفاً أقلّ — والبياناتُ
      // تبقى حيّةً على جهازٍ لا تعمل قناتُه. وهو حالُ أكثر الأجهزة اليوم.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && failedRef.current) {
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // **بآخر محاولةٍ لا بآخر نجاح.** كُتب هذا أوّلاً على `okAt`، وهو
          // كبحٌ يعمل وقتَ الصحّة ويتوقّف وقتَ المرض: يومَ سقطت القاعدةُ في
          // ٢٠٢٦-٠٩-٠٨ لم تنجح جلبةٌ واحدة، فبقيت `okAt` فارغةً، فمرّ الشرطُ
          // في كلّ حدث — وأحداثُ CHANNEL_ERROR تتوالى مع تراجعِ إعادة
          // الاشتراك حتى عشر ثوانٍ سقفاً، أي ستٌّ في الدقيقة × أربعةِ
          // استعلامات = أربعةٌ وعشرون طلباً في الدقيقة من الجهاز الواحد،
          // **وقتَ العطل بالذات**. حلقةٌ موجبة: القاعدةُ تبطئ فتسقط القنوات،
          // فتقصف الأجهزةُ، فتبطئ أكثر.
          if (Date.now() - triedAt.current >= DEAF_POLL_MS) refresh();
        }
      });

    refreshRef.current = refresh;

    // والهاتفُ الذي كان في الجيب طوالَ القطع: العودةُ إلى الصفحة تسأل من جديد.
    //
    // **إلا أن تكون سألت قبل دقيقة.** من يقف في طابور الوقود يخرج إلى واتساب
    // ويعود، خمسَ مرّاتٍ في دقائق — وكانت كلُّ عودةٍ أربعةَ استعلاماتٍ و٨٨
    // كيلوبايت عن بياناتٍ لم تتغيّر. والقناةُ الحيّةُ تُبلغ التغيّرَ أصلاً،
    // فهذه لاستدراكِ ما فات لا لتكرارِ ما وصل.
    const REVISIT_FLOOR_MS = 60_000;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // وبالمحاولة كذلك: بالنجاح وحدَه كانت كلُّ عودةٍ إلى التبويب تجلب من
      // جديد ما دامت الجلبةُ تفشل — وهو ما يفعله من ينتظر عودةَ الخدمة.
      if (Date.now() - triedAt.current < REVISIT_FLOOR_MS) return;
      refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(bumpTimer);
      document.removeEventListener('visibilitychange', onVisible);
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
  // مرّةً واحدة عند الإقلاع، لا كلّما تغيّر origin.
  //
  // كانت التبعية [origin]، و«قائمة» و«خريطة» تضبطان origin = null —
  // فيُعاد إطلاق الأثر فوراً ويُعيد ضبطه لمن أذن سابقاً. أي أن الخروج من
  // وضع القُرب يرتدّ إليه، والقرص الأخضر يبقى مضيئاً بلا ضغطة.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ــ النطاق: كلُّ التصفيات إلا المنتج ــــــــــــــــــــــــــــــــــــ
   *
   *  **ولماذا المنتجُ وحدَه خارجٌ منها.** كانت تصفيةُ المنتج داخل هذه القائمة،
   *  ولوحةُ المنتجات فوقها تعدّ من نتيجتها — فكان الرقمُ يعدّ داخلَ تصفيةِ
   *  نفسِه. أي أنّ ضغطَ «كاز» يجعل رقمَ «بانزين عادي» يعني «المحطاتُ التي فيها
   *  كازٌ **وفيها** عاديّ» لا «المحطاتُ التي فيها عاديّ».
   *
   *  فيتغيّر رقمُ المنتج بضغطةٍ على منتجٍ آخر، وهو ما وصلت به لقطتان: «١٠ كاز ·
   *  ١ عادي» و«٢ كاز · ٢ عادي» في اللحظة نفسِها وللنطاق نفسِه — والقاعدةُ
   *  قِيست في تلك الدقيقة: إحدى عشرةَ محطةَ كازٍ حديثة وثلاثُ محطاتِ عاديّ.
   *
   *  وأداةُ تصفيةٍ لا تُصفّي خياراتِها: الرقمُ يقول ماذا **سيجد** الضاغط، فإن
   *  تغيّر بضغطةٍ صار وعداً يُخلَف. فالعدُّ من النطاق، والقائمةُ من التصفية. */
  const inScope = useMemo(() => {
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
    // وتُلغى في وضع القُرب: من ضغط «أقرب محطة» يسأل عن المسافة لا عن
    // المدينة. وأقربُ محطةٍ إليه قد تكون في الخالدية وهو مشترك بالرمادي
    // وبينهما ربع ساعة — فحذفُها قبل الفرز يجعل الزرّ يكذب باسمه.
    if (mine && !showAll && !filters.city && !origin)
      rows = rows.filter((s) => mine.includes(s.city));

    if (filters.openOnly) rows = rows.filter(isOpenNow);
    if (filters.city) rows = rows.filter((s) => s.city === filters.city);
    if (filters.kind) rows = rows.filter((s) => s.kind === filters.kind);
    if (filters.availableOnly) {
      rows = rows.filter(
        (s) => s.products.some((p) => isOffered(s, p))
      );
    }
    const q = query.trim();
    if (q) rows = rows.filter((s) => s.name.includes(q) || s.address.includes(q) || s.city.includes(q));

    // والمسافة تسبق كل شيء متى عُرف الموقع.
    //
    // كانت rows تُرتَّب بالمسافة أعلاه ثم يُعاد فرزها هنا بالمتابَعة ثم
    // القابلية للتنفيذ — والفرز مستقرّ، فتبقى المسافة داخل كل مجموعة وحدها.
    // أي أن محطةً متابَعة على بعد خمسين كيلومتراً تسبق أقربَ محطةٍ إليك،
    // ومن ضغط «أقرب محطة» يرى ترتيباً لا علاقة له بالقُرب.
    //
    // فمتى ضغط الزرّ صراحةً، القُرب هو السؤال — والباقي تفاضلٌ عند التساوي.
    //
    // وفرزُ التوفّر ليس هنا: الطبقاتُ (`tiers` أدناه) تفصل الآن عن المتوقّع
    // عن الباقي، والفرزُ مستقرّ فيبقى ترتيبُ المسافة داخل كلّ طبقة.
    return [...rows].sort(
      (a, b) =>
        (origin ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0) ||
        Number(isFollowed(b.id)) - Number(isFollowed(a.id))
    );
  }, [stations, origin, filters, query, isFollowed, myCities, showAll]);

  /** والقائمة: النطاقُ مصفّى بالمنتج المضغوط. الفرزُ مستقرّ، فالتصفيةُ بعده
   *  لا تُغيّر ترتيبَ ما بقي. */
  const visible = useMemo(() => {
    if (!inScope) return null;
    const want = filters.product;
    if (!want) return inScope;
    return inScope.filter((s) =>
      s.products.some(
        (p) =>
          p.product === want &&
          (filters.availableOnly ? isOffered(s, p) : isOffered(s, p) || !!p.expected_at)
      )
    );
  }, [inScope, filters.product, filters.availableOnly]);

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
      // ما سيصل مطويّاً خلف «بلا وقودٍ الآن» ليس وعداً يُقطع بزرّ «اعرض كل الأنبار».
      if (listTier(s, filters.product) === 'rest') return false;
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
    // من النطاق لا من القائمة — وإلا عدّ المنتجُ داخل تصفيةِ نفسِه. انظر `inScope`.
    for (const s of inScope ?? []) {
      for (const pr of s.products) if (isOffered(s, pr)) m.set(pr.product, (m.get(pr.product) ?? 0) + 1);
    }
    // بترتيب المنتجات الثابت لا بترتيب المحطات — أزرارُ الرأس لا تتقافز.
    return [...m.entries()]
      .map(([product, n]) => ({ product, n }))
      .sort((a, b) => PRODUCT_ORDER.indexOf(a.product) - PRODUCT_ORDER.indexOf(b.product));
  }, [inScope]);

  /** ــ ثلاثُ طبقات: الآن · متوقّع · الباقي ـــــــــــــــــــــــــــــــــ
   *
   *  «لماذا تظهر هذه المحطاتُ وهي لا تخدم المستخدم؟ أظهر المحطاتِ التي فيها
   *  منتجٌ فقط، والمتوقّعةُ جِد لها طريقةً مناسبة» — صاحبُ المنصّة، ١٢ أيلول.
   *
   *  وقبلَها كانت «تُفرز ولا تُخفى»: اتّصل صاحبُ محطةٍ فقال «نحن نُجبر على وضع
   *  كلمة متوقع غداً» لأنّ الفارغةَ كانت تسقط. فالجوابُ ليس الحذفَ ولا العرضَ
   *  كلَّه: الطبقةُ الثالثة تُطوى خلف زرٍّ يعدّها ويفتحها، والخريطةُ والبحثُ
   *  يبلغانها — والبطاقةُ الكاملة تعود لحظةَ يُحدَّث شيء. والوعدُ الفائت لا
   *  يُكافأ بصفٍّ في «متوقّع» (`isExpectedLate`) وإلّا صار الشريطُ مكانَ الكذبة.
   *
   *  والمفضّلةُ بطاقةٌ دائماً في الأعلى ولا تُعدّ في `stocked`. والفرزُ مستقرّ
   *  فترتيبُ المسافة والمتابَعة يبقى داخل كلّ طبقة. */
  const tiers = useMemo(() => {
    if (!visible) return null;
    const now: StationWithStatus[] = [];
    const expected: StationWithStatus[] = [];
    const rest: StationWithStatus[] = [];
    let stocked = 0;
    for (const s of visible) {
      const t = listTier(s, filters.product);
      if (t === 'now') stocked++;
      (t === 'now' || isFollowed(s.id) ? now : t === 'expected' ? expected : rest).push(s);
    }
    return { now, expected, rest, stocked };
  }, [visible, filters.product, isFollowed]);

  /** والعدُّ يُفصل عن العرض: يعدّ ما يُؤخذ الآن وحدَه — كلوحة المنتجات فوقه. */
  const stocked = tiers?.stocked ?? 0;

  const cityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations ?? []) m.set(s.city, (m.get(s.city) ?? 0) + 1);
    return m;
  }, [stations]);
  // وما فيها وقودٌ الآن لكلّ مدينة — رقمُ ورقة المدن، بمقياس الرأس والقائمة.
  const cityNow = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations ?? []) {
      if (s.products.some((p) => isOffered(s, p))) m.set(s.city, (m.get(s.city) ?? 0) + 1);
    }
    return m;
  }, [stations]);

  // بعد الخطّافات كلِّها. وتبقى الدوّارةُ حتى ينقلَه التحويلُ أعلاه — ومن
  // معه جلسةٌ ولا لوحةَ له (لا دورَ) ترى القائمةَ بعد الحسم كما كانت.
  if (holding && (!ready || (signedIn && homeFor(role, branch)))) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }

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
              try {
                if (all) localStorage.setItem(SCOPE_ALL, '1');
                else localStorage.removeItem(SCOPE_ALL);
              } catch {
                /* تصفّحٌ خاصّ */
              }
            }}
            cityCounts={cityCounts}
            cityNow={cityNow}
            total={stocked}
            productCounts={productCounts}
            activeProduct={filters.product}
            onPickProduct={(p) => setFilters({ ...filters, product: filters.product === p ? null : p })}
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
          {/* «ارفع الإعلاناتِ المتبدّلة بدل الإعلان في الأعلى» — صاحبُ المنصّة.
            *  فحلّت الشرائحُ الثلاث مكانَ سطر «توفّر المنتجات…». */}
          <div className="mt-2">
            <PromoStrip inHeader />
          </div>
          {/* Both of these speak to someone browsing the site. Inside the app
              they are dead weight: the download already happened, and the
              "coming soon" badge contradicts the app in their hand. */}
          {/* A signed-in admin or owner should reach their panel from the first
              screen, not by hunting through a drawer. */}
          {signedIn && (
            <a
              href={homeFor(role, branch) ?? '/owner'}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-brand-700"
            >
              {role === 'admin' ? (
                <>
                  <ShieldIcon className="h-4 w-4" />
                  فتح لوحة التحكم
                </>
              ) : branch ? (
                <>
                  <ShieldIcon className="h-4 w-4" />
                  العودة إلى لوحة الفرع
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
        {/* **أوّلُ شيءٍ في الصفحة، لا فوق القائمة وحدَها.** لوحةُ المنتجات
            تحته تقول «لا يتوفر أي منتج في المحطات المفتوحة الآن» — وهي محسوبةٌ
            من الصفوف القديمة نفسِها. فتحذيرٌ يأتي بعدها يصل بعد أن تكوّن
            الاعتقادُ الخاطئ. قِيس في المتصفّح: كان يقع تحتها فعلاً. */}
        {staleAt && stations && (
          <StaleBanner at={staleAt} why={staleWhy} onRetry={() => refreshRef.current()} />
        )}

        {/* «حالة المحطة» — حلقاتُ القصص قبل كلّ شيء: الخبرُ الطازج أوّلاً.
            اعتمدها صاحبُ المنصّة ١٢ أيلول ٢٠٢٦ بعد معاينةٍ للإدارة وحدَها. */}
        {stations && view === 'list' && <StoryStrip stations={stations} choice={choice} />}

        {/* الفرديُّ والزوجيّ — قرارٌ مؤقّت؛ تختفي البطاقةُ بإطفاء RATION.active.
            اعتمدها صاحبُ المنصّة ١٢ أيلول ٢٠٢٦ بعد معاينةٍ للإدارة وحدَها؛ وشرطُ
            الدور كان يُخفيها كلَّما تعثّرت قراءةُ profiles.role على الهاتف. */}
        {RATION.active && stations && view === 'list' && <PlateTurn stations={stations} choice={choice} />}

        <TripAsk stations={stations} />

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

          {tiers && tiers.now.length === 0 && tiers.expected.length === 0 && (
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
              {/* فاصلٌ بين كل بطاقتين، لا قبل الأولى.
                *
                *  «توهمتُ بالبطاقات»: تسعَ عشرة بطاقةً متشابهة الحوافّ،
                *  والفراغ وحده لا يفصلها. والتظليل المتناوب (tinted) كان
                *  يفعلها بلونٍ خفيف — لكنه يضيع على شاشةٍ في الشمس.
                *
                *  واللمعة تنطلق متدرّجةً بحسب الموضع فلا تومض تسعَ عشرة
                *  مرّةً معاً. والتأخير يدور على ثمانٍ حتى لا تتباعد أواخر
                *  القائمة عن أوائلها فتبدو ساكنة. */}
              {tiers!.now.map((station, i) => (
                <div key={station.id}>
                  {i > 0 && (
                    <div
                      className="card-sep mb-3"
                      aria-hidden="true"
                      style={{ '--sep-delay': `${(i % 8) * 0.45}s` } as React.CSSProperties}
                    />
                  )}
                  <StationCard
                    station={station}
                    tinted={i % 2 === 1}
                    isFavorite={isFollowed(station.id)}
                    onToggleFavorite={() => onStar(station.id)}
                  />
                </div>
              ))}

              {/* متوقّع — بطاقةٌ واحدة لا بطاقةٌ لكلّ وعد: الاسمُ وموعدُه، وضغطُه يفتحها. */}
              {tiers!.expected.length > 0 && (
                <section className="card p-3" aria-label="محطات متوقّع وصول الوقود إليها">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-brand-900">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">متوقّع</span>
                    يصلها الوقود لاحقاً
                  </h2>
                  <ul className="mt-1 divide-y divide-slate-100">
                    {tiers!.expected.map((s) => (
                      <li key={s.id}>
                        <a href={`/station/${s.id}`} className="flex min-h-[40px] items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 truncate text-[12.5px] font-bold text-brand-900">
                            {s.name} <span className="font-normal text-slate-400">· {s.city}</span>
                          </span>
                          <span className="flex shrink-0 flex-wrap justify-end gap-1">
                            {s.products
                              .filter(
                                (p) =>
                                  (!filters.product || p.product === filters.product) &&
                                  !!p.expected_at &&
                                  !isExpectedLate(p.expected_at)
                              )
                              .map((p) => (
                                <span key={p.product} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  {PRODUCT_LABELS[p.product]} · {expectedText(p)}
                                </span>
                              ))}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* الباقي مطويٌّ لا محذوف: زرٌّ يعدّه ويفتحه. */}
              {tiers!.rest.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showRest}
                  onClick={() => setShowRest((v) => !v)}
                  className="block w-full py-2 text-center text-[11.5px] font-bold text-slate-500"
                >
                  {showRest
                    ? 'أخفِ المحطات بلا وقودٍ الآن'
                    : `${plural(tiers!.rest.length, 'محطة أخرى', 'محطتان أخريان', 'محطات أخرى', 'محطة أخرى')} بلا وقودٍ الآن — اعرضها`}
                </button>
              )}
              {showRest &&
                tiers!.rest.map((station, i) => (
                  <div key={station.id}>
                    {i > 0 && <div className="card-sep mb-3" aria-hidden="true" />}
                    <StationCard
                      station={station}
                      tinted={i % 2 === 1}
                      isFavorite={isFollowed(station.id)}
                      onToggleFavorite={() => onStar(station.id)}
                    />
                  </div>
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
        stationCount={stocked}
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
