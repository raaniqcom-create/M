'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { rebuildSite } from '@/lib/rebuild';
import { AudienceBanner } from '@/components/AudienceBanner';
import { OwnerDeviceLink } from '@/components/OwnerDeviceLink';
import { cancelTrafficReminder, scheduleTrafficReminder } from '@/lib/trafficReminder';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
  activeTrafficLevel,
  MANUAL_TRAFFIC_MINUTES,
  TRAFFIC_COLORS,
  TRAFFIC_LABELS,
  expectedLabel,
} from '@/lib/products';
import { ShareButton } from '@/components/ShareButton';
import { StationLinkCard } from '@/components/StationLinkCard';
import { StationPoster } from '@/components/StationPoster';
import { AvailabilityPoster } from '@/components/AvailabilityPoster';
import { ProductControl } from '@/components/ProductControl';
import { WorkingHours } from '@/components/WorkingHours';
import { OwnerReminders } from '@/components/OwnerReminders';
import { DeleteAccount } from '@/components/DeleteAccount';
import type { ExpectedPeriod } from '@/lib/hours';
import { FuelIcon, LogOutIcon, SpinnerIcon } from '@/components/icons';
import type { FuelProduct, Station, StationProduct, TrafficLevel } from '@/types/database';

const LEVELS: TrafficLevel[] = ['green', 'yellow', 'red'];

