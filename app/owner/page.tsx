'use client';

import { readFailure } from '@/lib/fn';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { rebuildSite } from '@/lib/rebuild';
import { AudienceBanner, type Audience } from '@/components/AudienceBanner';
import { num } from '@/lib/num';
import { OwnerDeviceLink } from '@/components/OwnerDeviceLink';
import { cancelTrafficReminder, scheduleTrafficReminder } from '@/lib/trafficReminder';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  activeTrafficLevel,
  MANUAL_TRAFFIC_MINUTES,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  isAnnounceable,
  isListed,
  productTrafficLevel,
} from '@/lib/products';
import { ShareButton } from '@/components/ShareButton';
import { StationLinkCard } from '@/components/StationLinkCard';
import { StationPoster } from '@/components/StationPoster';
import { AvailabilityPoster } from '@/components/AvailabilityPoster';
import { ProductControl, type ProductState } from '@/components/ProductControl';
import { WorkingHours } from '@/components/WorkingHours';
import { OwnerReminders } from '@/components/OwnerReminders';
import { StationChat } from '@/components/StationChat';
import { JoinPoster } from '@/components/JoinPoster';
import { ChangePassword } from '@/components/ChangePassword';
import { FRESH_HOURS, WITHDRAW_HOURS, ageLabel, hasRunOut } from '@/lib/hours';
import { DeleteAccount } from '@/components/DeleteAccount';
import type { ExpectedPeriod } from '@/lib/hours';
import { FuelIcon, LockIcon, LogOutIcon, SpinnerIcon } from '@/components/icons';
import { OwnerHomeIcons, type OwnerView } from '@/components/OwnerHomeIcons';
import { OwnerComplaints } from '@/components/OwnerComplaints';
import { BiometricLockToggle } from '@/components/BiometricLockToggle';
import { biometricLockEnabled, verifyOwner } from '@/lib/biometric';
import type { FuelProduct, Station, StationProduct, TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];

