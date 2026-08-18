'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isFresh, isOpenNow } from '@/lib/hours';
import { SpinnerIcon } from './icons';
import { KIND_LABELS, KIND_STYLES } from '@/lib/stationMeta';
import type { Station } from '@/types/database';

interface CityRow {
  city: string;
  people: number;
  ios: number;
  android: number;
  web: number;
}

interface Row extends Station {
  station_products: { updated_at: string | null }[];
}

/** What the admin needs to know before deciding anything: who is out there,
 *  and which stations are actually doing the one job they signed up for.
 *
 *  "Committed" is deliberately measured, not declared. A station that set
 *  opening hours and never touches the app is worse than one that never set
 *  them — the driver reads its hours, drives over, and finds a claim nobody
 *  has stood behind since last week. So the number that matters is: is it open
 *  right now by its own hours, and has anyone updated it inside the freshness
 *  window the app itself uses to decide what to show. */
export function AdminStats() {
  const [devices, setDevices] = useState<Record<string, number> | null>(null);
  const [listeners, setListeners] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [byCity, setByCity] = useState<CityRow[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    // device_tokens and alerts grant SELECT to nobody — reading them from the
    // browser returned [] and the whole panel showed zeros. The counts come
    // from a security-definer function that hands back numbers only: the admin
    // never needs a device token or a push endpoint, so nobody gets one.
    // Retried, because one dropped request used to blank the whole panel.
    // «TypeError: Load failed» is a fetch that never arrived, not a rejection
    // by the database — and on a weak connection it is ordinary. Reporting it
    // as zeros is worse than the failure: nothing on screen distinguishes
    // "nobody has subscribed" from "the answer never came back".
    const attempt = async <T,>(run: () => PromiseLike<T>): Promise<T> => {
      let last: T | undefined;
      for (let i = 0; i < 3; i++) {
        last = await run();
        if (!(last as { error?: unknown }).error) return last;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
      return last as T;
    };

    const [stats, s] = await Promise.all([
      attempt(() => supabase.rpc('admin_stats')),
      attempt(() =>
        supabase
          .from('stations')
          .select('*, station_products(updated_at)')
          .in('status', ['approved', 'suspended'])
      ),
    ]);

    if (stats.error) {
      // The old message blamed the admin's account for every failure. It is
      // wrong for most of them: this panel only renders after the page guard
      // has already confirmed the role, so "you are not an admin" is the one
      // explanation that cannot be true here. Say what the database said.
      const e = stats.error;
      setFailed(
        e.code === '42501'
          ? 'قاعدة البيانات رفضت الطلب لهذا الحساب (42501). سجّل الخروج ثم الدخول من جديد.'
          : e.code === 'PGRST202'
            ? 'دالة الإحصائيات غير موجودة على الخادم (admin_stats).'
            : e.message?.includes('Load failed') || e.message?.includes('Failed to fetch')
            ? 'لم يصل الطلب إلى الخادم. تحقّق من الاتصال ثم أعد المحاولة — الأرقام أدناه غير صحيحة.'
            : `تعذّرت قراءة الأرقام — ${e.code ?? 'خطأ'}: ${e.message ?? 'سبب غير معروف'}`
      );
      setDevices({});
      setListeners({});
    } else {
      const v = stats.data as {
        devices: Record<string, number>;
        listeners: Record<string, number>;
        byCity?: CityRow[];
      };
      setFailed(null);
      setDevices(v?.devices ?? {});
      setListeners(v?.listeners ?? {});
      setByCity(v?.byCity ?? []);
    }
    setRows((s.data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Engagement, measured rather than declared.
   *
   *  There is no history table — station_products carries a single updated_at
   *  per row — so this is recency, and the column says so rather than implying
   *  a streak it cannot prove. Daily is the job. Every other day is drifting.
   *  Two days of silence means the station's page is telling people something
   *  nobody has stood behind since, which is worse than an empty listing.
   *
   *  Sorted worst first: an admin opens this to find who needs a phone call,
   *  not to read an alphabet. */
  const HOUR = 3600_000;
  const PULSE_ORDER = { red: 0, amber: 1, green: 2 } as const;
  const commitment = (rows ?? [])
    .filter((s) => s.status === 'approved')
    .map((s) => {
      const stamps = s.station_products
        .map((p) => (p.updated_at ? new Date(p.updated_at).getTime() : 0))
        .filter(Boolean);
      const last = stamps.length ? Math.max(...stamps) : 0;
      const hours = last ? (Date.now() - last) / HOUR : Infinity;
      // The four product rows are seeded at registration and carry that
      // moment, so "added products" is not "has rows" — it is the owner
      // coming back and touching them afterwards.
      const added = last > new Date(s.created_at).getTime() + 5 * 60_000;
      const pulse: 'green' | 'amber' | 'red' = !added
        ? 'red'
        : hours <= 24
          ? 'green'
          : hours <= 48
            ? 'amber'
            : 'red';
      return { s, added, hours, pulse };
    })
    .sort(
      (a, b) =>
        PULSE_ORDER[a.pulse] - PULSE_ORDER[b.pulse] ||
        a.s.city.localeCompare(b.s.city, 'ar')
    );

  const since = (h: number) =>
    h === Infinity ? 'لم يُلمس' : h < 1 ? 'الآن' : h < 24 ? `${Math.round(h)} ساعة` : `${Math.floor(h / 24)} يوم`;

  if (!rows || !devices || !listeners) {
    return (
      <div className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  const ios = devices.ios ?? 0;
  const android = devices.android ?? 0;
  const web = listeners.web ?? 0;
  const subscribed = (listeners.ios ?? 0) + (listeners.android ?? 0) + web;

  const open = rows.filter((s) => isOpenNow(s));
  const updatedToday = rows.filter((s) =>
    (s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  // open by its own declared hours AND standing behind what it published
  const committed = rows.filter(
    (s) => isOpenNow(s) && (s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  const silent = rows.filter(
    (s) => !(s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  const tempClosed = rows.filter((s) => s.temp_closed);

  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);

  return (
    <div className="space-y-4">
      {failed && (
        <div className="card p-4">
          <p className="text-xs leading-relaxed text-traffic-red">{failed}</p>
          <button type="button" onClick={load} className="btn-ghost mt-3 w-full text-xs">
            إعادة المحاولة
          </button>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-bold">المستخدمون</h2>
        <p className="mt-1 text-xs text-slate-400">أجهزة سجّلت نفسها في النظام</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="آيفون" value={ios} />
          <Stat label="أندرويد" value={android} />
          <Stat label="متصفح" value={web} />
        </div>
        <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
          <strong>{subscribed}</strong> منهم فعّلوا التنبيهات واختاروا مدينتهم ونوع الوقود —
          وهؤلاء وحدهم من يصلهم الإشعار.
          {ios + android > 0 && subscribed < ios + android && (
            <>
              {' '}
              <strong>{ios + android + web - subscribed}</strong> نزّلوا ولم يختاروا بعد.
            </>
          )}
        </p>
      </section>

      {commitment.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-bold">المحطات المعتمدة والتزامها</h2>
          <p className="mt-1 text-xs text-slate-400">
            الأحوج إلى متابعة أولاً — التفاعل يُقاس بآخر تحديث للمنتجات
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 text-start font-semibold">المحطة</th>
                  <th className="pb-2 text-start font-semibold">المدينة</th>
                  <th className="pb-2 text-center font-semibold">النوع</th>
                  <th className="pb-2 text-center font-semibold">المنتجات</th>
                  <th className="pb-2 text-start font-semibold">التفاعل</th>
                </tr>
              </thead>
              <tbody>
                {commitment.map(({ s, added, hours, pulse }) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pe-2 font-bold text-slate-700">{s.name}</td>
                    <td className="py-2 pe-2 text-slate-500">{s.city}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[s.kind]}`}
                      >
                        {KIND_LABELS[s.kind]}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      {added ? (
                        <span className="font-bold text-traffic-green">✓</span>
                      ) : (
                        <span className="font-bold text-traffic-red">✗</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            pulse === 'green'
                              ? 'bg-traffic-green'
                              : pulse === 'amber'
                                ? 'bg-traffic-yellow'
                                : 'bg-traffic-red'
                          }`}
                        />
                        <span className="text-slate-500">{since(hours)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            <span className="font-bold text-traffic-green">●</span> حدّث خلال يوم ·{' '}
            <span className="font-bold text-traffic-yellow">●</span> يوم ويوم ·{' '}
            <span className="font-bold text-traffic-red">●</span> يومان فأكثر أو لم يضف منتجاته
          </p>
        </section>
      )}

      {byCity.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-bold">المشتركون حسب المدينة</h2>
          <p className="mt-1 text-xs text-slate-400">
            من فعّل التنبيهات في كل مدينة — وهؤلاء من يصلهم إشعارها
          </p>

          {/* الشخص الواحد له صفّ لكل (مدينة، منتج)، فالعدّ بالعناوين المتمايزة
              لا بالصفوف — وإلا تضاعف الرقم أضعافاً بلا معنى. */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 text-start font-semibold">المدينة</th>
                  <th className="pb-2 text-center font-semibold">الكل</th>
                  <th className="pb-2 text-center font-semibold">آيفون</th>
                  <th className="pb-2 text-center font-semibold">أندرويد</th>
                  <th className="pb-2 text-center font-semibold">متصفح</th>
                </tr>
              </thead>
              <tbody>
                {byCity.map((c) => (
                  <tr key={c.city} className="border-t border-slate-100">
                    <td className="py-2 font-bold text-slate-700">{c.city}</td>
                    <td className="py-2 text-center text-base font-extrabold text-brand-700" dir="ltr">
                      {c.people}
                    </td>
                    <td className="py-2 text-center text-slate-600" dir="ltr">{c.ios}</td>
                    <td className="py-2 text-center text-slate-600" dir="ltr">{c.android}</td>
                    <td className="py-2 text-center text-slate-600" dir="ltr">{c.web}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-bold">المحطات</h2>
        <p className="mt-1 text-xs text-slate-400">
          من أصل {rows.length} محطة معتمدة
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="مفتوحة الآن" value={open.length} />
          <Stat label="حدّثت اليوم" value={updatedToday.length} />
          <Stat label="ملتزمة" value={committed.length} tone="brand" />
        </div>

        <div className="mt-4 space-y-2">
          <Bar label="ملتزمة — مفتوحة ومحدَّثة" n={committed.length} pct={pct(committed.length)} tone="brand" />
          <Bar label="لم تحدّث منذ أكثر من يوم" n={silent.length} pct={pct(silent.length)} tone="red" />
          <Bar label="مغلقة مؤقتاً بإعلانها" n={tempClosed.length} pct={pct(tempClosed.length)} tone="slate" />
        </div>

        {silent.length > 0 && (
          <>
            <p className="mt-4 text-xs font-bold text-slate-700">تحتاج اتصالاً:</p>
            <ul className="mt-2 space-y-1.5">
              {silent.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <a href={`/admin/station/?id=${s.id}`} className="font-semibold text-brand-700 underline">
                    {s.name}
                  </a>
                  <span className="shrink-0 text-slate-400" dir="ltr">
                    {s.phone}
                  </span>
                </li>
              ))}
            </ul>
            {silent.length > 8 && (
              <p className="mt-2 text-[11px] text-slate-400">و{silent.length - 8} غيرها</p>
            )}
          </>
        )}

        {rows.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">لا توجد محطات معتمدة بعد</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brand' }) {
  return (
    <div className={`rounded-xl py-2.5 text-center ${tone === 'brand' ? 'bg-brand-50' : 'bg-slate-50'}`}>
      <p className={`text-lg font-extrabold leading-none ${tone === 'brand' ? 'text-brand-700' : 'text-slate-700'}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function Bar({ label, n, pct, tone }: { label: string; n: number; pct: number; tone: 'brand' | 'red' | 'slate' }) {
  const fill = tone === 'brand' ? 'bg-brand' : tone === 'red' ? 'bg-traffic-red' : 'bg-slate-300';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-400">
          {n} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
