'use client';

import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { pokeWashTick } from '@/lib/washConfig';
import { displayPhone } from '@/lib/phone';
import {
  BOOKING_LABELS,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  at12,
  bookingHref,
  dateLine,
  iqd,
  vehicleArt,
  vehicleImg,
  whatsappBooking,
  type BookingStatus,
  type VehicleType,
} from '@/lib/wash';
import { RouteButton } from './RouteButton';
import { CalendarIcon, SpinnerIcon, WhatsappIcon, XIcon } from './icons';

/** نوعٌ معروفٌ أو «أخرى» — القاعدةُ قد تعيد null أو نوعاً قديماً لا نعرفه. */
export const asVehicle = (v: string | null | undefined): VehicleType =>
  (VEHICLE_TYPES as readonly string[]).includes(v ?? '') ? (v as VehicleType) : 'other';

/** صورةُ نوع السيارة: الصورةُ الحقيقيّة (png) إن وُضعت في public/vehicles/، وإلّا الرسمُ (svg).
 *  السقوطُ يتمّ مرّةً واحدة (شرطُ الامتداد) كي لا يدور onError بلا نهاية إن غاب الاثنان. */
export function CarThumb({ vehicle, className = 'h-9 w-9' }: { vehicle: string | null | undefined; className?: string }) {
  const v = asVehicle(vehicle);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={vehicleImg(v)}
      alt={VEHICLE_LABELS[v]}
      loading="lazy"
      onError={(e) => {
        const el = e.currentTarget;
        if (el.src.endsWith('.png')) el.src = vehicleArt(v);
      }}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

/**
 * RouteButton (Waze/Google) بوسمٍ غيرِ وسمه: نصُّه وأيقونتُه يُخفيان ويُرسم فوقه ما نُمرّر.
 * ponytail: يُحذف كلُّه حين يقبل RouteButton خاصيّةَ label — ملفُّه ليس من ملفّات قسم الغسيل.
 */
export function RouteCell({ lat, lng, compact, labelClass, className, children, ...rest }: { lat: number; lng: number; compact?: boolean; labelClass?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`relative [&>div]:h-full [&>div>button]:h-full [&>div>button]:text-[0px] [&>div>button>svg]:hidden ${className ?? ''}`}>
      <RouteButton lat={lat} lng={lng} compact={compact} />
      <span aria-hidden className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-1 ${labelClass ?? ''}`}>
        {children}
      </span>
    </div>
  );
}

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
  reviewed: boolean;
  events: { kind: string; at: string }[];
  /** سياراتُ الطلب الواحد: المفتاحُ المشترك ورموزُ الإخوة بالترتيب (يشمل هذا الرمز). */
  group_key: string | null;
  group_codes: string[] | null;
};

/** بعد اكتمال الخدمة: خمسُ نجومٍ وتعليقٌ اختياريّ — مرّةً واحدة للحجز. */
function ReviewBox({ code, phone, onDone }: { code: string; phone: string; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function send() {
    if (!stars) return setErr('اختر عدد النجوم.');
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('review_wash', { p_code: code, p_phone: phone, p_stars: stars, p_comment: comment.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-sm font-extrabold text-slate-800">قيّم تجربتك</p>
      <div className="mt-2 flex justify-center gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} نجوم`} className={`text-3xl ${n <= stars ? 'text-amber-500' : 'text-slate-300'}`}>
            ★
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} rows={2} className="field mt-2 text-sm" placeholder="تعليق اختياريّ (200 حرف)" />
      {err && <p role="alert" className="mt-1 text-[11px] text-traffic-red">{err}</p>}
      <button type="button" disabled={busy} onClick={send} className="btn-primary mt-2 w-full text-xs">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : 'إرسال التقييم'}
      </button>
    </div>
  );
}

