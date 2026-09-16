'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { baghdadMinutesNow } from '@/lib/hours';
import { displayPhone, isValidIraqiMobile } from '@/lib/phone';
import { knownAddress } from '@/lib/alerts';
import {
  VEHICLE_LABELS,
  at12,
  bgdDate,
  bookingDays,
  bookingHref,
  calendarCell,
  dateLine,
  forgetBooking,
  iqd,
  offerApplies,
  offerPrice,
  readMyBookings,
  rememberBooking,
  servicePrice,
  slotGrid,
  time12,
  type BookingStatus,
  type VehicleType,
  type WashOffer,
  type WashPublic,
  type WashService,
} from '@/lib/wash';
import { pokeWashTick, useWashConfig } from '@/lib/washConfig';
import { RouteCell } from './WashBookingScreen';
import { VehiclePicker } from './VehiclePicker';
import { CheckIcon, MapPinIcon, SpinnerIcon } from './icons';

/** ما يكتبه المواطن مرّةً ويُعاد ملؤه: `wash-me`. */
const ME = 'wash-me';
type Me = { name: string; phone: string; car: string };
function readMe(): Me {
  try {
    const v = JSON.parse(localStorage.getItem(ME) ?? '{}') as Partial<Me>;
    return { name: v.name ?? '', phone: v.phone ?? '', car: v.car ?? '' };
  } catch {
    return { name: '', phone: '', car: '' };
  }
}

type Slot = { slot: string; free: number };
type Booked = { id: string; code: string; starts_at: string; service: string; price: number; use_free: boolean; subscriber: boolean; status: BookingStatus; wash: string; wash_phone: string | null };

const hasPrice = (o: WashOffer) => o.offer_price != null || o.discount_pct != null;

