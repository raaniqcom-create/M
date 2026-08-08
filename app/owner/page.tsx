'use client';

import { useCallback, useEffect, useState } from 'react';
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

    if (next) {
      // fire-and-forget: a failed push must not block the toggle
      // Supabase edge function rather than a Next.js route: the site is served
      // as static files and has no server of its own.
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ stationId: station.id, product }),
      }).catch(() => {});
    }
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
        <h1 className="text-lg font-extrabold text-brand">لوحة صاحب المحطة</h1>
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
            </section>

            <WorkingHours
              station={station}
              onChange={(patch) => setStation({ ...station, ...patch })}
            />

            <OwnerReminders stationId={station.id} />

            <StationLinkCard
              stationId={station.id}
              name={station.name}
              slug={station.slug}
              onSlugChange={(slug) => setStation({ ...station, slug })}
            />

            {/* keyed on the slug so the poster redraws when the link changes */}
            <StationPoster key={station.slug ?? 'none'} name={station.name} slug={station.slug} />

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

            <section className="card p-5">
              <h3 className="text-sm font-bold">حالة الازدحام</h3>
              <p className="mt-1 text-xs text-slate-400">
                تحديدك يظهر للمستخدمين بدل متوسط تصويتهم. اضغط مرة أخرى للإلغاء.
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

            {/* sits after the toggles so it reflects what was just switched on */}
            <AvailabilityPoster
              name={station.name}
              slug={station.slug}
              products={products.filter((p) => p.is_available).map((p) => p.product)}
            />

            <ShareButton
              stationId={station.id}
              name={station.name}
              available={products.filter((p) => p.is_available).map((p) => p.product)}
              traffic={station.manual_traffic_level}
            />
          </div>
        )}
      </div>
    </main>
  );
}
