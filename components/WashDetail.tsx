'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { hoursLabel } from '@/lib/hours';
import { displayPhone, isValidIraqiMobile } from '@/lib/phone';
import { knownAddress } from '@/lib/alerts';
import {
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  bgdDate,
  bookingDays,
  bookingHref,
  dayLabel,
  iqd,
  loyaltyLine,
  readMyBookings,
  rememberBooking,
  servicePrice,
  slotLabel,
  type VehicleType,
  type WashOffer,
  type WashPublic,
  type WashService,
} from '@/lib/wash';
import { pokeWashTick, useWashConfig } from '@/lib/washConfig';
import { Sheet } from './Sheet';
import { RouteButton } from './RouteButton';
import { CarIcon, CalendarIcon, PhoneIcon, SpinnerIcon, StarIcon } from './icons';

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
type Stamps = { stamps: number; free: number; target: number };
type Booked = { code: string; starts_at: string; wash: string };

/** صفحةُ المغسلة: ما تقدّمه، وبطاقةُ الغسلات، وحجزُ موعدٍ في ورقةٍ من أسفل. */
export function WashDetail() {
  const id = useSearchParams().get('id') ?? '';
  const [wash, setWash] = useState<WashPublic | null | undefined>(undefined);
  const [services, setServices] = useState<WashService[]>([]);
  const [offers, setOffers] = useState<WashOffer[]>([]);
  const [me, setMe] = useState<Me>({ name: '', phone: '', car: '' });
  const [subscriber, setSubscriber] = useState(false);
  const [mine, setMine] = useState<ReturnType<typeof readMyBookings>>([]);

  // بطاقةُ الغسلات
  const [stampsPhone, setStampsPhone] = useState('');
  const [stamps, setStamps] = useState<Stamps | null>(null);
  const [stampsBusy, setStampsBusy] = useState(false);

  // الحجز
  const [open, setOpen] = useState(false);
  const [service, setService] = useState('');
  const [day, setDay] = useState(() => bgdDate());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | ''>('');
  /** مفتاحُ التكرار: يثبت من فتح الورقة حتى نجاح الحجز — فإعادةُ المحاولة تُرجع الحجزَ نفسَه. */
  const [clientKey, setClientKey] = useState('');
  /** أقربُ موعدٍ حرٍّ اليوم — يُقرأ مرّةً عند فتح الصفحة. */
  const [nextSlot, setNextSlot] = useState<string | null | undefined>(undefined);
  const cfg = useWashConfig();

  useEffect(() => {
    const m = readMe();
    setMe(m);
    setStampsPhone(m.phone);
    setSubscriber(!!knownAddress());
    setMine(readMyBookings().filter((b) => b.wash_id === id));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      supabase.from('washes_public').select('*').eq('id', id).maybeSingle(),
      supabase.from('wash_services').select('*').eq('wash_id', id).eq('active', true).order('sort'),
      supabase.from('wash_offers').select('*').eq('wash_id', id).eq('active', true),
    ]).then(([w, s, o]) => {
      if (!alive) return;
      const today = bgdDate();
      setWash((w.data as WashPublic | null) ?? null);
      setServices((s.data ?? []) as WashService[]);
      setOffers(((o.data ?? []) as WashOffer[]).filter((x) => !x.ends_at || x.ends_at.slice(0, 10) >= today));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // المواعيدُ الحرّة لليوم والخدمة المختارَين — السعةُ بمدّة الخدمة (wash_slots v2).
  useEffect(() => {
    if (!open || !id) return;
    let alive = true;
    setSlots(null);
    setSlot('');
    if (!clientKey) setClientKey(crypto.randomUUID());
    supabase.rpc('wash_slots', { p_wash: id, p_day: day, p_service: service || null }).then(({ data }) => {
      if (alive) setSlots(((data ?? []) as Slot[]).filter((x) => x.free > 0));
    });
    return () => {
      alive = false;
    };
  }, [open, id, day, service]); // eslint-disable-line react-hooks/exhaustive-deps

  // «أقرب موعد اليوم» تحت الزرّ — نداءٌ واحدٌ عند فتح الصفحة.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    supabase.rpc('wash_slots', { p_wash: id, p_day: bgdDate() }).then(({ data }) => {
      const first = ((data ?? []) as Slot[]).find((x) => x.free > 0);
      if (alive) setNextSlot(first ? first.slot : null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  async function showStamps() {
    if (!wash || !isValidIraqiMobile(stampsPhone)) return;
    setStampsBusy(true);
    const { data } = await supabase.rpc('wash_stamps_for', { p_wash: wash.id, p_phone: displayPhone(stampsPhone) });
    setStampsBusy(false);
    const r = (Array.isArray(data) ? data[0] : data) as Stamps | null | undefined;
    setStamps(r ?? { stamps: 0, free: 0, target: wash.loyalty_target });
  }

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
    const { data, error } = await supabase.rpc('book_wash', {
      p_wash: wash.id,
      p_service: service,
      p_day: day,
      p_slot: slot.slice(0, 5),
      p_name: me.name.trim(),
      p_phone: phone,
      p_car: me.car.trim() || null,
      p_device: knownAddress() ?? localStorage.getItem('device-token') ?? null,
      p_vehicle: vehicle || null,
      p_client_key: clientKey || null,
    });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const b = data as Booked;
    setClientKey('');
    pokeWashTick();
    rememberBooking({ code: b.code, phone, wash_id: wash.id, wash: b.wash, starts_at: b.starts_at });
    window.location.href = bookingHref(b.code, phone);
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

  const days = bookingDays(subscriber, Date.now(), cfg ? { guest: cfg.horizon_guest, subscriber: cfg.horizon_sub } : undefined);
  const line = stamps ? loyaltyLine(stamps.stamps, stamps.target, stamps.free) : null;
  const canBook = !wash.temp_closed && !wash.paused && services.length > 0;

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-4">
      <a href="/wash/" className="text-[12px] font-bold text-brand-700">
        ← دليل المغاسل
      </a>

      <article className="card mt-3 overflow-hidden">
        {wash.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wash.image_url} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-brand-400">
            <CarIcon className="h-12 w-12" />
          </div>
        )}
        <div className="p-5">
          <h1 className="text-lg font-extrabold leading-snug text-brand-900">{wash.name}</h1>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {wash.city} — {wash.address}
          </p>
          <p className="mt-2 text-[12.5px] text-slate-700">{hoursLabel(wash)}</p>

          {wash.temp_closed && (
            <p role="status" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
              المغسلة مغلقة مؤقّتاً
            </p>
          )}

          {offers.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {offers.map((o) => (
                <li key={o.id} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-800">
                  {o.title}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2">
            <RouteButton lat={wash.lat} lng={wash.lng} />
            {wash.phone && (
              <a href={`tel:${wash.phone}`} className="btn-ghost w-full" dir="ltr">
                <PhoneIcon className="h-4 w-4" />
                {displayPhone(wash.phone)}
              </a>
            )}
          </div>
        </div>
      </article>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-bold">الخدمات</h2>
        {services.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">لم تُضف المغسلة خدماتها بعد.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-[13px]">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-bold text-slate-800">{s.name}</span>
                <span className="shrink-0 text-slate-500">
                  {iqd(s.price)} · {s.minutes} دقيقة
                </span>
              </li>
            ))}
          </ul>
        )}
        {nextSlot !== undefined && (
          <p className="mt-3 text-center text-[12px] text-slate-500">
            {nextSlot ? <>أقرب موعد اليوم: <b className="text-brand-700">{slotLabel(nextSlot)}</b></> : 'لا مواعيدَ متاحة اليوم — جرّب الغد'}
          </p>
        )}
        <button type="button" onClick={() => setOpen(true)} disabled={!canBook} className="btn-primary mt-3 w-full">
          <CalendarIcon className="h-4 w-4" />
          احجز موعداً
        </button>
      </section>

      {wash.loyalty_target > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <StarIcon className="h-4 w-4 text-amber-500" filled />
            بطاقة الغسلات — {wash.loyalty_target} غسلات و{wash.loyalty_target === 5 ? 'السادسة' : 'التالية'} مجّاناً
          </h2>
          <div className="mt-3 flex gap-2">
            <input
              type="tel"
              dir="ltr"
              inputMode="tel"
              placeholder="07XXXXXXXXX"
              value={stampsPhone}
              onChange={(e) => setStampsPhone(e.target.value)}
              className="field"
              aria-label="رقم الهاتف"
            />
            <button
              type="button"
              onClick={showStamps}
              disabled={stampsBusy || !isValidIraqiMobile(stampsPhone)}
              className="btn-ghost shrink-0"
            >
              {stampsBusy ? <SpinnerIcon className="h-4 w-4" /> : 'اعرض بطاقتي'}
            </button>
          </div>
          {line && (
            <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] font-bold text-brand-800">{line}</p>
          )}
        </section>
      )}

      {mine.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="text-sm font-bold">حجوزاتي في هذه المغسلة</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-[13px]">
            {mine.map((b) => (
              <li key={b.code}>
                <a href={bookingHref(b.code, b.phone)} className="flex items-center justify-between py-2">
                  <span className="text-slate-700">
                    {new Date(b.starts_at).toLocaleString('ar-IQ', {
                      timeZone: 'Asia/Baghdad',
                      weekday: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="font-mono font-bold text-brand-700" dir="ltr">
                    {b.code}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="حجز موعد" hint="مجّاني — يؤكّده صاحب المغسلة">
        <p className="label">الخدمة</p>
        <ul className="space-y-1.5">
          {services.map((s) => (
            <li key={s.id}>
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[13px] ${
                  service === s.id ? 'border-brand bg-brand-50' : 'border-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="service" value={s.id} checked={service === s.id} onChange={() => setService(s.id)} />
                  <span className="font-bold text-slate-800">{s.name}</span>
                </span>
                <span className="shrink-0 text-slate-500">{iqd(servicePrice(s, vehicle || null))}</span>
              </label>
            </li>
          ))}
        </ul>

        {services.some((s) => s.prices && Object.keys(s.prices).length) && (
          <>
            <p className="label mt-4">نوع السيارة</p>
            <div className="flex flex-wrap gap-1.5">
              {VEHICLE_TYPES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vehicle === v}
                  onClick={() => setVehicle(vehicle === v ? '' : v)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-bold ${vehicle === v ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600'}`}
                >
                  {VEHICLE_LABELS[v]}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="label mt-4">اليوم</p>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              disabled={d.locked}
              aria-pressed={day === d.day}
              onClick={() => setDay(d.day)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-bold disabled:opacity-40 ${
                day === d.day ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {dayLabel(d.day)}
            </button>
          ))}
        </div>
        {days.some((d) => d.locked) && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            للمشتركين —{' '}
            <a href="/alerts/" className="font-bold text-brand underline">
              فعّل التنبيهات
            </a>{' '}
            لتحجز حتى ٣ أيّام مقدّماً
          </p>
        )}

        <p className="label mt-4">الموعد</p>
        {slots === null ? (
          <div className="flex justify-center py-4">
            <SpinnerIcon className="h-5 w-5 text-brand" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-xs text-slate-400">لا مواعيد متاحة في هذا اليوم</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {slots.map((s) => (
              <button
                key={s.slot}
                type="button"
                aria-pressed={slot === s.slot}
                onClick={() => setSlot(s.slot)}
                className={`rounded-xl border px-2 py-2 text-[12px] font-bold ${
                  slot === s.slot ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {slotLabel(s.slot)}
                {wash.bays > 1 && <span className="block text-[10px] font-normal opacity-70">{s.free} متاح</span>}
              </button>
            ))}
          </div>
        )}

        <label className="label mt-4" htmlFor="wash-name">
          الاسم *
        </label>
        <input id="wash-name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} className="field" autoComplete="name" />
        <label className="label mt-3" htmlFor="wash-phone">
          رقم الهاتف *
        </label>
        <input
          id="wash-phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          placeholder="07XXXXXXXXX"
          value={me.phone}
          onChange={(e) => setMe({ ...me, phone: e.target.value })}
          className="field"
          autoComplete="tel"
        />
        <label className="label mt-3" htmlFor="wash-car">
          السيارة
        </label>
        <input id="wash-car" placeholder="كامري بيضاء" value={me.car} onChange={(e) => setMe({ ...me, car: e.target.value })} className="field" />

        {err && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
            {err}
          </p>
        )}
        <button type="button" onClick={book} disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? <SpinnerIcon className="h-4 w-4" /> : 'أكّد الحجز'}
        </button>
      </Sheet>
    </main>
  );
}