/** ‎/wash/book/?id=&service=&offer=&replace= — صفحةُ الحجز: خدمةٌ ونوعُ سيارة ويومٌ وموعدٌ وبيانات، ثمّ شاشةُ النجاح. */
export function WashBookFlow() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const serviceParam = params.get('service') ?? '';
  const offerParam = params.get('offer') ?? '';
  const replace = params.get('replace') ?? '';
  const cfg = useWashConfig();

  const [wash, setWash] = useState<WashPublic | null | undefined>(undefined);
  const [services, setServices] = useState<WashService[]>([]);
  const [offers, setOffers] = useState<WashOffer[]>([]);
  const [subscriber, setSubscriber] = useState(false);
  const [me, setMe] = useState<Me>({ name: '', phone: '', car: '' });

  const [service, setService] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | ''>('');
  const [useOffer, setUseOffer] = useState(true);
  const [day, setDay] = useState(() => bgdDate());
  /** المواعيدُ الحرّة من القاعدة — null أثناء الجلب. */
  const [free, setFree] = useState<Set<string> | null>(null);
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** مفتاحُ التكرار: يثبت من فتح الصفحة حتى نجاح الحجز — فإعادةُ المحاولة تُرجع الحجزَ نفسَه. */
  const [clientKey, setClientKey] = useState('');
  /** أُلغي الحجزُ القديم (?replace=) فعلاً — فلا يُعاد إلغاؤه عند إعادة المحاولة (الإخفاقُ يُحسب محاولةَ بحثٍ فاشلة). */
  const [replaced, setReplaced] = useState(false);
  const [done, setDone] = useState<(Booked & { phone: string }) | null>(null);

  useEffect(() => {
    setMe(readMe());
    setSubscriber(!!knownAddress());
    setClientKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      supabase.from('washes_public').select('*').eq('id', id).maybeSingle(),
      supabase.from('wash_services').select('*').eq('wash_id', id).eq('active', true).order('sort').limit(50),
      supabase.from('wash_offers').select('*').eq('wash_id', id).eq('active', true).limit(20),
    ]).then(([w, s, o]) => {
      if (!alive) return;
      const svc = (s.data ?? []) as WashService[];
      const ofs = (o.data ?? []) as WashOffer[];
      setWash((w.data as WashPublic | null) ?? null);
      setServices(svc);
      setOffers(ofs);
      // الخدمةُ من الرابط، وإلّا خدمةُ العرض المطلوب، وإلّا الوحيدةُ إن كانت واحدة.
      const want = serviceParam || ofs.find((x) => x.id === offerParam)?.service_id || (svc.length === 1 ? svc[0].id : '');
      setService(svc.some((x) => x.id === want) ? want : '');
    });
    return () => {
      alive = false;
    };
  }, [id, serviceParam, offerParam]);

  // المواعيدُ الحرّة لليوم والخدمة المختارَين — السعةُ بمدّة الخدمة (wash_slots v2).
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setFree(null);
    setSlot('');
    supabase.rpc('wash_slots', { p_wash: id, p_day: day, p_service: service || null }).then(({ data }) => {
      if (alive) setFree(new Set(((data ?? []) as Slot[]).filter((x) => x.free > 0).map((x) => x.slot.slice(0, 5))));
    });
    return () => {
      alive = false;
    };
  }, [id, day, service]);

  async function book() {
    if (!wash) return;
    setErr('');
    if (!service) return setErr('اختر الخدمة.');
    if (!slot) return setErr('اختر الموعد.');
    if (!me.name.trim()) return setErr('اكتب اسمك.');
    if (!isValidIraqiMobile(me.phone)) return setErr('رقم الهاتف غير صحيح — مثل 07XXXXXXXXX.');
    const phone = displayPhone(me.phone);
    try {
      localStorage.setItem(ME, JSON.stringify({ ...me, phone }));
    } catch {
      /* تصفّحٌ خاصّ */
    }
    setBusy(true);
    if (replace && !replaced) {
      // القاعدةُ ترفض حجزاً ثانياً ما دام القديمُ حيّاً — فيُلغى أوّلاً، وبهاتفه هو لا بما كُتب في النموذج.
      const oldPhone = readMyBookings().find((x) => x.code === replace)?.phone ?? phone;
      const { data: ok } = await supabase.rpc('cancel_wash_booking', { p_code: replace, p_phone: oldPhone });
      if (!ok) {
        setBusy(false);
        return setErr('تعذّر إلغاء الحجز القديم — ألغِه من صفحة الحجز ثمّ احجز من جديد.');
      }
      forgetBooking(replace);
      setReplaced(true);
    }
    const { data, error } = await supabase.rpc('book_wash', {
      p_wash: wash.id,
      p_service: service,
      p_day: day,
      p_slot: slot,
      p_name: me.name.trim(),
      p_phone: phone,
      p_car: me.car.trim() || null,
      p_device: knownAddress() ?? localStorage.getItem('device-token') ?? null,
      p_vehicle: vehicle || null,
      p_offer: useOffer && activeOffer ? activeOffer.id : null,
      p_client_key: clientKey || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    const b = data as Booked;
    setClientKey(crypto.randomUUID());
    rememberBooking({ code: b.code, phone, wash_id: wash.id, wash: b.wash, starts_at: b.starts_at, service: b.service, price: b.price, status: b.status });
    pokeWashTick();
    setDone({ ...b, phone });
    window.scrollTo(0, 0);
  }

  if (!id) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لا مغسلةَ في الرابط. <a href="/wash/" className="font-bold text-brand underline">دليل المغاسل</a>
      </main>
    );
  }
  if (wash === undefined) {
    return (
      <main className="flex justify-center py-16">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </main>
    );
  }
  if (wash === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center text-sm text-slate-500">
        لم نجد هذه المغسلة. <a href="/wash/" className="font-bold text-brand underline">دليل المغاسل</a>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 pb-24 pt-8 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand">
          <CheckIcon className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-800">تم حجز موعدك بنجاح</h1>
        {done.status === 'pending' && <p className="mt-1 text-[12px] text-amber-800">بانتظار تأكيد المغسلة — يصلك إشعار عند التأكيد</p>}
        <div className="card mt-5 p-5">
          <p className="text-[11px] font-bold text-slate-400">رقم الحجز</p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-brand-900" dir="ltr">
            {done.code}
          </p>
          <p className="mt-4 text-[11px] font-bold text-slate-400">الموعد</p>
          <p className="mt-0.5 text-sm font-bold text-slate-800">
            {dateLine(done.starts_at)} · {at12(done.starts_at)}
          </p>
          <p className="mt-3 text-sm text-slate-700">{done.wash}</p>
        </div>
        <div className="mt-4 space-y-2">
          <a href={bookingHref(done.code, done.phone)} className="btn-primary w-full">
            عرض الحجز
          </a>
          <RouteCell lat={wash.lat} lng={wash.lng} labelClass="gap-2 text-sm font-semibold text-brand-700">
            <MapPinIcon className="h-4 w-4" />
            الوصول للمحطة
          </RouteCell>
          <a href="/wash/" className="btn-ghost w-full border-0">
            العودة إلى المغاسل
          </a>
        </div>
      </main>
    );
  }

  const days = bookingDays(subscriber, Date.now(), cfg ? { guest: cfg.horizon_guest, subscriber: cfg.horizon_sub } : undefined);
  const chosen = services.find((s) => s.id === service);
  const activeOffer = chosen
    ? offers.find((o) => o.id === offerParam && hasPrice(o) && offerApplies(o, chosen.id, day)) ?? offers.find((o) => hasPrice(o) && offerApplies(o, chosen.id, day))
    : undefined;
  const base = chosen ? servicePrice(chosen, vehicle || null) : 0;
  const price = useOffer && activeOffer ? offerPrice(base, activeOffer) : base;
  const today = day === bgdDate();
  const grid = slotGrid(wash, today ? baghdadMinutesNow() + 20 : -1);
  const anyFree = !!free && grid.some((g) => free.has(g));
  const chip = (on: boolean) => `min-h-[36px] rounded-full border px-3 text-[12px] font-bold ${on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700'}`;

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      <h1 className="text-xl font-extrabold text-slate-800">حجز موعد</h1>
      <p className="mt-1 text-sm text-slate-700">
        <b>{wash.name}</b>
        <span className="text-slate-500"> · {wash.city}{wash.area ? ` – ${wash.area}` : ''}</span>
      </p>
      {replace && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          تعديلُ الحجز <span className="font-mono" dir="ltr">{replace}</span> — يُلغى القديم عند الضغط على «تأكيد الحجز».
        </p>
      )}

      {/* الخدمة */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">الخدمة</h2>
        {services.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-400">لم تُضف المغسلة خدماتها بعد.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {services.map((s) => {
              const on = service === s.id;
              const o = on ? activeOffer : undefined;
              const p = servicePrice(s, vehicle || null);
              return (
                <li key={s.id}>
                  <label className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[13px] ${on ? 'border-brand bg-brand-50' : 'border-slate-200'}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="service" value={s.id} checked={on} onChange={() => setService(s.id)} className="accent-brand" />
                      <span>
                        <span className="block font-bold text-slate-800">{s.name}</span>
                        <span className="block text-[11px] text-slate-500">{s.minutes} دقيقة</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      {o && useOffer && offerPrice(p, o) !== p && <span className="block text-[11px] text-slate-400 line-through">{iqd(p)}</span>}
                      <b className="text-brand-700">{iqd(o && useOffer ? offerPrice(p, o) : p)}</b>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {activeOffer && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px]">
            <input type="checkbox" checked={useOffer} onChange={(e) => setUseOffer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
            <span>
              <span className="font-extrabold text-amber-900">{activeOffer.title}</span>
              <span className="block text-amber-800">
                {iqd(offerPrice(base, activeOffer))} بدل {iqd(base)}
                {activeOffer.description ? ` — ${activeOffer.description}` : ''}
              </span>
            </span>
          </label>
        )}
      </section>

      {/* نوعُ السيارة */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">نوع السيارة</h2>
        <div className="mt-2">
          <VehiclePicker value={vehicle} onChange={setVehicle} />
        </div>
      </section>

      {/* اليوم */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">اليوم</h2>
        <div className="no-scrollbar -mx-4 mt-2 flex snap-x gap-2 overflow-x-auto px-4">
          {days.map((d) => {
            const c = calendarCell(d.day);
            const on = day === d.day;
            return (
              <button
                key={d.day}
                type="button"
                disabled={d.locked}
                aria-pressed={on}
                onClick={() => setDay(d.day)}
                className={`flex min-h-[64px] w-[76px] shrink-0 snap-start flex-col items-center justify-center rounded-xl border disabled:opacity-40 ${on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                <span className="text-[13px] font-extrabold">{c.top}</span>
                <span className={`text-[11px] ${on ? 'text-white/80' : 'text-slate-500'}`}>{c.bottom}</span>
              </button>
            );
          })}
        </div>
        {days.some((d) => d.locked) && (
          <p className="mt-2 text-[11px] text-slate-400">
            للمشتركين —{' '}
            <a href="/alerts/" className="font-bold text-brand underline">
              فعّل التنبيهات
            </a>{' '}
            لتحجز حتى {days.length - 1} أيام مقدّماً
          </p>
        )}
      </section>

      {/* الوقت */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">الوقت</h2>
        {free === null ? (
          <div className="flex justify-center py-4">
            <SpinnerIcon className="h-5 w-5 text-brand" />
          </div>
        ) : !anyFree ? (
          <p className="mt-2 text-[12px] text-slate-400">لا مواعيد متاحة في هذا اليوم</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {grid.map((g) => {
              const ok = free.has(g);
              const on = slot === g;
              return (
                <button
                  key={g}
                  type="button"
                  disabled={!ok}
                  aria-pressed={on}
                  onClick={() => setSlot(g)}
                  className={`min-h-[40px] rounded-xl border text-[12px] font-bold ${on ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700'} ${ok ? '' : 'opacity-40 line-through'}`}
                >
                  {time12(g)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* البيانات */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">بياناتك</h2>
        <label className="label mt-3" htmlFor="wash-name">
          الاسم *
        </label>
        <input id="wash-name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} className="field" autoComplete="name" />
        <label className="label mt-3" htmlFor="wash-phone">
          رقم الهاتف *
        </label>
        <input id="wash-phone" type="tel" dir="ltr" inputMode="tel" placeholder="07XXXXXXXXX" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} className="field" autoComplete="tel" />
        <label className="label mt-3" htmlFor="wash-car">
          السيارة
        </label>
        <input id="wash-car" placeholder="كامري بيضاء" value={me.car} onChange={(e) => setMe({ ...me, car: e.target.value })} className="field" />
      </section>

      {/* الملخّص */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-extrabold text-slate-800">ملخص الحجز</h2>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">المغسلة</dt>
            <dd className="text-end font-bold text-slate-800">{wash.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">الخدمة</dt>
            <dd className="text-end font-bold text-slate-800">{chosen?.name ?? '—'}</dd>
          </div>
          {vehicle && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">السيارة</dt>
              <dd className="text-end font-bold text-slate-800">{VEHICLE_LABELS[vehicle]}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">الموعد</dt>
            <dd className="text-end font-bold text-slate-800">
              {dateLine(day)}
              {slot ? ` · ${time12(slot)}` : ''}
            </dd>
          </div>
          {chosen && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">مدة الخدمة</dt>
              <dd className="text-end font-bold text-slate-800">{chosen.minutes} دقيقة</dd>
            </div>
          )}
          {chosen && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">السعر</dt>
              <dd className="text-end font-bold text-brand-700">
                {price !== base && <span className="me-1.5 text-[11px] font-normal text-slate-400 line-through">بدلاً من {iqd(base)}</span>}
                {iqd(price)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {err && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
          {err}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-md px-4 py-3">
          <button type="button" onClick={book} disabled={busy} className="btn-primary w-full">
            {busy ? <SpinnerIcon className="h-4 w-4" /> : 'تأكيد الحجز'}
          </button>
        </div>
      </div>
    </main>
  );
}