export default function OwnerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [netErr, setNetErr] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [products, setProducts] = useState<StationProduct[]>([]);
  /** ما أشعله المالك أو وعد به في هذه الجلسة وحده — وهو وحده ما يُعلَن. */
  const [changed, setChanged] = useState<Set<FuelProduct>>(new Set());
  /** لُمس منتجٌ ولم يُرسل بعد — فيُقال له في الأعلى أين زرُّ الإرسال. */
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  /** الجلسةُ موجودةٌ والوجهُ أو البصمةُ لم تُقبل بعد — في التطبيق وحده. */
  const [locked, setLocked] = useState(false);
  const [savingProduct, setSavingProduct] = useState<FuelProduct | null>(null);
  /** المنتجُ المفتوحةُ تفاصيلُه — واحدٌ لا أكثر، فلا تطول الشاشة. */
  const [openProduct, setOpenProduct] = useState<FuelProduct | null>(null);
  // كتابةٌ سقطت تُقال. وكانت تُبتلع في مسارين من ثلاثة.
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [view, setView] = useState<OwnerView>('home');
  /** ما لم يقرأه صاحبُ المحطة من الإدارة أو من المنصّة */
  const [unread, setUnread] = useState(0);
  /** شكاوى مفتوحةٌ على محطته — رقمٌ على الأيقونة */
  const [complaints, setComplaints] = useState(0);
  /** من ينتظر خبرَه في مدينته — الرقمُ على زرّ الإرسال وفي اللافتة */
  const [audience, setAudience] = useState<Audience | null>(null);
  const [trafficNote, setTrafficNote] = useState<string | null>(null);
  const [phoneNote, setPhoneNote] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    // maybeSingle() errors outright when an owner holds more than one station,
    // which would render as "no station at all" — take the earliest instead
    const { data: st } = await supabase
      .from('stations')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at')
      .limit(1)
      .maybeSingle();

    setStation(st ?? null);
    if (st) {
      // Claim this phone for this station, the way the admin panel claims its
      // own. Without it device_tokens.station_id stays null and every owner
      // reminder ever written has nobody to reach — which is exactly what had
      // happened: 114 devices, none linked.
      const deviceToken = localStorage.getItem('device-token');
      if (deviceToken) {
        await supabase.rpc('claim_owner_device', {
          p_token: deviceToken,
          p_station_id: st.id,
        });
      }
      const { data: pr } = await supabase
        .from('station_products')
        .select('*')
        .eq('station_id', st.id);
      setProducts(pr ?? []);

      // عدٌّ بلا صفوف: ما لم يقرأه المالك من الإدارة أو من المنصّة. ولا
      // ينتظره باقي التحميل — شارةٌ متأخّرةٌ نصفَ ثانية خيرٌ من لوحةٍ تنتظرها.
      supabase
        .from('station_messages')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', st.id)
        .neq('sender', 'owner')
        .is('read_at', null)
        .then(({ count }) => setUnread(count ?? 0));
      supabase
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', st.id)
        .is('resolved_at', null)
        .then(({ count }) => setComplaints(count ?? 0));
      supabase
        .rpc('station_audience', { p_station: st.id })
        .then(({ data }) => data && setAudience(data as Audience));
    }
    setLoading(false);
  }, []);

  // رابطُ الإشعار يحمل ?chat=1، فيفتح شاشةَ الرسائل بدل أن يترك صاحبَ
  // المحطة يبحث عنها. ويُقرأ من location لا بـuseSearchParams: الأخيرة تُلزم
  // حدَّ Suspense في بناء التصدير الساكن، وهذه قراءةٌ واحدة عند التركيب.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('chat=1')) {
      setView('chat');
      setUnread(0);
    }
  }, []);

  useEffect(() => {
    // stored session, not a round trip — a dropped request must not read as
    // "not signed in" and send a station owner back to the login form
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUserId(user.id);
      // ── القفلُ بالبصمة أو الوجه — في التطبيق، وحيث فُعّل ─────────────
      //
      // الجلسةُ محفوظةٌ في مخزن التطبيق فلا كلمةَ مرور، والبصمةُ هي البابُ
      // إليها. رفضُها لا يُخرج أحداً: شاشةُ قفلٍ فيها «حاول ثانيةً» و«أدخل
      // بكلمة المرور». والمتصفّحُ يمرّ من هنا بلا سؤال (`biometricLockEnabled`
      // تردّ «لا» خارج التطبيق).
      if (await biometricLockEnabled()) {
        if (!(await verifyOwner())) {
          setLocked(true);
          setLoading(false);
          return;
        }
      }
      // بـ`return`: بدونه يخرج رفضُ `load` من هذه السلسلة فلا يمسكه شيء،
      // فيبقى `loading` صحيحاً ويدور المغزلُ أبداً بلا نصٍّ ولا زرّ.
      return load(user.id);
    })
      .catch((e) => {
        // ولا يُحوَّل إلى /login: سقوطُ الشبكة ليس انتهاءَ جلسة، وطردُ صاحب
        // محطةٍ إلى نموذج دخولٍ أتمّه للتوّ هو العطلُ الذي حُرس منه أعلاه.
        setNetErr(readFailure(e));
        setLoading(false);
      });
  }, [router, load]);

  /** كتابةٌ واحدةٌ لكلّ ما يُكتب على صفّ منتج — ومعها استرجاعٌ عند الفشل.
   *
   *  ── ولماذا وُحِّدت ───────────────────────────────────────────────────────
   *
   *  كانت ثلاثاً. و`setAvailable` وحدَها تنظر في `error` وترجع؛ أمّا
   *  `setExpected` و`setRunsOut` **فلا تفحصانه إطلاقاً**. فكتابةٌ ترفضها
   *  القاعدة — أو تسقط في الطريق — تُعرَض على صاحب المحطة «محفوظة»، فيمضي
   *  وهو يظنّ موعدَ وصوله معلَناً وليس على صفحته حرف. وهو أسوأُ من عطلٍ ظاهر:
   *  العطلُ الظاهرُ يُعاد، والصامتُ يُبنى عليه.
   *
   *  ويُستعاد الصفُّ كلُّه لا الحقلُ المكتوب: `setAvailable` كانت ترجع نصفَ
   *  رجوعٍ — تُعيد `is_available` وتترك `runs_out_at` على قيمةٍ لم تُكتب. */
  async function patchProduct(
    product: FuelProduct,
    patch: Partial<StationProduct>
  ): Promise<boolean> {
    if (!station) return false;
    const before = products.find((p) => p.product === product);
    setSavingProduct(product);
    setSaveErr(null);
    setProducts((prev) => prev.map((p) => (p.product === product ? { ...p, ...patch } : p)));

    const { error } = await supabase
      .from('station_products')
      .update(patch)
      .eq('station_id', station.id)
      .eq('product', product);

    setSavingProduct(null);
    if (error) {
      if (before) {
        setProducts((prev) => prev.map((p) => (p.product === product ? before : p)));
      }
      setSaveErr('تعذّر الحفظ — تحقّق من اتصالك وأعد المحاولة.');
      return false;
    }
    return true;
  }

  /** الحالاتُ الثلاث، وما تكتبه كلٌّ منها.
   *
   *  ── و«غير متوفر» و«متوقّع» كلتاهما نفادٌ إن جاءتا من التوفّر ───────────
   *
   *  كانت «غير متوفر» وحدَها تكتب موعدَ النفاد. فعلامةُ «نفد» في جدول الوقود —
   *  وشرطُها `is_available && hasRunOut(...)` — كانت **ميّتةً عمليّاً**: قِيس،
   *  فإذا صفٌّ واحدٌ من مئتين وثمانين يحقّقها في القاعدة كلِّها، وصفرٌ من
   *  ثلاثةَ عشرَ سطراً على لوحة ذلك اليوم.
   *
   *  **والشرطُ الانتقالُ لا الإطفاءُ المجرَّد**: وعدٌ لم يصل بعدُ مطفأٌ أيضاً،
   *  وكتابةُ موعدِ نفادٍ له تجعل ما لم يصل «نفد» — وهو الخلطُ الذي يحرس منه
   *  التعليقُ في `lib/board.ts`. فما كان `true` وصار غيرَه هو الذي نفد.
   *
   *  ── ولا يُمحى `expected_at` عند «متوفر» ────────────────────────────────
   *
   *  الوعدُ هو الذي يُدخل المحطةَ لوحةَ الجدول، وصيرورةُ التوفّر صادقةً هي
   *  التي تجعل سطرَها «وصل ✓» (lib/board.ts:167-184). فمحوُه هنا يكسر
   *  اللوحةَ صمتاً — وهو أسهلُ خطأٍ يقع في هذا الملفّ. */
  async function setState(product: FuelProduct, next: ProductState) {
    const was = products.find((p) => p.product === product)?.is_available === true;
    const now = new Date().toISOString();
    const ranOut = next !== 'in' && was ? now : null;

    const ok = await patchProduct(product, {
      is_available: next === 'in',
      updated_at: now,
      // والإشعالُ يُصفّر موعدَ النفاد: من يقول «متوفّر» الآن يُبطل بقولِه
      // نفاداً أعلنه قبل ساعة — ولولا التصفير لوُلد التفعيلُ ميّتاً.
      ...(next === 'in' ? { runs_out_at: null } : ranOut ? { runs_out_at: ranOut } : {}),
      // و«غير متوفر» تمحو الوعدَ صراحةً. هذه هي الحالةُ التي لم يكن لها زرّ،
      // فاضطُرّ أصحابُ المحطات إلى كتابة «متوقّع غداً» ليبقوا ظاهرين.
      ...(next === 'out'
        ? { expected_at: null, expected_period: null, expected_time: null }
        : {}),
    } as Partial<StationProduct>);
    if (!ok) return;

    // No push here. An owner who switches on five products would fire five
    // notifications, and someone who receives five buzzes in ten seconds
    // deletes the app — which costs us every future alert, not just these.
    // The announcement belongs to the send button, once, for all of them.
    setChanged((s) => {
      const n = new Set(s);
      if (next === 'in') n.add(product);
      else n.delete(product);
      return n;
    });
    setDirty(true);
  }

  /** «متى تتوقّع نفاده؟» — ساعاتٌ من الآن لا ساعةُ حائط: صاحبُ المحطة يعرف
   *  كم بقي عنده، لا متى ينتهي بالضبط. */
  async function setRunsOut(product: FuelProduct, hours: number | null) {
    const runs_out_at =
      hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    // والختمُ يُجدَّد: من ضبط موعدَ نفادٍ تكلّم الآن، فلا تُلاحقه رسالةُ
    // «وقودك معروضٌ بخبرٍ قديم» عن لوحةٍ لمسها بيده.
    if (await patchProduct(product, { runs_out_at, updated_at: new Date().toISOString() })) {
      setDirty(true);
    }
  }

  /** موعدُ الوصول — يوماً، ومعه فترةٌ أو ساعةٌ لا كلتاهما.
   *
   *  والساعةُ والفترةُ تتعارضان بالتصميم: `whenLabel` تفضّل الساعة، فحالةٌ
   *  تُخزَّن ولا تُعرض حالةٌ لا يُشخَّص عطبُها. والقاعدةُ تحرس ألّا تُكتب ساعةٌ
   *  بلا يوم (station_products_time_needs_day). */
  async function setExpected(
    product: FuelProduct,
    expected_at: string | null,
    period: ExpectedPeriod | null,
    time: string | null
  ) {
    const was = products.find((p) => p.product === product)?.is_available === true;
    const now = new Date().toISOString();
    const ok = await patchProduct(product, {
      expected_at,
      expected_period: expected_at === null ? null : period,
      expected_time: expected_at === null ? null : time,
      updated_at: now,
      // ووعدٌ يعني أنّه ليس متوفّراً الآن — وإن كان متوفّراً قبل لحظة فقد نفد.
      ...(expected_at
        ? { is_available: false, ...(was ? { runs_out_at: now } : {}) }
        : {}),
    } as Partial<StationProduct>);
    if (!ok) return;
    // والوعدُ خبرٌ يُبعث كالتوفّر: «يصل غداً» يُغني سائقاً عن رحلة اليوم.
    setChanged((s) => {
      const n = new Set(s);
      if (expected_at) n.add(product);
      else n.delete(product);
      return n;
    });
    setDirty(true);
  }

  /** Confirms the list as it stands and stamps the moment. An owner who
   *  changed nothing today still needs a way to say "this is still true" —
   *  otherwise the poster carries a date that makes fresh stock look stale. */
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);
  /** أُرسل ولا إشعار — ويُقال، فالصمتُ يُقرأ عطلاً. */
  const [quietNote, setQuietNote] = useState<string | null>(null);

  /** أحدثُ ختمٍ على منتجٍ معروضٍ متوفراً — نفسُ مقياس `owner-daily`
   *  (lastAvailable هناك): محطةٌ تلمس منتجاً غير متوفر يبدو لوحها حديثاً
   *  بينما البانزين الذي يقصده الناس معروضٌ بخبرٍ عمره ثلاثة أيام. */
  const lastAvailable = products
    .filter((p) => p.is_available)
    .map((p) => p.updated_at)
    .sort()
    .at(-1);
  const staleAge = lastAvailable ? Date.now() - new Date(lastAvailable).getTime() : 0;
  const staleSince = lastAvailable && staleAge >= FRESH_HOURS * 3600_000 ? lastAvailable : null;
  const withdrawnNow = staleAge >= WITHDRAW_HOURS * 3600_000;

  /** أصار منتجٌ متوفّراً في هذه الجلسة؟ — هو ما يُبدّل اسمَ الزرّ وفعلَه. */
  const willNotify = products.some((p) => changed.has(p.product) && p.is_available);
  const sendLabel = willNotify
    ? audience?.watchers
      ? `أرسل إشعاراً لـ${num(audience.watchers)} شخص الآن`
      : 'أرسل الإشعار الآن'
    : 'احفظ الحالة';

  async function confirmAvailability() {
    if (!station) return;
    const now = new Date().toISOString();
    await supabase
      .from('station_products')
      .update({ updated_at: now })
      .eq('station_id', station.id);

    // ويُحيي ما فات موعدُ نفاده — ولا يمسّ ما لم يفت.
    //
    // «تأكيد» يقول: ما تراه صحيحٌ الآن. فموعدُ نفادٍ مضى تُكذّبه هذه
    // الضغطة، وموعدٌ لم يحن لا تمسّه — ولو صُفّرت كلُّها لضاع على المالك ما
    // ضبطه قبل دقيقة. وبلا الإحياء يختم الزرُّ الوقتَ ولا يُعيد شيئاً
    // معروضاً، ويقول له «حالتك محدّثة ✅» عن محطةٍ ما زالت مخفيّة.
    //
    // وما أطفأه كرونُ `expire_run_outs` لا يُحيا من هنا: صار «غير متوفر» بكلمة
    // صاحبه، وعودتُه ضغطةُ «متوفر» لا ضغطةُ حفظ.
    await supabase
      .from('station_products')
      .update({ runs_out_at: null })
      .eq('station_id', station.id)
      .eq('is_available', true)
      .lt('runs_out_at', now);
    setProducts((prev) =>
      prev.map((p) =>
        p.is_available && p.runs_out_at && p.runs_out_at < now ? { ...p, runs_out_at: null } : p
      )
    );
    setConfirmedAt(now);
    setNotifyNote(null);
    setQuietNote(null);
    setDirty(false);

    // خبرُ وصولٍ لا خبرُ حالة: يُعلَن ما **صار** متوفراً أو موعوداً في هذه
    // الجلسة، لا كل ما هو متوفر.
    //
    // كان يُرسل كل متوفر: فمالكٌ يُطفئ الغاز — والغاز نفد فعلاً — ثم يضغط
    // «تأكيد» فيُعاد إعلان البانزين كأنه وصل للتوّ. الفعل إطفاء والنتيجة
    // بشارة، ووصلت الناسَ إشعاراتُ وصولٍ من محطات كانت تُغلق منتجاتها.
    //
    // والزرُّ لا يكذب: يقول «أرسل إشعاراً» حين صار منتجٌ **متوفّراً** في هذه
    // الجلسة، و«احفظ الحالة» فيما سوى ذلك — ويفعل ما قال. والموعودُ يركب مع
    // إشعار التوفّر («⛽ كاز · متوقّع: بانزين غداً») ولا يُبعث وحدَه: قرارُ
    // صاحب المنصّة ١١ أيلول ٢٠٢٦. و«غير متوفر» لا يُبعث أبداً.
    const available = willNotify
      ? products.filter((p) => changed.has(p.product) && isAnnounceable(p)).map((p) => p.product)
      : [];
    if (!available.length) {
      setQuietNote('حُفظت الحالة — بلا إشعار.');
      setChanged(new Set());
    } else {
      // notify only speaks for a station on its owner's or an admin's word, so
      // the session token rides along — the endpoint used to answer anyone.
      const { data: sess } = await supabase.auth.getSession();
      // الجواب يُقرأ ولا يُهمَل: fetch لا ترمي على 401 ولا 502، فـ.catch وحدها
      // تترك كل رفضٍ من الخادم صامتاً — وهكذا مرّت تسع وثلاثون ساعة بلا إشعار
      // واحد بينما كل مالك يرى «نُشر».
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ stationId: station.id, products: available }),
      })
        .then(async (r) => {
          if (r.ok) {
            // ما أُعلن لا يُعاد إعلانه بضغطة إرسالٍ ثانية.
            setChanged(new Set());
            return;
          }
          // ورسالة الخادم تُعرض كما هي: «محطتك مغلقة الآن» جوابٌ يفهمه المالك
          // ويتصرّف به، بينما «أبلِغ الإدارة» في هذا الموضع يُرسله إلى لا شيء.
          const said = await r.json().catch(() => null);
          setNotifyNote(
            said?.error ?? 'حُفظت الحالة، لكن تعذّر إرسال الإشعار للمشتركين. أبلِغ الإدارة.'
          );
        })
        .catch(() =>
          setNotifyNote('حُفظت الحالة، ولم نتأكّد من وصول الإشعار — تحقّق من اتصالك.')
        );
    }

  }

  /** Show the station's number to the public, or keep it for the admin only.
   *
   *  Owners asked for this. The number is never cleared — it is also the login
   *  username (p<digits>@muhta.app), so clearing it would lock the owner out of
   *  their own account and break both bots. This hides it; it does not delete
   *  it. And the site is a static export, so the already-published pages carry
   *  the old value until the next build — hence the rebuild, and hence the copy
   *  says "within two minutes" rather than "now". */
  async function togglePhoneHidden() {
    if (!station) return;
    const next = !station.phone_hidden;
    setStation({ ...station, phone_hidden: next });
    const { error } = await supabase
      .from('stations')
      .update({ phone_hidden: next })
      .eq('id', station.id);
    if (error) {
      setStation({ ...station, phone_hidden: !next });
      return;
    }
    // The number is baked into the prerendered pages; without this it stays
    // readable on the published site however the toggle looks here. Awaited and
    // reported: a silent failure here is the worst kind, because the switch
    // still moves and the owner walks away believing their number is gone.
    setPhoneNote(next ? 'يختفي رقمك من الصفحة المنشورة خلال دقيقتين…' : null);
    const failed = await rebuildSite();
    // ── والرسالةُ تقول ما وقع كلَّه، لا نصفَه ────────────────────────────
    //
    // كانت تقول «رقمك ما يزال ظاهراً» وتسكت عن الباقي، فيقرأ صاحبُ المحطة
    // أنّ الإخفاءَ لم يقع أصلاً — وهو قد وقع: القاعدةُ حُدّثت، و`stations_public`
    // تُخفي الرقمَ فوراً، و`station_phone_for` معها، فالتطبيقُ والبوتان لا
    // يعرضونه من هذه اللحظة. الصفحةُ المُسبَقةُ البناء وحدَها تتأخّر.
    //
    // والسببُ يُقال: `rebuildSite` تردّه نصّاً منذ زمن، وكان يُرمى. و«رفضٌ»
    // غيرُ «انقطعت الشبكة» غيرُ «استغرق وقتاً» — ثلاثةُ أبوابٍ كانت تُقرأ
    // باباً واحداً اسمُه «أبلِغ الإدارة».
    setPhoneNote(
      failed
        ? `رقمك مخفيٌّ الآن في التطبيق والبوتات. لكن صفحة محطتك المنشورة لم تُحدَّث بعد — ${failed} وتُحدَّث وحدَها مع أوّل تحديثٍ للموقع.`
        : next
          ? 'تمّ. رقمك لم يعد يظهر في صفحة محطتك.'
          : null
    );
  }

  async function toggleTempClose() {
    if (!station) return;
    const next = !station.temp_closed;
    // Closing clears the queue reading, because there is no queue. The panel
    // has always told the owner it «تُمسح تلقائياً»; nothing ever cleared it —
    // the 30-minute expiry is read-side only and the column kept its value
    // forever. Now the sentence is true for the one case the owner controls.
    const patch = next
      ? { temp_closed: true, manual_traffic_level: null, manual_traffic_set_at: null }
      : { temp_closed: false };
    setStation({ ...station, ...patch });
    await supabase.from('stations').update(patch).eq('id', station.id);
  }

  async function setTraffic(level: TrafficLevel) {
    if (!station) return;
    // بالصلاحية لا بالحقل: الانتهاء يُقرأ ولا يُكتب، فالحقل يبقى محمّلاً بعد
    // الثلاثين دقيقة بينما لا زرّ مضيء — وضغط الزر نفسه كان يمسحه بدل ضبطه.
    const next = activeTrafficLevel(station) === level ? null : level;
    const now = new Date().toISOString();
    setStation({ ...station, manual_traffic_level: next, manual_traffic_set_at: now });

    const { error } = await supabase
      .from('stations')
      .update({ manual_traffic_level: next, manual_traffic_set_at: now })
      .eq('id', station.id);

    if (error) {
      // the toggle used to flip on screen whether or not the row was written
      setStation({ ...station });
      setTrafficNote('تعذّر حفظ حالة الازدحام. تحقّق من الاتصال وحاول مجدداً.');
      return;
    }

    // A reading is only worth showing while it is recent, so the reminder is
    // tied to the reading rather than to the clock: set one, and thirty
    // minutes later the phone asks for the next. Clear it, and nothing is
    // pending to remind about.
    if (next) {
      const armed = await scheduleTrafficReminder(station.name);
      setTrafficNote(
        armed
          ? `سيصلك تذكير بعد ${MANUAL_TRAFFIC_MINUTES} دقيقة لتحديثها — وإن لم تحدّثها تُمسح تلقائياً.`
          : `تُمسح تلقائياً بعد ${MANUAL_TRAFFIC_MINUTES} دقيقة إن لم تحدّثها.`
      );
    } else {
      await cancelTrafficReminder();
      setTrafficNote(null);
    }
  }

  /** شاشةٌ فرعيّة تُفتح من الأيقونات، وتعود بـ«الرئيسية». */
  function openView(next: OwnerView) {
    setView(next);
    if (next === 'chat') setUnread(0);
    window.scrollTo(0, 0);
  }

  /** ازدحامُ طابور منتجٍ بعينه — ضغطةٌ ثانية على المضيء تُلغيه، كازدحام المحطة. */
  async function setProductTraffic(product: FuelProduct, level: TrafficLevel) {
    if (!station) return;
    const row = products.find((p) => p.product === product);
    const next = productTrafficLevel(station, row) === level ? null : level;
    await patchProduct(product, {
      traffic_level: next,
      traffic_set_at: next ? new Date().toISOString() : null,
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  /** «حاول ثانيةً» من شاشة القفل. */
  async function unlock() {
    if (!userId) return;
    if (!(await verifyOwner())) return;
    setLocked(false);
    setLoading(true);
    await load(userId);
  }

  if (netErr) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-base font-bold">تعذّر فتح لوحتك</h1>
        <p className="mt-2 text-sm text-slate-500">{netErr}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-ghost mt-5 px-6"
        >
          إعادة المحاولة
        </button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-slate-400" />
      </main>
    );
  }

  if (locked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <LockIcon className="h-8 w-8 text-brand" />
        <h1 className="mt-3 text-base font-bold">لوحتك مقفلة</h1>
        <p className="mt-2 text-sm text-slate-500">افتحها بوجهك أو بصمتك، أو ادخل بكلمة المرور.</p>
        <button type="button" onClick={unlock} className="btn-primary mt-5 w-full max-w-xs">
          افتح بالبصمة أو الوجه
        </button>
        <button type="button" onClick={signOut} className="btn-ghost mt-2 w-full max-w-xs">
          أدخل بكلمة المرور
        </button>
      </main>
    );
  }

  const TITLES: Record<Exclude<OwnerView, 'home'>, string> = {
    chat: 'الرسائل',
    info: 'معلومات المحطة',
    designs: 'التصاميم',
    complaints: 'الشكاوي',
    traffic: 'حالة الازدحام',
    account: 'حسابي',
  };

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-brand">لوحة صاحب المحطة</h1>
          {station && (
            <p className="truncate text-[11px] font-bold text-slate-400">
              {station.name} · {station.city}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      {/* ── التنبيهُ في الأعلى — ويلتصق عند التمرير ─────────────────────────
        *
        *  ضغطةُ «متوفر» تُكتب في القاعدة فوراً، لكنّ الإشعارَ لا يخرج إلّا
        *  بزرٍّ في أسفل القائمة. فصاحبُ محطةٍ يضبط سبعةَ منتجاتٍ ويُغلق الهاتف
        *  يظنّ الناسَ قد عرفوا — ولم يعرف أحد. السطرُ يقول ما ينقص ويسمّي
        *  الزرَّ باسمه، ويبقى حتى يُضغط. `sticky` لا `fixed`: لا يغطّي شيئاً. */}
      {dirty && (
        <div
          role="status"
          className="sticky top-0 z-30 -mx-4 mt-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-[12px] font-bold text-amber-900"
        >
          عند إتمام ضبط المنتجات اضغط «{willNotify ? 'أرسل إشعاراً' : 'احفظ الحالة'}»
        </div>
      )}

      <div className="mt-4">
        {!station && (
          <div className="card p-6 text-center">
            <h2 className="text-base font-bold">لا توجد محطة مرتبطة بحسابك</h2>
            <p className="mt-2 text-sm text-slate-500">
              أكمل تسجيل محطتك لتتمكن من تحديث توفر الوقود.
            </p>
            <a href="/login" className="btn-primary mt-4">
              تسجيل المحطة
            </a>
          </div>
        )}

        {station?.status === 'pending' && (
          <div className="card p-6 text-center">
            <FuelIcon className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-3 text-base font-bold">طلبك قيد المراجعة</h2>
            <p className="mt-2 text-sm text-slate-500">
              تم استلام طلب تسجيل «{station.name}». ستظهر المحطة للمستخدمين فور موافقة الإدارة.
            </p>
          </div>
        )}

        {station?.status === 'rejected' && (
          <div className="card p-6 text-center">
            <h2 className="text-base font-bold text-traffic-red">تم رفض الطلب</h2>
            <p className="mt-2 text-sm text-slate-500">
              للاستفسار عن سبب الرفض يرجى التواصل مع إدارة المنصة.
            </p>
          </div>
        )}

        {/* ── الرئيسية: أيقوناتٌ ثمّ المنتجاتُ ثمّ الإرسال ─────────────────
          *
          *  هذا ما يفتح عليه صاحبُ المحطة. لا بطاقةَ قبل المنتجات إلّا سطرُ
          *  الإغلاق المؤقّت — لأنّ محطةً مغلقةً لا تظهر للناس مهما ضبط، فيجب
          *  أن يراه قبل أن يعمل. */}
        {station?.status === 'approved' && view === 'home' && (
          <div className="space-y-4">
            {station.temp_closed && (
              <button
                type="button"
                onClick={toggleTempClose}
                className="w-full rounded-xl border border-traffic-red bg-red-50 px-3 py-2.5 text-center text-[12px] font-extrabold text-traffic-red"
              >
                ⛔ محطتك مغلقة مؤقتاً ولا تظهر مفتوحةً للناس — اضغط لإعادة الفتح
              </button>
            )}

            <OwnerHomeIcons
              unread={unread}
              complaints={complaints}
              tempClosed={!!station.temp_closed}
              onOpen={openView}
              onTempClose={toggleTempClose}
            />

            <section className="card p-5">
              <h3 className="text-sm font-bold">توفر المنتجات</h3>
              <p className="mt-1 text-xs text-slate-400">
                اضبط كلَّ منتج، ثمّ اضغط الزرَّ الأخضر في الأسفل مرّةً واحدة.
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {PRODUCT_ORDER.map((product) => (
                  <ProductControl
                    key={product}
                    product={product}
                    row={products.find((p) => p.product === product)}
                    saving={savingProduct === product}
                    open={openProduct === product}
                    onFocus={() => setOpenProduct(product)}
                    onSetState={(next: ProductState) => setState(product, next)}
                    onSetExpected={(date, period, time) =>
                      setExpected(product, date, period, time)
                    }
                    onSetRunsOut={(hours) => setRunsOut(product, hours)}
                  />
                ))}
              </ul>
              {saveErr && (
                <p className="mt-2 text-[11.5px] font-bold text-traffic-red">{saveErr}</p>
              )}

              {/* الزرُّ في نهاية الجدول نفسِه، ويقول ما يفعل — فلا شرحَ فوقه:
                  «أرسل إشعاراً لـ٢٠٧ شخص الآن» حين صار شيءٌ متوفّراً، و«احفظ
                  الحالة» فيما سوى ذلك. */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                {notifyNote && (
                  <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs font-bold leading-relaxed text-red-700">
                    {notifyNote}
                  </p>
                )}
                <button type="button" onClick={confirmAvailability} className="btn-primary w-full">
                  {willNotify ? '📤 ' : ''}
                  {sendLabel}
                </button>
                {confirmedAt && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
                    تمّ الإرسال{' '}
                    {new Intl.DateTimeFormat('ar-IQ', {
                      timeZone: 'Asia/Baghdad',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    }).format(new Date(confirmedAt))}
                    {quietNote ? '.' : ' — والإشعارُ في طريقه، وصورةُ الإعلان جاهزة في «التصاميم».'}
                  </p>
                )}
                {quietNote && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    {quietNote}
                  </p>
                )}
              </div>
            </section>

            {/* حين يُطفأ الأخير — يُقال في اللحظة، لا في رسالة الغد.
              *
              *  المحطة التي لا متوفر لديها ولا متوقَّع لم تعد تظهر في القائمة.
              *  والمالك يُطفئ آخر منتجٍ ولا يعلم أن محطته اختفت — فيظنّ التطبيق
              *  معطّلاً، أو يظنّ نفسه ما زال معروضاً وهو ليس كذلك.
              *
              *  وإشعارٌ يصله بعد ضغطته بثانية عبثٌ: هو ينظر إلى الشاشة. فالسطر
              *  هنا، ورسالة owner-daily لمن أطفأ وأغلق ومضى. */}
            {!products.some(isListed) && (
              <section className="card border-traffic-yellow bg-amber-50 p-5">
                <h3 className="text-sm font-bold text-amber-900">لا وقود معلَناً على صفحتك</h3>
                {/* ــ ولا مساومة ــــــــــــــــــــــــــــــــــــــــــــ
                  *
                  *  كان النصُّ يقول «فلا تظهر بطاقتك»، وكان صادقاً: القائمةُ
                  *  تُسقط من لا وقودَ عنده ولا وعد. فكان الظهورُ ثمناً يُدفع
                  *  بكذبة، واشتكى منه صاحبُ محطةٍ بالهاتف. وقد رُفع. */}
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                  بطاقتك تظهر مشطوبةً <b>«لا يوجد الآن»</b> في آخر القائمة.
                  <b> أعلِن ما وصلك</b>، أو <b>ضع موعد الوصول</b> إن عرفتَه — ولا تضع موعداً
                  لا تعرفه.
                </p>
              </section>
            )}

            {/* **التذكيرُ الداخلي — لمن فتح اللوحة ولم يصله شيء.**
              *
              *  ثلاثُ محطاتٍ من ثمانٍ وعشرين لها جهازٌ مربوط. فالإشعارُ لا يصل
              *  أكثرَهم، وحين يفتح صاحبُ المحطة لوحته بنفسه تكون هذه آخرَ فرصة
              *  لقول ما لم يبلغه: وقودُك معروضٌ بخبرٍ فائت، وزرُّ إصلاحه تحته
              *  مباشرة — `confirmAvailability` نفسُها، لا نسخةٌ منها. */}
            {staleSince && (
              <section
                className={`card p-4 ${withdrawnNow ? 'border-2 border-traffic-red bg-red-50' : 'border-traffic-yellow bg-amber-50'}`}
              >
                <h3 className={`text-sm font-extrabold ${withdrawnNow ? 'text-traffic-red' : 'text-amber-900'}`}>
                  {withdrawnNow ? 'سُحب توفّرك من العرض' : 'وقودك معروض بخبر قديم'}
                </h3>
                <p className={`mt-1 text-xs leading-relaxed ${withdrawnNow ? 'text-red-900' : 'text-amber-900/80'}`}>
                  آخر تأكيد لمنتجاتك <b>{ageLabel(staleSince)}</b>.{' '}
                  {withdrawnNow ? (
                    <>
                      مضى أكثر من {WITHDRAW_HOURS} ساعة بلا تأكيد، فلم يعد وقودُك معروضاً للناس
                      ولا تظهر محطتك في «المتاح الآن». <b>أرسل التحديث ليعود في الحال.</b>
                    </>
                  ) : (
                    <>
                      ما زال معروضاً على صفحتك، لكنه بالرمادي ومعه عمره. أرسل التحديث ليعود
                      أخضرَ — وإن نفد فأطفئه من الأعلى.
                    </>
                  )}
                </p>
              </section>
            )}

            <OwnerDeviceLink stationId={station.id} />

            {/* الرقمُ الذي هو غايةُ المنصّة — شريطاً في أسفل الشاشة، لا بطاقةً
                تزاحم المنتجات. */}
            <AudienceBanner
              station={station}
              products={products}
              muted={!!staleSince}
              audience={audience}
              ticker
            />
          </div>
        )}

        {/* ── الشاشاتُ الفرعيّة ─────────────────────────────────────────── */}
        {station?.status === 'approved' && view !== 'home' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openView('home')}
                className="btn-ghost shrink-0 px-3 py-2 text-xs"
              >
                ‹ الرئيسية
              </button>
              <h2 className="text-sm font-bold">{TITLES[view]}</h2>
            </div>

            {view === 'chat' && <StationChat stationId={station.id} as="owner" />}

            {view === 'complaints' && <OwnerComplaints stationId={station.id} />}

            {view === 'traffic' && (
              <section className="card p-5">
                <h3 className="text-sm font-bold">حالة الازدحام</h3>
                <p className="mt-1 text-xs text-slate-400">
                  أنت الوحيد الذي يرى ساحتك، فتحديدك يظهر للمستخدمين بدل تصويتهم. ويبقى{' '}
                  {MANUAL_TRAFFIC_MINUTES} دقيقة ثم يُمسح — كما يسقط تصويتهم بعد المدّة نفسها،
                  فحالةٌ من ساعة مضت لا تصف الساحة الآن. اضغط مرة أخرى للإلغاء.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {LEVELS.map((level) => {
                    // بالصلاحية لا بالحقل وحده: حالةٌ انتهت مدّتها لا تُعرض مضيئة
                    const active = activeTrafficLevel(station) === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTraffic(level)}
                        className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors duration-200 ${
                          active
                            ? `${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text} ${TRAFFIC_COLORS[level].border}`
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
                        {TRAFFIC_LABELS[level]}
                      </button>
                    );
                  })}
                </div>

                {trafficNote && (
                  <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold leading-relaxed text-brand-700">
                    {trafficNote}
                  </p>
                )}

                {/* ── ولكلّ منتجٍ طابورُه ──────────────────────────────────
                  *
                  *  طابورُ الكاز غيرُ طابور البانزين في الساحة نفسِها. فالمتوفّرُ
                  *  الآن يُعرض هنا بأزراره الثلاثة، وما يُختار يظهر على شريحة
                  *  المنتج في بطاقة المحطة. اختياريٌّ، ويسقط بعد ثلاثين دقيقة
                  *  كازدحام المحطة. */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-[12px] font-bold text-slate-700">ولكلّ منتجٍ طابورُه (اختياري)</p>
                  {products.filter((p) => p.is_available && !hasRunOut(p.runs_out_at)).length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400">فعّل منتجاً في الرئيسية ليظهر هنا.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {products
                        .filter((p) => p.is_available && !hasRunOut(p.runs_out_at))
                        .map((p) => {
                          const current = productTrafficLevel(station, p);
                          return (
                            <li key={p.product} className="flex items-center gap-2 py-2">
                              <span className="w-[64px] shrink-0 text-[12px] font-bold leading-tight">
                                {PRODUCT_LABELS[p.product]}
                              </span>
                              <div className="grid flex-1 grid-cols-3 gap-1">
                                {LEVELS.map((level) => {
                                  const active = current === level;
                                  return (
                                    <button
                                      key={level}
                                      type="button"
                                      aria-pressed={active}
                                      disabled={savingProduct === p.product}
                                      onClick={() => setProductTraffic(p.product, level)}
                                      className={`flex min-h-[36px] items-center justify-center gap-1 rounded-lg border text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50 ${
                                        active
                                          ? `${TRAFFIC_COLORS[level].bg} ${TRAFFIC_COLORS[level].text} ${TRAFFIC_COLORS[level].border}`
                                          : 'border-slate-200 bg-white text-slate-600'
                                      }`}
                                    >
                                      <span className={`h-2 w-2 rounded-full ${TRAFFIC_COLORS[level].dot}`} />
                                      {TRAFFIC_LABELS[level]}
                                    </button>
                                  );
                                })}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {view === 'designs' && (
              <>
                <AvailabilityPoster
                  name={station.name}
                  slug={station.slug}
                  products={products.filter((p) => p.is_available).map((p) => p.product)}
                />
                <ShareButton
                  stationId={station.id}
                  name={station.name}
                  available={products.filter((p) => p.is_available).map((p) => p.product)}
                  /* activeTrafficLevel, not the raw column: the raw value survives
                     both the 30-minute expiry and closing time, so «الازدحام: خفيف»
                     could be shared hours after it stopped being true. */
                  traffic={activeTrafficLevel(station)}
                />
                <JoinPoster stationId={station.id} name={station.name} slug={station.slug} />
                {/* keyed on the slug so the poster redraws when the link changes */}
                <StationPoster key={station.slug ?? 'none'} name={station.name} slug={station.slug} />
              </>
            )}

            {view === 'info' && (
              <>
                <WorkingHours
                  station={station}
                  onChange={(patch) => setStation({ ...station, ...patch })}
                />
                <StationLinkCard
                  stationId={station.id}
                  name={station.name}
                  slug={station.slug}
                  onSlugChange={(slug) => setStation({ ...station, slug })}
                />
                <section className="card p-5">
                  <h3 className="text-sm font-bold">بيانات المحطة</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">اسم المستخدم</dt>
                      <dd className="font-bold" dir="ltr">{station.phone}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">هاتف المحطة</dt>
                      <dd className="font-bold" dir="ltr">{station.phone}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">الشخص المسؤول</dt>
                      <dd className="font-bold">{station.contact_name || 'غير محدد'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">المدينة</dt>
                      <dd className="font-bold">{station.city}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">العنوان</dt>
                      <dd className="max-w-[60%] text-left font-bold">{station.address}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-xl border border-slate-200 p-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!station.phone_hidden}
                        onChange={togglePhoneHidden}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                      />
                      <span className="text-xs leading-relaxed text-slate-600">
                        <b>أخفِ رقم المحطة عن الناس</b>
                        <span className="mt-1 block text-slate-500">
                          يبقى الرقم عند الإدارة وحدها، ويختفي زر الاتصال من التطبيق
                          والبوتات. ولا يتغيّر دخولك — الرقم نفسه يبقى اسم المستخدم.
                          يستغرق ظهور التغيير على الموقع نحو دقيقتين.
                        </span>
                      </span>
                    </label>

                    {phoneNote && (
                      <p
                        className={`mt-2 rounded-lg p-2.5 text-xs leading-relaxed ${
                          phoneNote.startsWith('تعذّر')
                            ? 'bg-red-50 font-bold text-red-700'
                            : 'bg-brand-50 text-brand-900'
                        }`}
                      >
                        {phoneNote}
                      </p>
                    )}
                  </div>

                  {/* The name, phone and location are what drivers navigate
                      by, so they change through the admin after a check —
                      not silently from the phone in someone's pocket. */}
                  <a
                    href="https://t.me/muhtaonlinebot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost mt-4 w-full"
                  >
                    طلب تعديل بيانات المحطة
                  </a>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    تعديل الاسم أو الرقم أو الموقع يمرّ بالإدارة للتحقق، حتى لا تتغيّر بيانات
                    محطة يعتمد عليها المستخدمون دون مراجعة.
                  </p>
                </section>
              </>
            )}

            {view === 'account' && (
              <>
                <BiometricLockToggle />
                <ChangePassword />
                <OwnerReminders stationId={station.id} />
                <DeleteAccount phone={station.phone} />
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
