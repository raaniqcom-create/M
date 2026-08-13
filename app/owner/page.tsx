'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  PRODUCT_LABELS,
  PRODUCT_ORDER,
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
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState<FuelProduct | null>(null);
  const [view, setView] = useState<'main' | 'info' | 'data'>('main');

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
      const { data: pr } = await supabase
        .from('station_products')
        .select('*')
        .eq('station_id', st.id);
      setProducts(pr ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login');
        return;
      }
      setUserId(data.user.id);
      load(data.user.id);
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
    // notifications, and the driver who receives five buzzes in ten seconds
    // deletes the app — which costs us every future alert, not just these.
    // The announcement belongs to the confirm button, once, for all of them.
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

  async function confirmAvailability() {
    if (!station) return;
    const now = new Date().toISOString();
    await supabase
      .from('station_products')
      .update({ updated_at: now })
      .eq('station_id', station.id);
    setConfirmedAt(now);

    // One message for everything that is in stock, sent when the owner says
    // the board is right — not on every tap while they are still deciding.
    const available = products.filter((p) => p.is_available).map((p) => p.product);
    if (available.length) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ stationId: station.id, products: available }),
      }).catch(() => {});
    }

    posterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function toggleTempClose() {
    if (!station) return;
    const next = !station.temp_closed;
    setStation({ ...station, temp_closed: next });
    await supabase.from('stations').update({ temp_closed: next }).eq('id', station.id);
  }

  async function setTraffic(level: TrafficLevel) {
    if (!station) return;
    const next = station.manual_traffic_level === level ? null : level;
    setStation({ ...station, manual_traffic_level: next });
    await supabase
      .from('stations')
      .update({ manual_traffic_level: next, manual_traffic_set_at: new Date().toISOString() })
      .eq('id', station.id);
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
          <a href="/?view=driver" className="text-[11px] font-bold text-slate-400">
            عرض المنصة كسائق ↗
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
                  ⛔ مغلقة مؤقتاً — لا تظهر كمفتوحة للسائقين
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
                أنت الوحيد الذي يرى ساحتك. تحديدك يظهر للسائقين بدل تصويتهم، ويبقى حتى تغيّره —
                وتصويت السائقين يسقط بعد ٣٠ دقيقة. اضغط مرة أخرى للإلغاء.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {LEVELS.map((level) => {
                  const active = station.manual_traffic_level === level;
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
            <section className="card p-5">
              <h3 className="text-sm font-bold">تأكيد ونشر التوفّر</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                بعد ضبط المنتجات أعلاه، أكّد القائمة: يُختم الوقت، ويصل للسائقين إشعار
                واحد يجمع كل المنتجات المتوفرة، ويجهز المنشور للنشر.
              </p>
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
              traffic={station.manual_traffic_level}
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
                    محطة يعتمد عليها السائقون دون مراجعة.
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
