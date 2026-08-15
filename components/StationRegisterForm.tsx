'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { ANBAR_CITIES } from '@/lib/cities';
import { isValidIraqiMobile, phoneToEmail, displayPhone } from '@/lib/phone';
import { EyeIcon, EyeOffIcon, SpinnerIcon } from './icons';
import { LocationField } from './LocationField';

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
  const [error, setError] = useState<string | null>(null);
  // the row we already hold for this number, shown so the owner recognises it
  const [existing, setExisting] = useState<
    { name: string; city: string; address: string; phone: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

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
      if (signUpError?.message.includes('already')) {
        // public read: an approved station's name and address are already
        // visible to every driver, so nothing new is disclosed here
        const { data: row } = await supabase
          .from('stations')
          .select('name, city, address, phone')
          .eq('phone', displayPhone(loginPhone))
          .maybeSingle();
        setExisting(row ?? null);
      }
      setError(
        signUpError?.message.includes('already')
          ? 'ALREADY'
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

    // The admin has to know a station is waiting; without this the request sits
    // in a queue nobody is watching.
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ event: 'registration', stationId: station.id }),
    }).catch(() => {});

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
            className="field pr-12"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
          >
            {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
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
        <LocationField coords={coords} onChange={setCoords} city={city} />
        <p className="mt-1 text-xs text-slate-400">
          اضغط «موقعك الحالي» وأنت داخل المحطة، أو اختر النقطة من الخريطة
        </p>
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

      {error === 'ALREADY' && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-bold">هذه المحطة مسجّلة بالفعل بهذا الرقم.</p>
          {existing && (
            <div className="mt-2 rounded-lg bg-white/70 p-2.5 text-xs leading-relaxed text-slate-700">
              <p className="font-bold">{existing.name}</p>
              <p>{existing.city} — {existing.address}</p>
              <p className="mt-1" dir="ltr">{existing.phone}</p>
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed">
            أُضيفت بالبيانات أعلاه نيابةً عنك. تحقّق من رقمك برسالة لتستلمها،
            <b> ولك بعدها تعديل كل بياناتها</b> — الاسم والعنوان والموقع وأوقات العمل.
          </p>
          <a href="/reset" className="btn-primary mt-3 w-full">
            استلام محطتي بالتحقّق من الرقم
          </a>
          <a href="/login" className="mt-2 block text-center text-xs font-bold underline">
            أو سجّل الدخول إن كنت تعرف كلمة المرور
          </a>
        </div>
      )}

      {error && error !== 'ALREADY' && (
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
