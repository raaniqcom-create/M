'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { ANBAR_CITIES } from '@/lib/cities';
import { isValidIraqiMobile, phoneToEmail, displayPhone } from '@/lib/phone';
import { CheckIcon, MapPinIcon, SpinnerIcon } from './icons';

// One screen, plain labels, no jargon: station managers register from a phone,
// often in a hurry, and a multi-step wizard loses them.
export function StationRegisterForm() {
  const router = useRouter();
  const [loginPhone, setLoginPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [samePhone, setSamePhone] = useState(true);
  const [publicPhone, setPublicPhone] = useState('');
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
        const c = ANBAR_CITIES.find((x) => x.name === city)!;
        setCoords({ lat: c.lat, lng: c.lng });
        setLocating(false);
        setError('تعذّر تحديد موقعك، فتم اختيار مركز المدينة مؤقتاً. يمكنك تعديله لاحقاً.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    if (!isValidIraqiMobile(loginPhone)) {
      setError('رقم الهاتف غير صحيح. اكتبه هكذا: 07XXXXXXXXX');
      return;
    }
    const shownPhone = samePhone ? loginPhone : publicPhone;
    if (!isValidIraqiMobile(shownPhone)) {
      setError('رقم هاتف المحطة للنشر غير صحيح. اكتبه هكذا: 07XXXXXXXXX');
      return;
    }
    if (!coords) {
      setError('اضغط «تحديد موقع المحطة» قبل الإرسال.');
      return;
    }

    setBusy(true);
    setError(null);

    const { data: auth, error: signUpError } = await supabase.auth.signUp({
      email: phoneToEmail(loginPhone),
      password,
    });

    if (signUpError || !auth.user) {
      setBusy(false);
      setError(
        signUpError?.message.includes('already')
          ? 'هذا الرقم مسجّل مسبقاً. استخدم «تسجيل الدخول» بدل إنشاء حساب جديد.'
          : 'تعذّر إنشاء الحساب. تأكد أن كلمة المرور ٦ أحرف على الأقل وحاول مجدداً.'
      );
      return;
    }

    const { data: station, error: stationError } = await supabase
      .from('stations')
      .insert({
        owner_id: auth.user.id,
        name: String(fd.get('name')),
        address: String(fd.get('address')),
        city,
        contact_name: String(fd.get('contact_name')),
        phone: displayPhone(shownPhone),
        lat: coords.lat,
        lng: coords.lng,
      })
      .select('id')
      .single();

    if (stationError || !station) {
      setBusy(false);
      setError('تم إنشاء الحساب لكن تعذّر حفظ بيانات المحطة. سجّل الدخول وأكمل البيانات.');
      return;
    }

    await supabase
      .from('station_products')
      .insert(PRODUCT_ORDER.map((product) => ({ station_id: station.id, product })));

    router.push('/owner');
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <div>
        <h2 className="text-base font-bold">تسجيل محطة جديدة</h2>
        <p className="mt-1 text-xs text-slate-500">
          املأ الحقول التالية مرة واحدة فقط. لن تحتاج أي خطوات إضافية.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="label">
          اسم المحطة <span className="text-traffic-red">*</span>
        </label>
        <input id="name" name="name" required className="field" placeholder="محطة الرمادي المركزية" />
      </div>

      <div>
        <label htmlFor="login-phone" className="label">
          رقم الهاتف <span className="text-traffic-red">*</span>
        </label>
        <input
          id="login-phone"
          type="tel"
          inputMode="numeric"
          required
          value={loginPhone}
          onChange={(e) => setLoginPhone(e.target.value)}
          className="field"
          placeholder="07XXXXXXXXX"
          dir="ltr"
        />
        <p className="mt-1 text-xs text-brand-700">هذا الرقم هو اسم الدخول الخاص بك</p>
      </div>

      <div>
        <label htmlFor="password" className="label">
          كلمة المرور <span className="text-traffic-red">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field pl-16"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-2 top-1/2 h-9 -translate-y-1/2 px-2 text-xs font-semibold text-slate-500"
          >
            {showPassword ? 'إخفاء' : 'إظهار'}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">٦ أحرف أو أرقام على الأقل — احفظها جيداً</p>
      </div>

      <div>
        <label htmlFor="city" className="label">
          المدينة <span className="text-traffic-red">*</span>
        </label>
        <select id="city" value={city} onChange={(e) => setCity(e.target.value)} className="field">
          {ANBAR_CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="address" className="label">
          عنوان المحطة <span className="text-traffic-red">*</span>
        </label>
        <input
          id="address"
          name="address"
          required
          className="field"
          placeholder="الحي - الشارع - أقرب نقطة معروفة"
        />
      </div>

      <div>
        <span className="label">
          إضافة العنوان على الخريطة <span className="text-traffic-red">*</span>
        </span>
        <button type="button" onClick={locate} disabled={locating} className="btn-ghost w-full">
          {locating ? <SpinnerIcon className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
          {coords ? 'إعادة تحديد الموقع' : 'تحديد موقع المحطة'}
        </button>
        {coords && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand">
            <CheckIcon className="h-4 w-4" />
            تم تحديد الموقع بنجاح
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">قف داخل المحطة عند الضغط ليكون الموقع دقيقاً</p>
      </div>

      <div>
        <label htmlFor="contact_name" className="label">
          اسم الشخص المعني بتحديث الحالة <span className="text-traffic-red">*</span>
        </label>
        <input
          id="contact_name"
          name="contact_name"
          required
          className="field"
          placeholder="الاسم الكامل"
        />
      </div>

      <div>
        <span className="label">
          رقم هاتف المحطة للنشر <span className="text-traffic-red">*</span>
        </span>
        <div className="space-y-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
            <input
              type="radio"
              name="phone_choice"
              checked={samePhone}
              onChange={() => setSamePhone(true)}
              className="h-4 w-4 accent-[#16a34a]"
            />
            <span className="text-sm">نفس رقم الهاتف أعلاه</span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
            <input
              type="radio"
              name="phone_choice"
              checked={!samePhone}
              onChange={() => setSamePhone(false)}
              className="h-4 w-4 accent-[#16a34a]"
            />
            <span className="text-sm">رقم آخر</span>
          </label>
          {!samePhone && (
            <input
              type="tel"
              inputMode="numeric"
              value={publicPhone}
              onChange={(e) => setPublicPhone(e.target.value)}
              className="field"
              placeholder="07XXXXXXXXX"
              aria-label="رقم هاتف المحطة للنشر"
              dir="ltr"
            />
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">هذا الرقم وحده يظهر للسائقين</p>
      </div>

      <p className="rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
        لا تتم مشاركة أي من بياناتك خارج النظام. رقم الدخول وكلمة المرور لا يظهران لأحد.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <SpinnerIcon className="h-4 w-4" />}
        إرسال الطلب
      </button>
      <p className="text-center text-xs text-slate-400">
        تظهر محطتك للسائقين بعد موافقة الإدارة
      </p>
    </form>
  );
}
