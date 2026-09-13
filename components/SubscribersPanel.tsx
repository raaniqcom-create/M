'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { ageLabel } from '@/lib/hours';
import { whatsappLink } from '@/lib/phone';
import { SpinnerIcon } from './icons';

type Channel = 'telegram' | 'whatsapp' | 'sms';

interface Sub {
  channel: Channel;
  address: string;
  ident: string;
  name: string | null;
  why: string;
  city: string | null;
  since: string | null;
  last_seen: string | null;
  unread: number;
}

interface Msg {
  id: string;
  sender: 'admin' | 'user';
  body: string;
  delivered_at: string | null;
  error: string | null;
  read_at: string | null;
  created_at: string;
}

const CHANNEL: Record<Channel, { label: string; cls: string; note: string; max: number }> = {
  telegram: {
    label: 'تيليجرام',
    cls: 'bg-sky-50 text-sky-700',
    note: 'تصل فوراً داخل البوت. يردّ المشترك بالضغط على «ردّ» فوق رسالتك، فيظهر ردُّه هنا.',
    max: 2000,
  },
  whatsapp: {
    label: 'واتساب',
    cls: 'bg-brand-50 text-brand-700',
    note: 'تصل فقط إن راسل البوت خلال آخر ٢٤ ساعة — وإلّا ترفضها ميتا. ردودُه تبقى في محادثة البوت.',
    max: 2000,
  },
  sms: {
    label: 'رسائل SMS',
    cls: 'bg-amber-50 text-amber-700',
    note: 'رسالةٌ نصّية تُحتسب من رصيد OTPIQ — حتى ٣٠٠ حرف، ولا ردَّ عليها هنا.',
    max: 300,
  },
};

/** «المشتركون+» — من فتح البوت أو راسل واتساب أو اشترك بالعروض، بأسمائهم
 *  ومعرّفاتهم وسبب تسجيلهم، ومحادثةٌ داخليّة مع كلٍّ منهم.
 *
 *  القائمةُ من `admin_subscribers()` (للمدير وحدَه — الأرقامُ لا تُعرض لغيره)،
 *  والمحادثةُ صفوفُ `subscriber_messages`: تكتب الإدارةُ الصفَّ ثمّ تطلب من
 *  broadcast?action=dm إرسالَه بقناته، فيُختم «وصلت» أو «لم تصل — السبب». */
