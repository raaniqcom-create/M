'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { pokeWashTick } from '@/lib/washConfig';
import { displayPhone } from '@/lib/phone';
import { BOOKING_LABELS, iqd, whatsappBooking, type BookingStatus } from '@/lib/wash';
import { RouteButton } from './RouteButton';
import { SpinnerIcon, WhatsappIcon, XIcon } from './icons';

type Booking = {
  id: string;
  code: string;
  status: BookingStatus;
  starts_at: string;
  service: string;
  price: number;
  use_free: boolean;
  name: string;
  car: string | null;
  wash: string;
  wash_id: string;
  address: string;
  lat: number;
  lng: number;
  wash_phone: string | null;
  vehicle: string | null;
  late: boolean;
  cancel_free_min: number;
  events: { kind: string; at: string }[];
};

const PILL: Record<BookingStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  confirmed: 'bg-brand-50 text-brand-700',
  arrived: 'bg-sky-50 text-sky-800',
  in_service: 'bg-sky-50 text-sky-800',
  completed: 'bg-slate-100 text-slate-600',
  no_show: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-slate-100 text-slate-600',
  cancelled_by_business: 'bg-red-50 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
};
/** سطرُ السجلّ كما يقرؤه الزبون. */
const EVENT_LINE: Record<string, string> = {
  new: 'أُرسل الحجز',
  confirmed: 'أكّدت المغسلة',
  arrived: 'سُجّل وصولك',
  in_service: 'بدأ الغسل',
  completed: 'اكتملت الخدمة',
  no_show: 'سُجّل غياب',
  cancelled: 'ألغيتَ الحجز',
  cancelled_by_business: 'ألغت المغسلة الحجز',
  expired: 'فات الموعد بلا تأكيد',
  reminder: 'أُرسل تذكير',
};
const fmtAt = (iso: string) => new Date(iso).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });

/** بطاقةُ الحجز: الرمزُ الذي يُرى للعامل، وحالتُه، وما يُفعل به. */
export function WashBookingScreen() {
  const params = useSearchParams();
  const code = (params.get('code') ?? '').trim();
  const phone = displayPhone(params.get('p') ?? '');
  const [b, setB] = useState<Booking | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!code || !phone) return setB(null);
    let alive = true;
    supabase.rpc('wash_booking_by_code', { p_code: code, p_phone: phone }).then(({ data }) => {
      if (alive) setB((data as Booking | null) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [code, phone]);

  async function cancel() {
    const left = b ? Date.parse(b.starts_at) - Date.now() : 0;
    const late = b ? left < b.cancel_free_min * 60_000 : false;
    if (!confirm(late ? `الإلغاء الآن يُحسب متأخّراً (أقلّ من ${b?.cancel_free_min} دقيقة قبل الموعد). إلغاء الحجز؟` : 'إلغاء الحجز؟')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('cancel_wash_booking', { p_code: code, p_phone: phone });
    if (error || !data) {
      setBusy(false);
      return setErr(error?.message ?? 'تعذّر الإلغاء.');
    }
    pokeWashTick();
    window.location.reload();
  }

  if (b === undefined) {
    return (
      <main className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }
  if (b === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لم نجد هذا الحجز. <a href="/wash/" className="font-bold text-brand underline">دليل المغاسل</a>
      </main>
    );
  }

  const when = new Date(b.starts_at).toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const live = (b.status === 'pending' || b.status === 'confirmed') && new Date(b.starts_at).getTime() > Date.now();

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <a href={`/wash/detail/?id=${b.wash_id}`} className="text-[12px] font-bold text-brand-700">
        ← {b.wash}
      </a>

      <article className="card mt-3 p-5 text-center">
        <p className="text-[11px] font-bold text-slate-400">رمز الحجز</p>
        <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.2em] text-brand-900" dir="ltr">
          {b.code}
        </p>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[12px] font-bold ${PILL[b.status]}`}>
          {b.status === 'pending' ? 'بانتظار تأكيد المغسلة' : BOOKING_LABELS[b.status]}
        </span>

        <dl className="mt-5 space-y-2.5 text-right text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">المغسلة</dt>
            <dd className="text-left font-bold text-slate-800">{b.wash}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">العنوان</dt>
            <dd className="text-left font-bold text-slate-800">{b.address}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">الخدمة</dt>
            <dd className="text-left font-bold text-slate-800">
              {b.service} · {b.use_free ? 'مجّانيّة 🎁' : iqd(b.price)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">الموعد</dt>
            <dd className="text-left font-bold text-slate-800">{when}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-800">أرِ الرمز للعامل عند الوصول</p>

        <div className="mt-4 space-y-2">
          {b.wash_phone && (
            <a
              href={whatsappBooking(b.wash_phone, {
                code: b.code,
                name: b.name,
                service_name: b.service,
                starts_at: b.starts_at,
                car: b.car,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full"
            >
              <WhatsappIcon className="h-4 w-4" />
              أبلغ المغسلة عبر واتساب
            </a>
          )}
          <RouteButton lat={b.lat} lng={b.lng} />
          {live && (
            <button type="button" onClick={cancel} disabled={busy} className="btn w-full text-red-700 active:bg-red-50">
              {busy ? <SpinnerIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
              إلغاء الحجز
            </button>
          )}
          {live && <p className="text-center text-[11px] text-slate-400">الإلغاء مجّانيّ قبل الموعد بـ{b.cancel_free_min} دقيقة على الأقلّ.</p>}
          {b.events?.length > 1 && (
            <ol className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {b.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{EVENT_LINE[e.kind] ?? e.kind}</span>
                  <span dir="ltr">{fmtAt(e.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        {err && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
            {err}
          </p>
        )}
      </article>
    </main>
  );
}
