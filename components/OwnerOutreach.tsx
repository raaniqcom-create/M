'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { plural } from '@/lib/freshness';
import {
  daysSince,
  isLinked,
  isStale,
  linkMessage,
  staleMessage,
  stalePush,
  waLink,
  type OutreachRow,
} from '@/lib/outreach';
import { BellRingIcon, SpinnerIcon, WhatsappIcon } from './icons';

/** «متابعة المحطات» — رسالةٌ بالخطوات لمن لم يربط جهازَه، وتنبيهٌ لمن ربطه وتوقّف.
 *
 *  القناتان بحسب ما يصل فعلاً: من **لا جهازَ له** لا يصله إلّا واتساب من هاتف
 *  المدير (الرسالةُ النصّية المدفوعة محبوسةٌ عند المزوّد بلا اسمِ مُرسِل —
 *  ولم تخرج واحدةٌ قطّ). ومن **ربط الجهاز** يصله الإشعارُ على هاتفه وتبقى
 *  الرسالةُ في لوحته — بمسار محادثة الإدارة نفسِه (station_messages + deliver).
 *  ووسمُ «أُرسل» محلّيٌّ على هذا الجهاز لواتساب، ومن المجرى للإشعار. */
export function OwnerOutreach() {
  const [rows, setRows] = useState<OutreachRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_outreach');
    if (error) return setErr(`تعذّر التحميل: ${error.message}`);
    setRows((data ?? []) as OutreachRow[]);
    try {
      setSent(JSON.parse(localStorage.getItem('outreach-sent') ?? '{}'));
    } catch {
      /* لا شيء */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function stamp(id: string, how: string) {
    const next = { ...sent, [id]: `${how} · ${new Date().toLocaleDateString('ar-IQ')}` };
    setSent(next);
    try {
      localStorage.setItem('outreach-sent', JSON.stringify(next));
    } catch {
      /* لا شيء */
    }
  }

  /** إشعارٌ على هاتفه + رسالةٌ في لوحته — مسارُ محادثة الإدارة. */
  async function pushOne(r: OutreachRow): Promise<number | null> {
    const { data, error } = await supabase
      .from('station_messages')
      .insert({ station_id: r.id, sender: 'admin', body: stalePush(r) })
      .select('id')
      .single();
    if (error || !data) return null;
    const res = await callFn<{ sent: number }>(`owner-daily?deliver=${data.id}`);
    return res.ok ? (res.data?.sent ?? 0) : 0;
  }

  async function pushAll(list: OutreachRow[]) {
    if (!confirm(`إرسالُ إشعار «حدّث محطتك» إلى ${plural(list.length, 'محطة واحدة', 'محطتين', 'محطات', 'محطة')} الآن؟`)) return;
    setBusy('all');
    let ok = 0;
    for (const r of list) {
      const n = await pushOne(r);
      if (n !== null) {
        ok++;
        stamp(r.id, 'إشعار');
      }
    }
    setBusy(null);
    setNote(`أُرسل إلى ${ok} من ${list.length}.`);
  }

  if (err) return <p className="card p-4 text-xs text-red-700">{err}</p>;
  if (!rows)
    return (
      <div className="flex justify-center py-8">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </div>
    );

  const unlinked = rows.filter((r) => !isLinked(r));
  const stale = rows.filter(isStale);

  return (
    <div className="space-y-5">
      <Group
        title="لم تربط الجهاز"
        count={unlinked.length}
        hint="لا يصلها إشعارٌ ولا تذكير. القناةُ الوحيدة: واتساب من هاتفك — الرسالةُ جاهزةٌ بالخطوات، تضغط «واتساب» ثمّ «إرسال»."
        empty="كلُّ المحطات المعتمدة مربوطة."
        rows={unlinked}
        open={open}
        setOpen={setOpen}
        sent={sent}
        message={linkMessage}
        actions={(r) => (
          <WaButton r={r} text={linkMessage(r)} onClick={() => stamp(r.id, 'واتساب')} />
        )}
      />

      <Group
        title="مربوطة ومتوقّفة عن التحديث"
        count={stale.length}
        hint="يومان فأكثر بلا تحديث. الإشعارُ يصل هاتفَها وتبقى الرسالةُ في لوحتها — وواتساب بديلٌ من هاتفك."
        empty="كلُّ المربوطة حدّثت خلال يومين."
        rows={stale}
        open={open}
        setOpen={setOpen}
        sent={sent}
        message={staleMessage}
        head={
          stale.length > 0 && (
            <button
              type="button"
              disabled={busy === 'all'}
              onClick={() => pushAll(stale)}
              className="btn-primary w-full disabled:opacity-60"
            >
              {busy === 'all' ? <SpinnerIcon className="h-4 w-4" /> : <BellRingIcon className="h-4 w-4" />}
              أرسل إشعار «حدّث محطتك» للكلّ ({stale.length})
            </button>
          )
        }
        actions={(r) => (
          <>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                const n = await pushOne(r);
                setBusy(null);
                if (n === null) return setNote('تعذّر الإرسال.');
                stamp(r.id, 'إشعار');
                setNote(`أُرسل إلى ${n} ${n === 1 ? 'جهاز' : 'أجهزة'} لـ«${r.name}».`);
              }}
              className="btn-ghost flex-1 px-2 text-xs"
            >
              {busy === r.id ? <SpinnerIcon className="h-4 w-4" /> : <BellRingIcon className="h-4 w-4" />}
              إشعار على هاتفه
            </button>
            <WaButton r={r} text={staleMessage(r)} onClick={() => stamp(r.id, 'واتساب')} />
          </>
        )}
      />

      {note && <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11.5px] font-semibold text-brand-700">{note}</p>}
    </div>
  );
}