export function SubscribersPanel({ onRead }: { onRead?: () => void }) {
  const [rows, setRows] = useState<Sub[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Sub | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_subscribers', { p_channel: channel });
    if (error) {
      setErr(error.code === '42501' ? 'هذه القائمة للإدارة فقط.' : 'تعذّر جلبُ المشتركين.');
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data ?? []) as Sub[]);
  }, [channel]);
  useEffect(() => {
    void load();
  }, [load]);

  if (open) {
    return (
      <Thread
        sub={open}
        onBack={() => {
          setOpen(null);
          void load();
          onRead?.();
        }}
      />
    );
  }

  const needle = q.trim();
  const shown = (rows ?? []).filter(
    (r) => !needle || [r.ident, r.name, r.city, r.address].some((v) => v && v.includes(needle))
  );

  return (
    <div className="space-y-3">
      <section className="card p-4">
        <h2 className="text-sm font-bold">المشتركون+ {rows && <span className="text-slate-400">({rows.length})</span>}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          من فتح البوت أو راسل واتساب أو اشترك بالعروض — بأسمائهم ومعرّفاتهم وسبب تسجيلهم. الأرقامُ هنا للإدارة وحدَها.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {([null, 'telegram', 'whatsapp', 'sms'] as (Channel | null)[]).map((c) => (
            <button
              key={String(c)}
              type="button"
              onClick={() => setChannel(c)}
              aria-pressed={channel === c}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-bold ${
                channel === c ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600'
              }`}
            >
              {c ? CHANNEL[c].label : 'الكلّ'}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="field mt-3"
          placeholder="بحث بالاسم أو الرقم أو المعرّف"
        />
      </section>

      {err && <p className="card p-4 text-center text-xs text-red-700">{err}</p>}
      {rows === null ? (
        <div className="flex justify-center py-6">
          <SpinnerIcon className="h-6 w-6 text-brand" />
        </div>
      ) : shown.length === 0 ? (
        !err && <p className="card p-4 text-center text-xs text-slate-400">لا مشتركين في هذا النطاق.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={`${r.channel}:${r.address}`} className="card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-slate-800">
                  <span className="truncate">{r.name || '—'}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${CHANNEL[r.channel].cls}`}>
                    {CHANNEL[r.channel].label}
                  </span>
                  {r.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-traffic-red px-1.5 py-px text-[10px] font-extrabold text-white">
                      {r.unread}
                    </span>
                  )}
                </p>
                <span dir="ltr" className="shrink-0 font-mono text-[11.5px] text-slate-500">
                  {r.ident}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-600">
                سبب التسجيل: <b>{r.why}</b>
                {r.city && ` · ${r.city}`}
              </p>
              <p className="mt-0.5 text-[10.5px] text-slate-400">
                انضمّ {ageLabel(r.since)}
                {r.last_seen && ` · آخر ظهور ${ageLabel(r.last_seen)}`}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setOpen(r)} className="btn-ghost flex-1 py-1.5 text-xs">
                  تواصل
                </button>
                {r.channel !== 'telegram' && (
                  <a
                    href={whatsappLink(r.address, r.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost flex-1 py-1.5 text-xs"
                  >
                    واتساب ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thread({ sub, onBack }: { sub: Sub; onBack: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = CHANNEL[sub.channel];

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('subscriber_messages')
      .select('id, sender, body, delivered_at, error, read_at, created_at')
      .eq('channel', sub.channel)
      .eq('address', sub.address)
      .order('created_at', { ascending: false })
      .limit(50);
    const list = ((data ?? []) as Msg[]).reverse();
    setMsgs(list);
    // ما كتبه هو ولم يُقرأ — يُختم مقروءاً بفتح المحادثة.
    const unread = list.filter((m) => m.sender === 'user' && !m.read_at).map((m) => m.id);
    if (unread.length) {
      await supabase.from('subscriber_messages').update({ read_at: new Date().toISOString() }).in('id', unread);
    }
  }, [sub.channel, sub.address]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('subscriber_messages')
      .insert({ channel: sub.channel, address: sub.address, sender: 'admin', body: text })
      .select('id')
      .single();
    if (error || !data) {
      setBusy(false);
      return;
    }
    setBody('');
    await load();
    await callFn('broadcast', { action: 'dm', id: data.id });
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="btn-ghost shrink-0 px-3 py-2 text-xs">
          ‹ المشتركون
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold">{sub.name || sub.ident}</h2>
          <p className="text-[11px] text-slate-500">
            {meta.label} · <span dir="ltr">{sub.ident}</span>
          </p>
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">{meta.note}</p>

      <div className="card space-y-2 p-3">
        {msgs === null ? (
          <div className="flex justify-center py-4">
            <SpinnerIcon className="h-5 w-5 text-brand" />
          </div>
        ) : msgs.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">لا رسائل بعد.</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                  m.sender === 'admin' ? 'bg-brand-50 text-brand-900' : 'bg-slate-100 text-slate-800'
                }`}
              >
                <p className="text-[10px] font-bold opacity-60">{m.sender === 'admin' ? 'نحن' : 'هو'} · {ageLabel(m.created_at)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.sender === 'admin' && (
                  <p className={`mt-1 text-[10px] font-bold ${m.error ? 'text-red-700' : m.delivered_at ? 'text-brand-700' : 'text-slate-400'}`}>
                    {m.error ? `✗ لم تصل — ${m.error}` : m.delivered_at ? '✓ وصلت' : '⏳ تُرسل…'}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, meta.max))}
          rows={3}
          className="field py-2"
          placeholder="اكتب رسالتك…"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10.5px] text-slate-400">
            {body.length} / {meta.max}
          </span>
          <button type="button" onClick={send} disabled={!body.trim() || busy} className="btn-primary px-6 disabled:opacity-40">
            {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'إرسال'}
          </button>
        </div>
      </div>
    </div>
  );
}
