'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ANBAR_CITIES } from '@/lib/cities';
import { displayPhone, isValidIraqiMobile, phoneToEmail } from '@/lib/phone';
import { awaitAuthReady, iqd, limitLabel, time12, VEHICLE_LABELS, VEHICLE_TYPES, type CarWash } from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { MAX_SIDE, THUMB_SIDE, putWashImage, shrinkImage } from '@/lib/washUpload';
import { num } from '@/lib/num';
import { TimeSelect } from './TimeSelect';
import { CheckIcon, EyeIcon, EyeOffIcon, ImageIcon, PlusIcon, SpinnerIcon, XIcon } from './icons';

// Leaflet يلمس window عند الاستيراد — لا يُرسَم على الخادم
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-brand-50">
      <SpinnerIcon className="h-5 w-5 text-brand" />
    </div>
  ),
});

const STEPS = ['رقم الهاتف', 'معلومات المحطة', 'صور المحطة', 'أوقات العمل', 'الخدمات والأسعار', 'اختيار الاشتراك', 'المراجعة والإرسال'];
const LAST = STEPS.length - 1;
const SLOTS = [15, 30, 45, 60];
const LOYALTY = [0, 4, 5, 6, 8, 10];
const MINUTES = Array.from({ length: 22 }, (_, i) => 15 + i * 5);
const GALLERY_MAX = 4;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** نداءُ دالّة otp — الرسائلُ عربيّةٌ من الخادم وتُعرض كما هي؛ الحالةُ تميّز «مسجّلٌ مسبقاً» (409). */
async function otp(body: Record<string, unknown>): Promise<{ retryIn?: number }> {
  const res = await fetch(`${URL_}/functions/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'تعذّر إتمام الطلب'), { status: res.status, retryIn: data.retryIn });
  return data;
}

type Phase = 'phone' | 'code' | 'login' | 'password' | 'ready';
type Pic = { file: File; url: string };
interface Row {
  name: string;
  price: string;
  minutes: number;
  byVehicle: boolean;
  prices: Record<string, string>;
  description: string;
}
/** خدمتان افتراضيّتان يعدّلهما المالك أو يحذفهما — لا سعرَ ثابتاً في القاعدة. */
const seed = (): Row[] => [
  { name: 'غسيل خارجي', price: '5000', minutes: 20, byVehicle: false, prices: {}, description: '' },
  { name: 'غسيل شامل', price: '10000', minutes: 45, byVehicle: false, prices: {}, description: '' },
];
/** حدودُ القاعدة نفسها (الاسم 2–40، الوصف ≤160)، والسعرُ الفارغُ ليس صفراً. */
const rowOk = (r: Row) => {
  const n = r.name.trim().length;
  return n >= 2 && n <= 40 && r.description.length <= 160 && r.price.trim() !== '' && Number.isFinite(Number(r.price)) && Number(r.price) >= 0;
};

/** تسجيلُ محطّة غسيل — سبعُ خطوات: الهاتفُ يُتحقَّق أوّلاً (OTP)، والحسابُ يُنشأ عند الإرسال. */
export function WashRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // 1 — الهاتف
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(0);
  const [loginPw, setLoginPw] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /** حسابٌ موجودٌ دخل بكلمة مرور — لا signUp عند الإرسال. */
  const [existing, setExisting] = useState(false);

  // 2 — المحطة
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone2, setPhone2] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // 3 — الصور (ملفّاتٌ في الذاكرة حتى الإرسال: الصفُّ يجب أن يوجد قبل الرفع)
  const [cover, setCover] = useState<Pic | null>(null);
  const [gallery, setGallery] = useState<Pic[]>([]);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  function pic(file: File): Pic {
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { file, url };
  }

  // 4 — الدوام
  const [is24h, setIs24h] = useState(false);
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('22:00');
  const [bays, setBays] = useState(2);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [loyalty, setLoyalty] = useState(5);

  // 5 — الخدمات
  const [rows, setRows] = useState<Row[]>(seed);

  // 6 — الباقة
  const cfg = useWashConfig();
  const [plan, setPlan] = useState<string>('');
  const chosenPlan = cfg?.plans.find((p) => p.code === (plan || cfg.plans[0]?.code));
  const [agree, setAgree] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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

  // عدّادُ إعادة الإرسال: ثانيةٌ بثانية حتى الصفر ثمّ يتوقّف.
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  function go(delta: 1 | -1) {
    setError(null);
    setStep((s) => Math.min(LAST, Math.max(0, s + delta)));
  }
  function jump(s: number) {
    setError(null);
    setStep(s);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      if (!isValidIraqiMobile(phone)) throw new Error('رقم الهاتف غير صحيح. اكتبه هكذا: 07XXXXXXXXX');
      try {
        await otp({ action: 'send', phone, purpose: 'register' });
        setCode('');
        setPhase('code');
        setLeft(60);
      } catch (e) {
        const err = e as Error & { status?: number; retryIn?: number };
        // مسجّلٌ مسبقاً: صاحبُ محطةِ وقودٍ يضيف مغسلةً، أو محاولةٌ انقطعت — يدخل بكلمة مروره.
        if (err.status === 409) return setPhase('login');
        // مُقيَّدٌ مؤقّتاً: رمزٌ سابقٌ ما زال صالحاً — نُظهر حقلَه والعدّاد بدل حبسه في خطوة الرقم.
        if (err.status === 429 && err.retryIn) {
          setLeft(err.retryIn);
          setPhase('code');
        }
        throw err;
      }
    });

  const verify = () =>
    run(async () => {
      await otp({ action: 'verify', phone, code });
      setPhase('password');
    });

  const login = () =>
    run(async () => {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password: loginPw });
      if (e || !data.user) throw new Error('كلمة المرور غير صحيحة.');
      const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
      if (mine) return router.replace('/wash/owner');
      setExisting(true);
      setPhase('ready');
    });

  function resetPhone() {
    setPhase('phone');
    setExisting(false);
    setCode('');
    setLoginPw('');
    setPassword('');
    setConfirm('');
    setError(null);
  }

  const pwOk = password.length >= 6 && password === confirm;
  const canNext = [
    phase === 'ready' || (phase === 'password' && pwOk),
    name.trim().length >= 3 &&
      name.trim().length <= 60 &&
      area.trim().length >= 1 &&
      area.trim().length <= 40 &&
      address.trim().length >= 5 &&
      !!coords &&
      (!phone2 || isValidIraqiMobile(phone2)) &&
      (!whatsapp || isValidIraqiMobile(whatsapp)),
    true,
    true,
    rows.length > 0 && rows.every(rowOk),
    !!chosenPlan && agree,
    true,
  ][step];

  /** «إدخال» في الخطوة الأولى يفعل ما يفعله زرُّها. */
  function phoneAction() {
    if (busy) return;
    if (phase === 'phone') return void send();
    if (phase === 'code' && code.length === 6) return void verify();
    if (phase === 'login' && loginPw) return void login();
    if (canNext) go(1);
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!coords) return setError('ارجع إلى خطوة معلومات المحطة وحدّد موقعها.');
    if (!chosenPlan) return setError('اختر باقة.');

    setBusy(true);
    setError(null);
    const email = phoneToEmail(phone);

    let ownerId: string | null = null;
    if (existing) {
      ownerId = (await supabase.auth.getUser()).data.user?.id ?? null;
    } else {
      const { data: auth, error: signUpError } = await supabase.auth.signUp({ email, password });
      ownerId = auth.user?.id ?? null;
      if (signUpError || !ownerId) {
        const already = signUpError?.message.toLowerCase().includes('already');
        if (already) {
          // حسابٌ يتيمٌ من محاولةٍ انقطعت: من يعرف كلمة المرور يُكمل.
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
    }
    if (!ownerId) {
      setBusy(false);
      return setError('انتهت الجلسة — ارجع إلى الخطوة الأولى وسجّل الدخول.');
    }

    // رأسُ المصادقة قد لا يكون لُصق بعد signUp/signIn مباشرةً — ننتظر جلسةً بـtoken أوّلاً.
    await awaitAuthReady(supabase);
    const washRow = {
        owner_id: ownerId,
        name: name.trim(),
        city,
        area: area.trim(),
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
        plan: chosenPlan.code,
        owner_name: ownerName.trim() || null,
        whatsapp: whatsapp ? displayPhone(whatsapp) : null,
        phone2: phone2 ? displayPhone(phone2) : null,
    };
    // الإدراجُ بلا RETURNING: سياسةُ القراءة على car_washes هي manages_wash(id) وهي دالّةٌ
    // STABLE تُعيد الاستعلامَ عن car_washes، فلا ترى الصفَّ المُدرَجَ في لقطة الجملة نفسِها
    // فيُرفض insert…returning بـ42501 والصفُّ لا يُحفظ. نُدرج ثمّ نقرأ الصفَّ في جملةٍ لاحقةٍ يراها.
    const { error: insErr } = await supabase.from('car_washes').insert(washRow);
    if (insErr) {
      setBusy(false);
      return setError('تعذّر حفظ بيانات المغسلة. أعد المحاولة بالرقم وكلمة المرور نفسها.');
    }
    const { data: wash } = await supabase.from('car_washes').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!wash) {
      setBusy(false);
      return setError('حُفظت المغسلة لكن تعذّر فتحُ لوحتها — سجّل الدخول من صفحة الدخول.');
    }
    const id = (wash as CarWash).id;
    const notes: string[] = [];

    const { error: svcErr } = await supabase.from('wash_services').insert(
      rows.map((r, i) => {
        // أسعارُ الأنواع: ما كُتب رقماً صالحاً فقط (الفارغُ ليس صفراً)، وإلّا null (سعرٌ واحد).
        const pv: Record<string, number> = {};
        if (r.byVehicle)
          for (const v of VEHICLE_TYPES) {
            const n = Number(r.prices[v]);
            if (r.prices[v]?.trim() && Number.isFinite(n) && n >= 0) pv[v] = n;
          }
        return {
          wash_id: id,
          name: r.name.trim(),
          price: Math.round(Number(r.price)),
          minutes: r.minutes,
          sort: i + 1,
          prices: Object.keys(pv).length ? pv : null,
          description: r.description.trim() || null,
        };
      })
    );
    if (svcErr) notes.push('تعذّر حفظ الخدمات — أضفها من لوحتك لاحقاً.');

    // الصورُ بعد الصفّ: الغلافُ ومصغّرُه أوّلاً، ثمّ المعرضُ بحدّ الباقة كما يحسبه حارسُ القاعدة (غائب = 1، صفر = بلا معرض) —
    // تحديثان منفصلان كي لا يُسقط رفضُ المعرض الغلافَ معه.
    const limit = Math.max(0, Number(chosenPlan.features.gallery_limit ?? 1));
    const keep = gallery.slice(0, limit);
    if (keep.length < gallery.length) notes.push(limit > 0 ? `باقتك تسمح بـ${limit} من الصور — رُفعت ${limit} منها.` : 'باقتك لا تشمل معرض صور — رُفع الغلاف فقط.');
    try {
      if (cover) {
        const [c, t] = await Promise.all([shrinkImage(cover.file, MAX_SIDE), shrinkImage(cover.file, THUMB_SIDE)]);
        const image_url = await putWashImage(`${id}/cover.jpg`, c);
        const thumb_url = await putWashImage(`${id}/thumb.jpg`, t);
        const { error: e2 } = await supabase.from('car_washes').update({ image_url, thumb_url }).eq('id', id);
        if (e2) throw e2;
      }
    } catch {
      notes.push('تعذّر رفع الغلاف — أضفه من لوحتك لاحقاً.');
    }
    try {
      if (keep.length) {
        const photos = await Promise.all(keep.map(async (p, i) => putWashImage(`${id}/g${i + 1}.jpg`, await shrinkImage(p.file, MAX_SIDE))));
        const { error: e3 } = await supabase.from('car_washes').update({ photos }).eq('id', id);
        if (e3) throw e3;
      }
    } catch {
      notes.push('تعذّر رفع الصور — أضفها من لوحتك لاحقاً.');
    }

    setBusy(false);
    setDone(notes.join(' '));
  }

  if (done !== null) {
    return (
      <div className="card space-y-4 p-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-extrabold text-slate-800">تم استلام طلب تسجيل المحطة</h2>
        <p className="text-sm leading-relaxed text-slate-600">سيتم مراجعة المعلومات وتفعيل الحساب بعد الموافقة.</p>
        <p className="text-sm text-slate-600">
          سنتواصل معك على <span dir="ltr">{displayPhone(phone)}</span>
        </p>
        {done && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{done}</p>}
        <a href="/wash/owner/" className="btn-primary w-full">
          لوحة المغسلة
        </a>
        <a href="/wash/" className="btn-ghost w-full">
          العودة إلى المغاسل
        </a>
      </div>
    );
  }

  const req = <span className="text-traffic-red">*</span>;
  const eye = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      aria-pressed={showPassword}
      className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
    >
      {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
    </button>
  );
  const edit = (s: number) => (
    <button type="button" onClick={() => jump(s)} className="-my-2 min-h-[44px] shrink-0 text-[12px] font-bold text-brand-700 underline">
      تعديل
    </button>
  );

  return (
    <form
      onSubmit={submit}
      // «إدخال» على حقلٍ في خطوةٍ بلا زرِّ إرسال = خطوةٌ إلى الأمام
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || (e.target as HTMLElement).tagName !== 'INPUT') return;
        e.preventDefault();
        if (step === 0) return phoneAction();
        if (step < LAST && canNext) go(1);
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
        <div className="space-y-4">
          {phase === 'phone' && (
            <>
              <div>
                <label htmlFor="wash-phone" className="label">
                  رقم الهاتف {req}
                </label>
                <input id="wash-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" autoComplete="tel" />
                <p className="mt-1 text-xs text-brand-700">هذا الرقم هو اسم الدخول، ويظهر للزبائن.</p>
              </div>
              <button type="button" onClick={send} disabled={busy || !isValidIraqiMobile(phone)} className="btn-primary w-full">
                {busy && <SpinnerIcon className="h-4 w-4" />}
                إرسال رمز التحقق
              </button>
            </>
          )}

          {phase === 'code' && (
            <>
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                أرسلنا رمزاً من 6 أرقام إلى <span dir="ltr">{displayPhone(phone)}</span>.
              </p>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="------"
                aria-label="رمز التحقّق"
                className="field text-center text-xl font-bold tracking-[0.4em]"
              />
              <button type="button" onClick={verify} disabled={busy || code.length !== 6} className="btn-primary w-full">
                {busy && <SpinnerIcon className="h-4 w-4" />}
                تحقّق
              </button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={send} disabled={busy || left > 0} className="min-h-[44px] font-semibold text-brand-700 disabled:text-slate-400">
                  {left > 0 ? `إعادة الإرسال بعد ${left} ث` : 'لم يصلك الرمز؟ أعد الإرسال'}
                </button>
                <button type="button" onClick={resetPhone} className="min-h-[44px] font-semibold text-slate-500">
                  تغيير الرقم
                </button>
              </div>
            </>
          )}

          {phase === 'login' && (
            <>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                هذا الرقم مسجّل مسبقاً — أدخل كلمة المرور لتكمل بحسابك.
              </p>
              <div>
                <label htmlFor="wash-login-pw" className="label">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input id="wash-login-pw" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} className="field pr-12" dir="ltr" />
                  {eye}
                </div>
              </div>
              <button type="button" onClick={login} disabled={busy || !loginPw} className="btn-primary w-full">
                {busy && <SpinnerIcon className="h-4 w-4" />}
                تسجيل الدخول
              </button>
              <div className="flex items-center justify-between text-xs">
                <a href="/reset/" className="flex min-h-[44px] items-center font-semibold text-brand-700">
                  نسيت كلمة المرور؟
                </a>
                <button type="button" onClick={resetPhone} className="min-h-[44px] font-semibold text-slate-500">
                  تغيير الرقم
                </button>
              </div>
            </>
          )}

          {(phase === 'password' || phase === 'ready') && (
            <>
              <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
                <CheckIcon className="h-4 w-4 shrink-0" />
                <span>
                  تمّ التحقّق من <span dir="ltr">{displayPhone(phone)}</span>
                </span>
                <button type="button" onClick={resetPhone} className="-my-2 ms-auto min-h-[44px] font-semibold text-slate-500 underline">
                  تغيير
                </button>
              </p>
              {phase === 'password' && (
                <>
                  <div>
                    <label htmlFor="wash-password" className="label">
                      كلمة المرور {req}
                    </label>
                    <div className="relative">
                      <input id="wash-password" type={showPassword ? 'text' : 'password'} minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field pr-12" dir="ltr" />
                      {eye}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">6 أحرف أو أرقام على الأقل</p>
                  </div>
                  <div>
                    <label htmlFor="wash-confirm" className="label">
                      تأكيد كلمة المرور {req}
                    </label>
                    <input id="wash-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" dir="ltr" />
                    {confirm && password !== confirm && <p className="mt-1 text-xs text-traffic-red">كلمتا المرور غير متطابقتين.</p>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wash-name" className="label">
              اسم المحطة {req}
            </label>
            <input id="wash-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} className="field" placeholder="مغسلة النخيل" autoComplete="off" />
            <p className="mt-1 text-[11px] text-slate-400">كما يعرفه الناس — 3 أحرف على الأقل.</p>
          </div>
          <div>
            <label htmlFor="wash-owner" className="label">
              اسم المسؤول
            </label>
            <input id="wash-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={60} className="field" placeholder="أبو أحمد" />
          </div>
          <div>
            <span className="label">رقم الهاتف</span>
            <input value={displayPhone(phone)} readOnly className="field bg-slate-50 text-slate-500" dir="ltr" aria-label="رقم الهاتف" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="wash-phone2" className="label">
                رقم إضافي
              </label>
              <input id="wash-phone2" type="tel" inputMode="numeric" value={phone2} onChange={(e) => setPhone2(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" />
            </div>
            <div>
              <label htmlFor="wash-wa" className="label">
                رقم واتساب
              </label>
              <input id="wash-wa" type="tel" inputMode="numeric" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="wash-city" className="label">
                المدينة {req}
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
              <label htmlFor="wash-area" className="label">
                المنطقة {req}
              </label>
              <input id="wash-area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} className="field" placeholder="شارع 60" />
            </div>
          </div>
          <div>
            <label htmlFor="wash-address" className="label">
              العنوان {req}
            </label>
            <input id="wash-address" value={address} onChange={(e) => setAddress(e.target.value)} minLength={5} className="field" placeholder="الحي - الشارع - أقرب نقطة معروفة" />
          </div>
          <div>
            <span className="label">الموقع على الخريطة {req}</span>
            {/* MapPicker يقرأ center عند التركيب فقط — المفتاحُ يعيد تركيبَه مع كلّ مدينة (والدبّوسُ المختارُ يبقى لأنّ coords تسبق center). */}
            <MapPicker key={city} coords={coords} onPick={setCoords} center={ANBAR_CITIES.find((c) => c.name === city)} />
            <p className="mt-1 text-xs text-slate-400">حرّك الخريطة حتى يقع المؤشّر على المحطة.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <span className="label">صورة الغلاف</span>
            {cover ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.url} alt="" className="h-40 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(cover.url);
                    setCover(null);
                  }}
                  aria-label="حذف الغلاف"
                  className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-traffic-red shadow-soft before:absolute before:-inset-2 before:content-['']"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
            <label className="btn-ghost mt-2 w-full cursor-pointer">
              <ImageIcon className="h-4 w-4" />
              {cover ? 'تغيير الغلاف' : 'اختر صورة الغلاف'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setCover(pic(f));
                }}
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-400">اختياريّة — لكنّ محطّةً بصورةٍ تُحجز أكثر.</p>
          </div>

          <div>
            <p className="label">
              صور إضافية <span className="font-normal text-slate-400">({gallery.length} من {GALLERY_MAX})</span>
            </p>
            {gallery.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {gallery.map((p) => (
                  <div key={p.url} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-20 w-28 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setGallery((g) => g.filter((x) => x !== p));
                      }}
                      aria-label="حذف الصورة"
                      className="absolute -start-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-traffic-red shadow-soft before:absolute before:-inset-2.5 before:content-['']"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {gallery.length < GALLERY_MAX && (
              <label className="btn-ghost mt-2 w-full cursor-pointer">
                <PlusIcon className="h-4 w-4" />
                إضافة صورة
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    setGallery((g) => [...g, ...files.slice(0, GALLERY_MAX - g.length).map(pic)]);
                  }}
                />
              </label>
            )}
            <p className="mt-1 text-[11px] text-slate-400">تُرفع الصورُ بعد الإرسال، بحدّ باقتك.</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
            <input type="checkbox" checked={is24h} onChange={(e) => setIs24h(e.target.checked)} className="h-4 w-4 accent-[#16a34a]" />
            <span className="text-sm font-medium">مفتوحة 24 ساعة</span>
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
                  {n === 0 ? 'بلا بطاقة' : `${n} غسلات ثمّ واحدة مجّانيّة`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">عدّل الأسعار كما تريد — كلّ شيء يُدار من لوحتك لاحقاً.</p>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-500">خدمة {i + 1}</span>
                <button type="button" onClick={() => setRows((all) => all.filter((_, j) => j !== i))} className="-my-1 min-h-[44px] text-[12px] font-bold text-traffic-red">
                  حذف
                </button>
              </div>
              <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} maxLength={40} className="field" placeholder="اسم الخدمة" aria-label="اسم الخدمة" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" inputMode="numeric" min={0} step={250} value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} className="field" placeholder="السعر (د.ع)" aria-label="السعر" dir="ltr" />
                <select value={r.minutes} onChange={(e) => setRow(i, { minutes: Number(e.target.value) })} className="field" aria-label="المدّة">
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} دقيقة
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={r.byVehicle} onChange={(e) => setRow(i, { byVehicle: e.target.checked })} className="h-4 w-4 accent-[#16a34a]" />
                سعرٌ يختلف بنوع السيارة
              </label>
              {r.byVehicle && (
                <div className="grid grid-cols-2 gap-2">
                  {VEHICLE_TYPES.map((v) => (
                    <label key={v} className="text-[11px] text-slate-600">
                      {VEHICLE_LABELS[v]}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={250}
                        value={r.prices[v] ?? ''}
                        onChange={(e) => setRow(i, { prices: { ...r.prices, [v]: e.target.value } })}
                        className="field mt-0.5 text-sm"
                        placeholder={r.price || 'السعر'}
                        dir="ltr"
                      />
                    </label>
                  ))}
                </div>
              )}
              <textarea value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} rows={2} maxLength={160} className="field py-2" placeholder="وصفٌ قصير (اختياري)" aria-label="الوصف" />
            </div>
          ))}
          <button type="button" onClick={() => setRows((all) => [...all, { name: '', price: '', minutes: 30, byVehicle: false, prices: {}, description: '' }])} className="btn-ghost w-full">
            <PlusIcon className="h-4 w-4" />
            إضافة خدمة
          </button>
          {rows.length === 0 && <p className="text-xs text-traffic-red">أضف خدمةً واحدةً على الأقل.</p>}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          {!cfg ? (
            <div className="flex justify-center py-6">
              <SpinnerIcon className="h-5 w-5 text-brand" />
            </div>
          ) : (
            <>
              {cfg.promo_first_month > 0 && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">عرض الإطلاق: أوّل شهر {iqd(cfg.promo_first_month)} لأيّ باقة.</p>
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
                        {f.staff_limit ? ` · ${limitLabel(f.staff_limit, 'موظّفين')}` : ''}
                        {f.featured ? ' · ظهور مميّز' : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[11px] text-slate-400">يُفعَّل الاشتراك بعد التواصل معك واستلام المبلغ. الحجزُ مجّانيّ لزبائنك.</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                <span className="text-xs leading-relaxed text-slate-600">
                  أوافق على اشتراك باقة «{chosenPlan?.name ?? '—'}» {chosenPlan ? iqd(chosenPlan.price_iqd) : ''} شهريّاً بعد الاعتماد
                  {cfg.promo_first_month > 0 ? ` (أوّل شهر ${iqd(cfg.promo_first_month)})` : ''}.
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {step === 6 && (
        <dl className="divide-y divide-slate-100 text-sm">
          {(
            [
              ['رقم الهاتف', <span dir="ltr">{displayPhone(phone)}</span>, 0],
              ['المحطة', `${name.trim()} — ${city} – ${area.trim()}`, 1],
              ['العنوان', address.trim(), 1],
              ['الصور', cover || gallery.length ? `${cover ? 'غلاف' : 'بلا غلاف'} · ${num(gallery.length)} إضافية` : 'بلا صور', 2],
              ['الدوام', is24h ? 'مفتوحة 24 ساعة' : `${time12(opensAt)} – ${time12(closesAt)}`, 3],
              ['المسارب والموعد', `${num(bays)} مسرب · ${num(slotMinutes)} دقيقة`, 3],
              ['الخدمات', `${num(rows.length)} خدمات: ${rows.map((r) => r.name.trim()).join('، ')}`, 4],
              ['الباقة', chosenPlan ? `${chosenPlan.name} — ${iqd(chosenPlan.price_iqd)} / شهر` : '—', 5],
            ] as [string, React.ReactNode, number][]
          ).map(([k, v, s]) => (
            <div key={k} className="flex items-start gap-2 py-2.5">
              <dt className="w-24 shrink-0 text-[12px] text-slate-500">{k}</dt>
              <dd className="flex min-w-0 flex-1 items-start justify-between gap-2 break-words font-medium text-slate-800">
                <span className="min-w-0">{v}</span>
                {edit(s)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {error === 'ALREADY' ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-bold">هذا الرقم مسجّل من قبل — سجّل الدخول.</p>
          <button
            type="button"
            onClick={() => {
              resetPhone();
              setPhase('login');
              jump(0);
            }}
            className="btn-primary mt-3 w-full"
          >
            تسجيل الدخول
          </button>
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
          <button type="submit" disabled={busy} className="btn-primary flex-[2]">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            إرسال للمراجعة
          </button>
        )}
      </div>
    </form>
  );
}