function WaButton({ r, text, onClick }: { r: OutreachRow; text: string; onClick: () => void }) {
  const href = waLink(r.phone, text);
  if (!href) return <span className="text-[11px] text-slate-400">رقمٌ غير صالح</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className="btn-primary flex-1 px-2 text-xs">
      <WhatsappIcon className="h-4 w-4" />
      واتساب
    </a>
  );
}

function Group({
  title,
  count,
  hint,
  empty,
  rows,
  open,
  setOpen,
  sent,
  message,
  actions,
  head,
}: {
  title: string;
  count: number;
  hint: string;
  empty: string;
  rows: OutreachRow[];
  open: string | null;
  setOpen: (id: string | null) => void;
  sent: Record<string, string>;
  message: (r: OutreachRow) => string;
  actions: (r: OutreachRow) => React.ReactNode;
  head?: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <h2 className="flex items-center justify-between text-sm font-bold">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${count ? 'bg-amber-100 text-amber-900' : 'bg-brand-50 text-brand-700'}`}>
          {count}
        </span>
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>
      {head && <div className="mt-3">{head}</div>}
      {rows.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-right">
                <p className="text-[13px] font-bold text-slate-800">{r.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {r.city} · {r.contact_name || 'بلا اسم'} · <span dir="ltr">{r.phone}</span>
                  {isLinked(r)
                    ? ` · آخر تحديث منذ ${daysSince(r.last_update) >= 999 ? '—' : plural(daysSince(r.last_update), 'يوم', 'يومين', 'أيام', 'يوماً')}`
                    : ` · بلا جهاز منذ ${plural(daysSince(r.created_at), 'يوم', 'يومين', 'أيام', 'يوماً')}`}
                  {r.seen_suspended > 0 && (
                    <span className="ms-1 font-bold text-traffic-red">· رآها موقوفةً {r.seen_suspended}</span>
                  )}
                  {sent[r.id] && <span className="ms-1 font-bold text-brand-700">· أُرسل {sent[r.id]}</span>}
                </p>
              </button>
              {open === r.id && (
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-[11.5px] leading-relaxed text-slate-700">
                  {message(r)}
                </pre>
              )}
              <div className="mt-2 flex gap-2">{actions(r)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
