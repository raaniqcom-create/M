'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ANBAR_CITIES } from '@/lib/cities';
import { displayPhone, isValidIraqiMobile, phoneToEmail } from '@/lib/phone';
import { iqd, limitLabel, type CarWash } from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { TimeSelect } from './TimeSelect';
import { CheckIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from './icons';

// Leaflet يلمس window عند الاستيراد — لا يُرسَم على الخادم
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-brand-50">
      <SpinnerIcon className="h-5 w-5 text-brand" />
    </div>
  ),
});

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEPS = ['الاسم', 'المدينة والعنوان', 'الموقع', 'الدوام', 'الباقة', 'بياناتك'];
const LAST: Step = 5;
const SLOTS = [15, 30, 45, 60];
const LOYALTY = [0, 4, 5, 6, 8, 10];
const DEFAULT_SERVICES = [
  { name: 'غسل خارجيّ', price: 5000, minutes: 30, sort: 1 },
  { name: 'غسل كامل (داخليّ وخارجيّ)', price: 10000, minutes: 60, sort: 2 },
];

/** تسجيلُ مغسلة — خمسُ خطوات على نمط تسجيل المحطة. */
export function WashRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  const [name, setName] = useState('');
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [is24h, setIs24h] = useState(false);
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('22:00');
  const [bays, setBays] = useState(2);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [loyalty, setLoyalty] = useState(5);

  const cfg = useWashConfig();
  const [plan, setPlan] = useState<string>('');
  const chosenPlan = cfg?.plans.find((p) => p.code === (plan || cfg.plans[0]?.code));
  const [ownerName, setOwnerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // من له مغسلةٌ أصلاً لا يسجّل ثانية — إلى لوحته.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
      if (alive && mine) router.replace('/wash/owner');
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  function go(delta: 1 | -1) {
    setError(null);
    setStep((s) => (s + delta) as Step);
  }

  const canNext =
    step === 0
      ? name.trim().length >= 3
      : step === 1
        ? address.trim().length >= 5
        : step === 2
          ? !!coords
          : step === 4
            ? !!chosenPlan
            : true;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValidIraqiMobile(phone)) return setError('رقم الهاتف غير صحيح. اكتبه هكذا: 07XXXXXXXXX');
    if (password.length < 6) return setError('كلمة المرور 6 أحرف على الأقل.');
    if (!coords) return setError('ارجع إلى خطوة الموقع وحدّد موقع المغسلة.');
    if (whatsapp && !isValidIraqiMobile(whatsapp)) return setError('رقم واتساب غير صحيح.');

    setBusy(true);
    setError(null);
    const email = phoneToEmail(phone);

    const { data: auth, error: signUpError } = await supabase.auth.signUp({ email, password });
    let ownerId = auth.user?.id ?? null;

    if (signUpError || !ownerId) {
      const already = signUpError?.message.toLowerCase().includes('already');
      if (already) {
        // حسابٌ يتيمٌ من محاولةٍ انقطعت، أو صاحبُ محطةٍ يضيف مغسلة: من يعرف كلمة المرور يُكمل.
        const { data: signedIn } = await supabase.auth.signInWithPassword({ email, password });
        if (signedIn?.user) {
          const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
          if (mine) return router.replace('/wash/owner');
          ownerId = signedIn.user.id;
        }
      }
      if (!ownerId) {
        setBusy(false);
        return setError(already ? 'ALREADY' : 'تعذّر إنشاء الحساب. تأكد أن كلمة المرور 6 أحرف على الأقل وحاول مجدداً.');
      }
    }

    const { data: wash, error: washError } = await supabase
      .from('car_washes')
      .insert({
        owner_id: ownerId,
        name: name.trim(),
        city,
        address: address.trim(),
        phone: displayPhone(phone),
        lat: coords.lat,
        lng: coords.lng,
        is_24h: is24h,
        opens_at: opensAt,
        closes_at: closesAt,
        bays,
        slot_minutes: slotMinutes,
        loyalty_target: loyalty,
        plan: chosenPlan?.code ?? 'basic',
        owner_name: ownerName.trim() || null,
        whatsapp: whatsapp ? displayPhone(whatsapp) : null,
      })
      .select()
      .single();

    if (washError || !wash) {
      setBusy(false);
      return setError('تعذّر حفظ بيانات المغسلة. أعد المحاولة بالرقم وكلمة المرور نفسها.');
    }

    await supabase
      .from('wash_services')
      .insert(DEFAULT_SERVICES.map((s) => ({ ...s, wash_id: (wash as CarWash).id })));

    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="card space-y-4 p-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h2 className="text-base font-extrabold text-slate-800">وصل طلبك</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          سنتواصل معك على <span dir="ltr">{displayPhone(phone)}</span> لتفعيل الاشتراك.
        </p>
        <a href="/wash/owner/" className="btn-primary w-full">
          لوحة المغسلة
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      // «إدخال» على حقلٍ في خطوةٍ بلا زرِّ إرسال = خطوةٌ إلى الأمام
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || step === LAST) return;
        if ((e.target as HTMLElement).tagName !== 'INPUT') return;
        e.preventDefault();
        if (canNext) go(1);
      }}
      className="card space-y-5 p-5"
    >
      <div>
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-2 w-2 rounded-full ${i <= step ? 'bg-brand' : 'bg-slate-200'}`} />
          ))}
        </div>
        <p className="mt-2 text-center text-xs font-bold text-slate-500">
          الخطوة {step + 1} من {STEPS.length} — <span className="text-slate-800">{STEPS[step]}</span>
        </p>
      </div>

      {step === 0 && (
        <div>
          <label htmlFor="wash-name" className="label">
            اسم المغسلة <span className="text-traffic-red">*</span>
          </label>
          <input
            id="wash-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            className="field"
            placeholder="مغسلة النخيل"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-slate-400">كما يعرفه الناس — ٣ أحرف على الأقل.</p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wash-city" className="label">
              المدينة <span className="text-traffic-red">*</span>
            </label>
            <select id="wash-city" value={city} onChange={(e) => setCity(e.target.value)} className="field">
              {ANBAR_CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wash-address" className="label">
              العنوان <span className="text-traffic-red">*</span>
            </label>
            <input
              id="wash-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              minLength={5}
              className="field"
              placeholder="الحي - الشارع - أقرب نقطة معروفة"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <span className="label">
            موقع المغسلة <span className="text-traffic-red">*</span>
          </span>
          <MapPicker coords={coords} onPick={setCoords} center={ANBAR_CITIES.find((c) => c.name === city)} />
          <p className="mt-1 text-xs text-slate-400">حرّك الخريطة حتى يقع المؤشّر على المغسلة.</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
            <input
              type="checkbox"
              checked={is24h}
              onChange={(e) => setIs24h(e.target.checked)}
              className="h-4 w-4 accent-[#16a34a]"
            />
            <span className="text-sm font-medium">٢٤ ساعة</span>
          </label>
          {!is24h && (
            <>
              <TimeSelect id="wash-opens" label="وقت الفتح" value={opensAt} onChange={setOpensAt} />
              <TimeSelect id="wash-closes" label="وقت الإغلاق" value={closesAt} onChange={setClosesAt} />
            </>
          )}
          <div>
            <label htmlFor="wash-bays" className="label">
              المسارب
            </label>
            <select id="wash-bays" value={bays} onChange={(e) => setBays(Number(e.target.value))} className="field">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">كم سيّارة تُغسل في الوقت نفسه؟</p>
          </div>
          <div>
            <label htmlFor="wash-slot" className="label">
              مدّة الموعد
            </label>
            <select id="wash-slot" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} className="field">
              {SLOTS.map((n) => (
                <option key={n} value={n}>
                  {n} دقيقة
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wash-loyalty" className="label">
              بطاقة الغسلات
            </label>
            <select id="wash-loyalty" value={loyalty} onChange={(e) => setLoyalty(Number(e.target.value))} className="field">
              {LOYALTY.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? '٠ = بلا بطاقة' : `${n} غسلات ثمّ واحدة مجّانيّة`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          {!cfg ? (
            <div className="flex justify-center py-6">
              <SpinnerIcon className="h-5 w-5 text-brand" />
            </div>
          ) : (
            <>
              {cfg.promo_first_month > 0 && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  عرض الإطلاق: أوّل شهر {iqd(cfg.promo_first_month)} لأيّ باقة.
                </p>
              )}
              {cfg.plans.map((p) => {
                const on = (plan || cfg.plans[0]?.code) === p.code;
                const f = p.features;
                return (
                  <label key={p.code} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-brand bg-brand-50' : 'border-slate-200'}`}>
                    <input type="radio" name="wash-plan" checked={on} onChange={() => setPlan(p.code)} className="mt-1 h-4 w-4 accent-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-800">{p.name}</span>
                        <span className="text-sm font-extrabold text-brand-700">{iqd(p.price_iqd)} / شهر</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                        {limitLabel(f.booking_monthly_limit, 'حجز شهريّاً')} · {limitLabel(f.gallery_limit, 'صور')}
                        {f.offers_enabled ? ' · العروض' : ''}
                        {f.staff_limit ? ` · ${f.staff_limit} موظّفين` : ''}
                        {f.featured ? ' · ظهور مميّز' : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[11px] text-slate-400">يُفعَّل الاشتراك بعد التواصل معك واستلام المبلغ. الحجزُ مجّانيّ لزبائنك.</p>
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wash-owner" className="label">اسم صاحب المغسلة</label>
            <input id="wash-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={60} className="field" placeholder="أبو أحمد" />
          </div>
          <div>
            <label htmlFor="wash-wa" className="label">رقم واتساب (إن اختلف)</label>
            <input id="wash-wa" type="tel" inputMode="numeric" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" />
          </div>
          <div>
            <label htmlFor="wash-phone" className="label">
              رقم الهاتف <span className="text-traffic-red">*</span>
            </label>
            <input
              id="wash-phone"
              type="tel"
              inputMode="numeric"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
              placeholder="07XXXXXXXXX"
              dir="ltr"
            />
            <p className="mt-1 text-xs text-brand-700">هذا الرقم هو اسم الدخول، ويظهر للزبائن.</p>
          </div>
          <div>
            <label htmlFor="wash-password" className="label">
              كلمة المرور <span className="text-traffic-red">*</span>
            </label>
            <div className="relative">
              <input
                id="wash-password"
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
            <p className="mt-1 text-xs text-slate-400">6 أحرف أو أرقام على الأقل</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              أوافق على اشتراك باقة «{chosenPlan?.name ?? '—'}» {chosenPlan ? iqd(chosenPlan.price_iqd) : ''} شهريّاً بعد الاعتماد
              {cfg && cfg.promo_first_month > 0 ? ` (أوّل شهر ${iqd(cfg.promo_first_month)})` : ''}.
            </span>
          </label>
        </div>
      )}

      {error === 'ALREADY' ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-bold">هذا الرقم مسجّل من قبل — سجّل الدخول.</p>
          <a href="/login/" className="btn-primary mt-3 w-full">
            تسجيل الدخول
          </a>
        </div>
      ) : (
        error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
            {error}
          </p>
        )
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => go(-1)} className="btn-ghost flex-1">
            رجوع
          </button>
        )}
        {step < LAST ? (
          <button type="button" onClick={() => canNext && go(1)} disabled={!canNext} className="btn-primary flex-[2]">
            التالي
          </button>
        ) : (
          <button type="submit" disabled={busy || !agree} className="btn-primary flex-[2]">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            إرسال الطلب
          </button>
        )}
      </div>
    </form>
  );
}
