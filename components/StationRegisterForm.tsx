'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { MapPinIcon, SpinnerIcon } from './icons';

export function StationRegisterForm({ ownerId, onDone }: { ownerId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function locate() {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('تعذّر تحديد الموقع. فعّل صلاحية الموقع في المتصفح، أو أدخل الإحداثيات يدوياً.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError('يجب تحديد موقع المحطة على الخريطة قبل الإرسال.');
      return;
    }
    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('stations')
      .insert({ owner_id: ownerId, name, address, phone, lat: coords.lat, lng: coords.lng })
      .select('id')
      .single();

    if (insertError || !data) {
      setBusy(false);
      setError('تعذّر حفظ المحطة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.');
      return;
    }

    // seed all six products as unavailable so the dashboard has rows to toggle
    await supabase
      .from('station_products')
      .insert(PRODUCT_ORDER.map((product) => ({ station_id: data.id, product })));

    setBusy(false);
    onDone();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <h2 className="text-base font-bold">تسجيل محطة جديدة</h2>

      <div>
        <label htmlFor="name" className="label">
          اسم المحطة <span className="text-traffic-red">*</span>
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
          placeholder="محطة الرمادي المركزية"
        />
      </div>

      <div>
        <label htmlFor="address" className="label">
          العنوان التفصيلي <span className="text-traffic-red">*</span>
        </label>
        <input
          id="address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="field"
          placeholder="الرمادي - حي الضباط - قرب الجسر"
        />
      </div>

      <div>
        <label htmlFor="phone" className="label">
          رقم الهاتف <span className="text-traffic-red">*</span>
        </label>
        <input
          id="phone"
          type="tel"
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="field"
          placeholder="07XXXXXXXXX"
          dir="ltr"
        />
      </div>

      <div>
        <span className="label">
          موقع المحطة <span className="text-traffic-red">*</span>
        </span>
        <button type="button" onClick={locate} disabled={locating} className="btn-ghost w-full">
          {locating ? <SpinnerIcon className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
          {coords ? 'إعادة تحديد الموقع' : 'تحديد موقعي الحالي'}
        </button>
        {coords && (
          <p className="mt-2 text-xs text-brand" dir="ltr">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">قف داخل المحطة عند الضغط لضمان دقة الموقع</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <SpinnerIcon className="h-4 w-4" />}
        إرسال الطلب للمراجعة
      </button>
      <p className="text-center text-xs text-slate-400">
        سيتم تفعيل المحطة بعد موافقة الإدارة
      </p>
    </form>
  );
}