/** ألوانُ حالة الحجز — تشاركها بطاقةُ الحجز و«حجوزاتي». */
export const BOOKING_PILL: Record<BookingStatus, string> = {
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
const fmtAt = (iso: string) => `${dateLine(iso, { day: 'numeric', month: 'numeric' })} ${at12(iso)}`;

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

  /** إلغاءُ سيّارات الطلب كلِّها بنداءٍ واحد — الرموزُ الأخرى تتبع المفتاحَ لا الرمز.
   *  ‎group_codes بلا حالات، فلا عددَ في السؤال: القاعدةُ لا تُلغي إلّا ما زال نشطاً. */
  async function cancelGroup(group: string) {
    if (!confirm('إلغاء كلّ سيّارات هذا الطلب؟')) return;
    setBusy(true);
    // ترجع عدداً؛ و0 (هاتفٌ لا يطابق أو موعدٌ فات) لا يرفع استثناءً — فلا نُعيد التحميل بصمت.
    const { data, error } = await supabase.rpc('cancel_wash_group', { p_group: group, p_phone: phone });
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

  const when = `${dateLine(b.starts_at)} · ${at12(b.starts_at)}`;
  const live = (b.status === 'pending' || b.status === 'confirmed') && new Date(b.starts_at).getTime() > Date.now();
  /** إخوةُ هذه السيّارة في الطلب — الرموزُ فقط تعود من القاعدة، فحالاتُهم غيرُ معروفةٍ هنا. */
  const siblings = b.group_key && (b.group_codes?.length ?? 0) > 1 && b.group_codes!.includes(b.code) ? b.group_codes! : null;

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <a href={`/wash/detail/?id=${b.wash_id}`} className="inline-flex min-h-[44px] items-center gap-1 text-[12px] font-bold text-brand-700">
        <span aria-hidden className="text-base leading-none">‹</span> {b.wash}
      </a>

      <article className="card mt-3 p-5 text-center">
        <p className="text-[11px] font-bold text-slate-400">رمز الحجز</p>
        <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.2em] text-brand-900" dir="ltr">
          {b.code}
        </p>
        {siblings && (
          <div className="mt-2">
            <p className="text-[11px] font-bold text-slate-500">
              سيّارة {siblings.indexOf(b.code) + 1} من {siblings.length} في هذا الطلب
            </p>
            <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
              {siblings.map((c) =>
                c === b.code ? (
                  <span key={c} dir="ltr" className="inline-flex min-h-[36px] items-center rounded-full bg-brand-600 px-3 font-mono text-[11px] font-bold text-white">
                    {c}
                  </span>
                ) : (
                  <a key={c} href={bookingHref(c, phone)} dir="ltr" className="inline-flex min-h-[36px] items-center rounded-full border border-brand-100 bg-brand-50 px-3 font-mono text-[11px] font-bold text-brand-700">
                    {c}
                  </a>
                )
              )}
            </div>
          </div>
        )}
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[12px] font-bold ${BOOKING_PILL[b.status]}`}>
          {b.status === 'pending' ? 'بانتظار تأكيد المغسلة' : BOOKING_LABELS[b.status]}
        </span>

        <dl className="mt-5 space-y-2.5 text-start text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">المغسلة</dt>
            <dd className="text-end font-bold text-slate-800">{b.wash}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">العنوان</dt>
            <dd className="text-end font-bold text-slate-800">{b.address}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">الخدمة</dt>
            <dd className="text-end font-bold text-slate-800">
              {b.service} · {b.use_free ? 'مجّانيّة' : iqd(b.price)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">الموعد</dt>
            <dd className="text-end font-bold text-slate-800">{when}</dd>
          </div>
        </dl>

        {b.status === 'completed' ? (
          b.reviewed ? (
            <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-800">شكراً لتقييمك ✓</p>
          ) : (
            <ReviewBox code={code} phone={phone} onDone={() => window.location.reload()} />
          )
        ) : (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-800">أرِ الرمز للعامل عند الوصول</p>
        )}

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
          {/* ‎replace= يُلغي رمزاً واحداً: في طلبٍ متعدّد السيارات يبقى بقيّتُه حيّاً فيُرفض الحجزُ الجديد.
              تعديلُ موعد الطلب كلِّه في «حجوزاتي» حيث تُعرف حالاتُ سياراته. */}
          {live && !siblings && (
            <a href={`/wash/book/?id=${b.wash_id}&replace=${encodeURIComponent(b.code)}`} className="btn-ghost w-full">
              <CalendarIcon className="h-4 w-4" />
              تعديل الموعد
            </a>
          )}
          {live && siblings && (
            <a href="/wash/mine/" className="btn-ghost w-full">
              <CalendarIcon className="h-4 w-4" />
              تعديل موعد الطلب من «حجوزاتي»
            </a>
          )}
          {live && (
            <div className={siblings ? 'flex gap-2' : ''}>
              <button type="button" onClick={cancel} disabled={busy} className="btn w-full text-red-700 active:bg-red-50">
                {busy ? <SpinnerIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                إلغاء الحجز
              </button>
              {siblings && (
                <button type="button" onClick={() => cancelGroup(b.group_key!)} disabled={busy} className="btn w-full text-red-700 active:bg-red-50">
                  إلغاء الطلب كامل
                </button>
              )}
            </div>
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
