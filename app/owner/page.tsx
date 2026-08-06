'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABELS, PRODUCT_ORDER, TRAFFIC_COLORS, TRAFFIC_LABELS } from '@/lib/products';
import { ShareButton } from '@/components/ShareButton';
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
    const { data: st } = await supabase
      .from('stations')
      .select('*')
      .eq('owner_id', uid)
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

  async function toggleProduct(product: FuelProduct, next: boolean) {
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
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id, product }),
      }).catch(() => {});
    }
    setSavingProduct(null);
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
              <p className="mt-0.5 text-sm text-slate-500">{station.address}</p>
            </section>

            <section className="card p-5">
              <h3 className="text-sm font-bold">توفر المنتجات</h3>
              <p className="mt-1 text-xs text-slate-400">
                عند تفعيل منتج يصل تنبيه فوري لمتابعي محطتك
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {PRODUCT_ORDER.map((product) => {
                  const row = products.find((p) => p.product === product);
                  const on = row?.is_available ?? false;
                  return (
                    <li key={product} className="flex items-center justify-between py-2.5">
                      <span className="text-sm font-medium">{PRODUCT_LABELS[product]}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${PRODUCT_LABELS[product]} ${on ? 'متوفر' : 'غير متوفر'}`}
                        disabled={savingProduct === product}
                        onClick={() => toggleProduct(product, !on)}
                        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
                          on ? 'bg-brand' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                            on ? 'right-1' : 'right-7'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
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
