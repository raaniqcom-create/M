'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { num } from '@/lib/num';
import { bgdDate, iqd, limitLabel, ratingLine } from '@/lib/wash';
import { SpinnerIcon } from './icons';

interface Dash {
  created: number;
  completed: number;
  cancelled: number;
  no_show: number;
  expired: number;
  walk_in: number;
  revenue: number;
  avg_value: number;
  repeat_customers: number;
  rating_avg: number | null;
  rating_n: number;
  views: number;
  calls: number;
  routes: number;
  subscription: { plan: string; paid_until: string | null; days_left: number | null; used_bookings: number; limit: number };
}

type Range = 'today' | 'yesterday' | '7' | '30' | 'month';
const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: '7', label: '7 أيام' },
  { key: '30', label: '30 يوماً' },
  { key: 'month', label: 'شهر' },
];

function bounds(r: Range, month: string): { from: string; to: string } {
  if (r === 'today') return { from: bgdDate(0), to: bgdDate(0) };
  if (r === 'yesterday') return { from: bgdDate(-1), to: bgdDate(-1) };
  if (r === '7') return { from: bgdDate(-6), to: bgdDate(0) };
  if (r === '30') return { from: bgdDate(-29), to: bgdDate(0) };
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** لوحةُ صاحب المغسلة (§28–30): قمعُ الحجوزات والإيرادُ والزبائنُ والتقييمُ والمشاهدات — بفلاتر الفترة. */
export function WashDashboard({ washId }: { washId: string }) {
  const [range, setRange] = useState<Range>('7');
  const [month, setMonth] = useState(bgdDate(0).slice(0, 7));
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { from, to } = bounds(range, month);
    const { data, error } = await supabase.rpc('wash_dashboard', { p_wash: washId, p_from: from, p_to: to });
    if (error) return setErr(error.message);
    setD(data as Dash);
  }, [washId, range, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}٪` : '—');

  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold ${range === r.key ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {range === 'month' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="field" dir="ltr" aria-label="الشهر" />}
      {err && <p role="alert" className="text-xs text-traffic-red">{err}</p>}
      {!d ? (
        <SpinnerIcon className="mx-auto h-5 w-5 text-brand" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'حجوزات', value: num(d.created) },
              { label: 'مكتملة', value: num(d.completed), tone: true },
              { label: 'الإيراد', value: iqd(d.revenue) },
              { label: 'إكمال', value: pct(d.completed, d.created) },
              { label: 'إلغاء', value: pct(d.cancelled, d.created) },
              { label: 'غياب', value: pct(d.no_show, d.created) },
              { label: 'متوسّط الحجز', value: iqd(d.avg_value) },
              { label: 'زبائن عائدون', value: num(d.repeat_customers) },
              { label: 'بلا حجز', value: num(d.walk_in) },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl py-2.5 text-center ${s.tone ? 'bg-brand-50' : 'bg-slate-50'}`}>
                <p className={`text-[15px] font-extrabold leading-none tabular-nums ${s.tone ? 'text-brand-700' : 'text-slate-700'}`}>{s.value}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-slate-600">
            {ratingLine(d.rating_avg, d.rating_n) ?? 'لا تقييمات بعد'} · مشاهداتُ الصفحة {num(d.views)} · اتصال {num(d.calls)} · طريق {num(d.routes)}
          </p>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            حجوزاتُ هذا الشهر {num(d.subscription.used_bookings)} من {limitLabel(d.subscription.limit, 'حجز')}
            {d.subscription.days_left != null ? ` · بقي من الاشتراك ${d.subscription.days_left} يوماً` : ''}
          </p>
        </>
      )}
    </div>
  );
}
