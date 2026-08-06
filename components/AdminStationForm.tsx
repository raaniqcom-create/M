'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { ANBAR_CITIES } from '@/lib/cities';
import { KIND_LABELS, KINDS } from '@/lib/stationMeta';
import { CheckIcon, MapPinIcon, SpinnerIcon } from './icons';
import type { StationKind } from '@/types/database';

// Admin-created stations skip the approval queue — the admin *is* the approver.
export function AdminStationForm({ adminId, onDone }: { adminId: string; onDone: () => void }) {
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [kind, setKind] = useState<StationKind>('government');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function useCityCentre() {
    const c = ANBAR_CITIES.find((x) => x.name === city)!;
    setCoords({ lat: c.lat, lng: c.lng });
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('تعذّر تحديد الموقع. استخدم مركز المدينة أو أدخل الإحداثيات يدوياً.')
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!coords) {
      setError('حدّد موقع المحطة أولاً.');
      return;
    }
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
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

    setBusy(false);
    setSaved(true);
    setCoords(null);
    e.currentTarget.reset();
    setTimeout(() => setSaved(false), 4000);
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
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={useCityCentre} className="btn-ghost">
            <MapPinIcon className="h-4 w-4" />
            مركز المدينة
          </button>
          <button type="button" onClick={useMyLocation} className="btn-ghost">
            <MapPinIcon className="h-4 w-4" />
            موقعي الحالي
          </button>
        </div>
        {coords && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              step="any"
              value={coords.lat}
              onChange={(e) => setCoords({ ...coords, lat: Number(e.target.value) })}
              className="field"
              aria-label="خط العرض"
              dir="ltr"
            />
            <input
              type="number"
              step="any"
              value={coords.lng}
              onChange={(e) => setCoords({ ...coords, lng: Number(e.target.value) })}
              className="field"
              aria-label="خط الطول"
              dir="ltr"
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand">
          <CheckIcon className="h-4 w-4" />
          تمت إضافة المحطة وهي ظاهرة للمستخدمين الآن
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <SpinnerIcon className="h-4 w-4" />}
        إضافة المحطة
      </button>
    </form>
  );
}
