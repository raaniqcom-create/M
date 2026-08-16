'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { ANBAR_CITIES } from '@/lib/cities';
import { KIND_LABELS, KINDS } from '@/lib/stationMeta';
import { CheckIcon, SpinnerIcon } from './icons';
import { LocationField } from './LocationField';
import type { StationKind } from '@/types/database';

interface Handover {
  station: string;
  phone: string;
  password: string | null;
}

// Admin-created stations skip the approval queue — the admin *is* the approver.
//
// The station is created under the admin's own id and then handed to the
// owner's number, which mints their account in the same submission. Doing it
// in that order rather than creating the account first means a failure half
// way leaves a station the admin still owns — recoverable from the panel —
// instead of an orphan login for a station that does not exist.
export function AdminStationForm({ adminId, onDone }: { adminId: string; onDone: () => void }) {
  const [handover, setHandover] = useState<Handover | null>(null);
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [kind, setKind] = useState<StationKind>('government');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A demo station is real in every way its owner can see, and invisible on the
  // public list, the station pages and the build. It is the only safe way to
  // look at the owner's screen while the live map is about to fill with real
  // forecourts.
  const [demo, setDemo] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!coords) {
      setError('حدّد موقع المحطة أولاً.');
      return;
    }
    setBusy(true);
    setError(null);

    // Grab the form now: React nulls currentTarget once the handler yields, so
    // reading it after the awaits below throws and swallows the reset.
    const form = e.currentTarget;
    const fd = new FormData(form);
    const { data, error: insertError } = await supabase
      .from('stations')
      .insert({
        owner_id: adminId,
        name: String(fd.get('name')),
        address: String(fd.get('address')),
        city,
        kind,
        phone: String(fd.get('phone')),
        lat: coords.lat,
        lng: coords.lng,
        status: 'approved',
        is_demo: demo,
      })
      .select('id')
      .single();

    if (insertError || !data) {
      setBusy(false);
      setError('تعذّر حفظ المحطة. تحقق من الاتصال وحاول مجدداً.');
      return;
    }

    await supabase
      .from('station_products')
      .insert(PRODUCT_ORDER.map((product) => ({ station_id: data.id, product })));

    // Hand it to the owner's number. This creates their login if the number is
    // new, or attaches the station to the account they already have — and it
    // never resets a password someone may already be using.
    const phone = String(fd.get('phone'));
    const name = String(fd.get('name'));
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/station-phone`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ stationId: data.id, phone }),
      }
    ).catch(() => null);
    const out = await res?.json().catch(() => null);

    setBusy(false);
    if (res?.ok && out?.ok) {
      setHandover({ station: name, phone: out.phone, password: out.password ?? null });
    } else {
      // The station exists either way; say so plainly rather than implying the
      // whole submission failed.
      setError(
        (out?.error ?? 'تعذّر إنشاء حساب صاحب المحطة') +
          ' — المحطة أُضيفت وهي باسمك، عيّن رقمها من صفحة المحطة.'
      );
      setSaved(true);
    }
    setCoords(null);
    setDemo(false);
    form.reset();
    onDone();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="text-sm font-bold">إضافة محطة جديدة</h2>

      <div>
        <label htmlFor="a-name" className="label">
          اسم المحطة <span className="text-traffic-red">*</span>
        </label>
        <input id="a-name" name="name" required className="field" placeholder="محطة الفلوجة الحكومية" />
      </div>

      <div>
        <label htmlFor="a-city" className="label">
          المدينة <span className="text-traffic-red">*</span>
        </label>
        <select
          id="a-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="field"
        >
          {ANBAR_CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">
          نوع المحطة <span className="text-traffic-red">*</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-[44px] rounded-xl border text-sm font-semibold transition-colors duration-200 ${
                kind === k
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="a-address" className="label">
          العنوان التفصيلي <span className="text-traffic-red">*</span>
        </label>
        <input id="a-address" name="address" required className="field" placeholder="الحي - أقرب نقطة دالة" />
      </div>

      <div>
        <label htmlFor="a-phone" className="label">
          رقم الهاتف <span className="text-traffic-red">*</span>
        </label>
        <input id="a-phone" name="phone" type="tel" required inputMode="tel" className="field" placeholder="07XXXXXXXXX" dir="ltr" />
      </div>

      <div>
        <span className="label">
          الموقع <span className="text-traffic-red">*</span>
        </span>
        <LocationField coords={coords} onChange={setCoords} city={city} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}
      {saved && !handover && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand">
          <CheckIcon className="h-4 w-4" />
          تمت إضافة المحطة وهي ظاهرة للمستخدمين الآن
        </p>
      )}

      {handover && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-brand-700">
            <CheckIcon className="h-4 w-4" />
            تمت إضافة «{handover.station}» وحسابها جاهز
          </p>

          {handover.password ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-brand-900">
                سلّم صاحب المحطة هذه البيانات — يدخل بها من <span className="ltr">muhta.online</span>{' '}
                أو من التطبيق ويبدأ التحديث فوراً.
              </p>
              <dl className="mt-3 space-y-2">
                <Cred label="اسم الدخول" value={handover.phone} />
                <Cred label="كلمة المرور" value={handover.password} />
              </dl>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `المحطة التقنية — بيانات دخول «${handover.station}»
` +
                      `اسم الدخول: ${handover.phone}
` +
                      `كلمة المرور: ${handover.password}
` +
                      `الدخول من: https://muhta.online/login`
                  )
                }
                className="btn-ghost mt-3 w-full"
              >
                نسخ البيانات لإرسالها
              </button>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-brand-900">
              هذا الرقم له حساب سابق على المنصة، فأُسندت المحطة إليه ويدخل بكلمة مروره
              المعروفة. لا تُنشأ كلمة جديدة حتى لا نُبطل كلمةً قد يستعملها.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setHandover(null);
              setSaved(false);
            }}
            className="mt-2 min-h-[44px] w-full text-center text-xs font-semibold text-brand-700"
          >
            إضافة محطة أخرى
          </button>
        </div>
      )}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
        <input
          type="checkbox"
          checked={demo}
          onChange={(e) => setDemo(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-700">محطة تجريبية</span>
          <span className="block text-[11px] leading-relaxed text-slate-500">
            لا تظهر للناس ولا في صفحات المحطات — لكن حساب صاحبها يعمل كاملاً. للتجربة
            قبل الإطلاق.
          </span>
        </span>
      </label>

      <button type="submit" disabled={busy || !!handover} className="btn-primary w-full disabled:opacity-50">
        {busy && <SpinnerIcon className="h-4 w-4" />}
        إضافة المحطة
      </button>
    </form>
  );
}

/** Credentials are read aloud down a phone line as often as they are copied,
 *  so they are set in a mono face at a size that survives being squinted at. */
function Cred({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="font-mono text-sm font-bold tracking-wide text-slate-800" dir="ltr">
        {value}
      </dd>
    </div>
  );
}