export default function OwnerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [products, setProducts] = useState<StationProduct[]>([]);
  /** ما أشعله المالك في هذه الجلسة وحده — وهو وحده ما يُعلَن. */
  const [turnedOn, setTurnedOn] = useState<Set<FuelProduct>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState<FuelProduct | null>(null);
  const [view, setView] = useState<'main' | 'info' | 'data'>('main');
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
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // stored session, not a round trip — a dropped request must not read as
    // "not signed in" and send a station owner back to the login form
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUserId(user.id);
      load(user.id);
    });
  }, [router, load]);

  async function setAvailable(product: FuelProduct, next: boolean) {
    if (!station) return;
    setSavingProduct(product);
    setProducts((prev) =>
      prev.map((p) => (p.product === product ? { ...p, is_available: next } : p))
    );

    const { error } = await supabase
      .from('station_products')
      .update({ is_available: next, updated_at: new Date().toISOString() })
      .eq('station_id', station.id)
      .eq('product', product);

    if (error) {
      // revert the optimistic flip so the UI never lies about what's saved
      setProducts((prev) =>
        prev.map((p) => (p.product === product ? { ...p, is_available: !next } : p))
      );
      setSavingProduct(null);
      return;
    }

    // No push here. An owner who switches on five products would fire five
    // notifications, and someone who receives five buzzes in ten seconds
    // deletes the app — which costs us every future alert, not just these.
    // The announcement belongs to the confirm button, once, for all of them.
    //
    // وما أُشعل في هذه الجلسة يُسجَّل هنا: زرّ «تأكيد» يُعلن ما **صار**
    // متوفراً، لا كل ما هو متوفر. انظر confirmAvailability.
    setTurnedOn((s) => {
      const n = new Set(s);
      if (next) n.add(product);
      else n.delete(product);
      return n;
    });
    setSavingProduct(null);
  }

  async function setExpected(
    product: FuelProduct,
    expected_at: string | null,
    period: ExpectedPeriod | null
  ) {
    if (!station) return;
    const expected_period = expected_at === null ? null : period;
    setProducts((prev) =>
      prev.map((p) => (p.product === product ? { ...p, expected_at, expected_period } : p))
    );
    await supabase
      .from('station_products')
      .update({ expected_at, expected_period })
      .eq('station_id', station.id)
      .eq('product', product);
  }

  /** Confirms the list as it stands and stamps the moment. An owner who
   *  changed nothing today still needs a way to say "this is still true" —
   *  otherwise the poster carries a date that makes fresh stock look stale. */
  const posterRef = useRef<HTMLDivElement>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);

  async function confirmAvailability() {
    if (!station) return;
    const now = new Date().toISOString();
    await supabase
      .from('station_products')
      .update({ updated_at: now })
      .eq('station_id', station.id);
    setConfirmedAt(now);
    setNotifyNote(null);

    // خبرُ وصولٍ لا خبرُ حالة: يُعلَن ما **صار** متوفراً في هذه الجلسة، لا
    // كل ما هو متوفر.
    //
    // كان يُرسل كل متوفر: فمالكٌ يُطفئ الغاز — والغاز نفد فعلاً — ثم يضغط
    // «تأكيد» فيُعاد إعلان البانزين كأنه وصل للتوّ. الفعل إطفاء والنتيجة
    // بشارة، ووصلت الناسَ إشعاراتُ وصولٍ من محطات كانت تُغلق منتجاتها.
    //
    // و«تأكيد» يبقى على معناه الأصلي: يختم الوقت فتعود الحالة طازجة على
    // اللوحة والملصق — ويُعلن فقط إن كان ثمّة جديدٌ يستحقّ الإعلان.
    const available = products
      .filter((p) => p.is_available && turnedOn.has(p.product))
      .map((p) => p.product);
    if (available.length) {
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
            // ما أُعلن لا يُعاد إعلانه بضغطة تأكيدٍ ثانية.
            setTurnedOn(new Set());
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

    posterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    setPhoneNote(
      failed
        ? 'تعذّر تحديث الصفحة المنشورة. رقمك ما يزال ظاهراً فيها — أبلِغ الإدارة.'
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

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-slate-400" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-brand">لوحة صاحب المحطة</h1>
          <a href="/?view=user" className="text-[11px] font-bold text-slate-400">
            عرض المنصة كمستخدم ↗
          </a>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      {/* At the very top, above the panel itself: the point of the whole
          platform stated as a number of people, not as a nag. */}
      {station && (
        <div className="mt-4">
          <OwnerDeviceLink stationId={station.id} />

          <AudienceBanner station={station} products={products} />
        </div>
      )}

      <div className="mt-5">
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

        {station?.status === 'approved' && (
          <div className="space-y-4">
            <section className="card p-5">
              <h2 className="text-base font-bold">{station.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {station.city} — {station.address}
              </p>
              {station.temp_closed && (
                <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-traffic-red">
                  ⛔ مغلقة مؤقتاً — لا تظهر كمفتوحة للمستخدمين
                </p>
              )}
              {/* Closing for an incident beats the timetable: a driver sent to
                  a shut forecourt is the wasted trip this platform prevents. */}
              <button
                type="button"
                onClick={toggleTempClose}
                className={`mt-3 w-full rounded-xl border py-2.5 text-sm font-bold ${
                  station.temp_closed
                    ? 'border-brand bg-brand-50 text-brand'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                {station.temp_closed ? 'إعادة الفتح الآن' : '⛔ إغلاق مؤقت (حادث أو صيانة)'}
              </button>
            </section>

            <nav className="grid grid-cols-3 gap-1 rounded-xl bg-brand-50 p-1">
              {([
                ['main', 'اللوحة'],
                ['info', 'معلومات المحطة'],
                ['data', 'بيانات الحساب'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  aria-pressed={view === k}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors duration-200 ${
                    view === k ? 'bg-white text-brand shadow-soft' : 'text-brand-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {view === 'main' && (
              <>
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
            </section>
            <section className="card p-5">
              <h3 className="text-sm font-bold">توفر المنتجات</h3>
              <p className="mt-1 text-xs text-slate-400">
                عند تفعيل منتج يصل تنبيه فوري لمتابعي محطتك
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {PRODUCT_ORDER.map((product) => (
                  <ProductControl
                    key={product}
                    product={product}
                    row={products.find((p) => p.product === product)}
                    saving={savingProduct === product}
                    onSetAvailable={(next) => setAvailable(product, next)}
                    onSetExpected={(date, period) => setExpected(product, date, period)}
                  />
                ))}
              </ul>
            </section>
            {/* One deliberate act at the end, not a poster that jumps on every
                toggle while the owner is still working through six products. */}
            {/* حين يُطفأ الأخير — يُقال في اللحظة، لا في رسالة الغد.
              *
              *  المحطة التي لا متوفر لديها ولا متوقَّع لم تعد تظهر في القائمة.
              *  والمالك يُطفئ آخر منتجٍ ولا يعلم أن محطته اختفت — فيظنّ التطبيق
              *  معطّلاً، أو يظنّ نفسه ما زال معروضاً وهو ليس كذلك.
              *
              *  وإشعارٌ يصله بعد ضغطته بثانية عبثٌ: هو ينظر إلى الشاشة. فالسطر
              *  هنا، ورسالة owner-daily لمن أطفأ وأغلق ومضى. */}
            {!products.some((p) => p.is_available || p.expected_at) && (
              <section className="card border-traffic-yellow bg-amber-50 p-5">
                <h3 className="text-sm font-bold text-amber-900">محطتك لا تظهر في القائمة الآن</h3>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                  لا منتج متوفراً ولا متوقَّعاً على صفحتك، فلا تظهر بطاقتك لمن يبحث عن وقود.
                  <b> أعلِن ما وصلك</b>، أو <b>ضع موعد الوصول المتوقّع</b> لأي منتج أعلاه — وتعود
                  فوراً. ومن يعرف اسمك يجدك بالبحث في كل الأحوال.
                </p>
              </section>
            )}

            <section className="card p-5">
              <h3 className="text-sm font-bold">تأكيد ونشر التوفّر</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                بعد ضبط المنتجات أعلاه، أكّد القائمة: يُختم الوقت، ويصل للمستخدمين إشعار
                واحد يجمع كل المنتجات المتوفرة، ويجهز المنشور للنشر.
              </p>
              {notifyNote && (
                <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-bold leading-relaxed text-red-700">
                  {notifyNote}
                </p>
              )}
              <button type="button" onClick={confirmAvailability} className="btn-primary mt-3 w-full">
                ✅ تأكيد ونشر التوفّر
              </button>
              {confirmedAt && (
                <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
                  تم التأكيد{' '}
                  {new Intl.DateTimeFormat('ar-IQ', {
                    timeZone: 'Asia/Baghdad',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  }).format(new Date(confirmedAt))}{' '}
                  — المنشور جاهز في الأسفل.
                </p>
              )}
            </section>

            <div ref={posterRef}>
            <AvailabilityPoster
              name={station.name}
              slug={station.slug}
              products={products.filter((p) => p.is_available).map((p) => p.product)}
            />
            </div>
            <ShareButton
              stationId={station.id}
              name={station.name}
              available={products.filter((p) => p.is_available).map((p) => p.product)}
              /* activeTrafficLevel, not the raw column: the raw value survives
                 both the 30-minute expiry and closing time, so «الازدحام: خفيف»
                 could be shared hours after it stopped being true. */
              traffic={activeTrafficLevel(station)}
            />
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
            <StationPoster key={station.slug ?? 'none'} name={station.name} slug={station.slug} />
              </>
            )}

            {view === 'data' && (
              <>
                <section className="card p-5">
                  <h3 className="text-sm font-bold">بيانات الحساب</h3>
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
            <OwnerReminders stationId={station.id} />
            <DeleteAccount phone={station.phone} />
              </>
            )}




            {/* keyed on the slug so the poster redraws when the link changes */}




          </div>
        )}
      </div>
    </main>
  );
}
