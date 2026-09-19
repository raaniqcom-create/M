'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ANBAR_CITIES } from '@/lib/cities';
import { displayPhone, isValidIraqiMobile, phoneToEmail } from '@/lib/phone';
import { awaitAuthReady, iqd, limitLabel, time12, VEHICLE_HINT, VEHICLE_LABELS, VEHICLE_TYPES, type CarWash } from '@/lib/wash';
import { useWashConfig } from '@/lib/washConfig';
import { num } from '@/lib/num';
import { TimeSelect } from './TimeSelect';
import { CheckIcon, EyeIcon, EyeOffIcon, PlusIcon, SpinnerIcon } from './icons';

// Leaflet يلمس window عند الاستيراد — لا يُرسَم على الخادم
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-brand-50">
      <SpinnerIcon className="h-5 w-5 text-brand" />
    </div>
  ),
});

const STEPS = ['الحساب', 'المغسلة', 'الدوام والخدمات', 'الاشتراك والإرسال'];
const LAST = STEPS.length - 1;
const SLOTS = [15, 30, 45, 60];
const MINUTES = Array.from({ length: 22 }, (_, i) => 15 + i * 5);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** نداءُ دالّة otp — الرسائلُ عربيّةٌ من الخادم وتُعرض كما هي؛ الحالةُ تميّز «مسجّلٌ مسبقاً» (409). */
async function otp(body: Record<string, unknown>): Promise<{ retryIn?: number; via?: string }> {
  const res = await fetch(`${URL_}/functions/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'تعذّر إتمام الطلب'), { status: res.status, retryIn: data.retryIn });
  return data;
}

/** 'email': تسجيلٌ بإيميلٍ حقيقيٍّ بلا رمزِ تحقّق — الهاتفُ يبقى لاسترجاع كلمة المرور والتواصل. */
type Phase = 'phone' | 'login' | 'password' | 'ready' | 'email';
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

/** تسجيلُ مغسلة — أربعُ خطوات: الحسابُ أوّلاً، والحسابُ يُنشأ عند الإرسال؛ الصورُ تُرفع لاحقاً من اللوحة. */
export function WashRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // 1 — الهاتف
  const [phase, setPhase] = useState<Phase>('email');
  const [phone, setPhone] = useState('');
  /** من أين وصل الرمز: null = رسالة، وإلّا اسمُ بوت تيليجرام. */
  const [emailAddr, setEmailAddr] = useState('');
  /** عنوانُ الدخول بعد «مسجّلٌ مسبقاً» من تبويب الإيميل — وإلّا الإيميلُ المشتقُّ من الهاتف. */
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
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

  // 3 — الدوام والخدمات (بطاقةُ الغسلات تُضبط من اللوحة — الافتراضيُّ 5)
  const [is24h, setIs24h] = useState(false);
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('22:00');
  const [bays, setBays] = useState(2);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const loyalty = 5;
  const [rows, setRows] = useState<Row[]>(seed);

  // 4 — الباقة
  const cfg = useWashConfig();
  const [plan, setPlan] = useState<string>('');
  const chosenPlan = cfg?.plans.find((p) => p.code === (plan || cfg.plans[0]?.code));
  const [agree, setAgree] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /** من إعلان «سجّل مغسلتك في {المدينة}»: المدينةُ محدّدةٌ مسبقاً، وfree = مدينةٌ دون ألف مشترك. */
  const [promo, setPromo] = useState<'free' | 'paid' | null>(null);

  // تصديرٌ ساكن: الاستعلامُ يُقرأ في أثرٍ لا أثناء الرسم.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const c = q.get('city');
    if (c && (ANBAR_CITIES as readonly { name: string }[]).some((x) => x.name === c)) setCity(c);
    const pr = q.get('promo');
    if (pr === 'free' || pr === 'paid') setPromo(pr);
  }, []);

  // من له مغسلةٌ أصلاً لا يسجّل ثانية — إلى لوحته. والمشرفُ (?as=admin) يستعرض المعالجَ بعين المسجِّل.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (new URLSearchParams(location.search).get('as') === 'admin') return;
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

  /** ــ الرقمُ يُفحص ولا يُستوثق منه برمز ــــــــــــــــــــــــــــــــــ
   *
   *  «وارفع التسجيل عن otp الان» — صاحبُ المنصّة، ١٩ أيلول.
   *
   *  والرمزُ هنا كان بوّابةً لا كتابة: `verify` لا تُنشئ شيئاً لغرض
   *  `register`، بل يُنشأ الحسابُ في المتصفّح بعدها. فرفعُه يُسقط خطوةً
   *  ويُبقي المسارَ كما هو.
   *
   *  **وفحصُ التكرار يبقى** — وهو ما كان يقع قبل الإرسال لا به: رقمٌ له
   *  حسابٌ يُردّ بـ409 فيُساق إلى الدخول بكلمة مروره، لا إلى حسابٍ ثانٍ
   *  يتيمٍ لا يملك مغسلةً. وذاك أنفعُ ما كانت البوّابةُ تفعله. */
  const send = () =>
    run(async () => {
      if (!isValidIraqiMobile(phone)) throw new Error('رقم الهاتف غير صحيح. اكتبه هكذا: 07XXXXXXXXX');
      try {
        await otp({ action: 'direct', phone, purpose: 'register' });
        setPhase('password');
      } catch (e) {
        const err = e as Error & { status?: number };
        // مسجّلٌ مسبقاً: صاحبُ محطةِ وقودٍ يضيف مغسلةً، أو محاولةٌ انقطعت — يدخل بكلمة مروره.
        if (err.status === 409) return setPhase('login');
        throw err;
      }
    });

  const login = () =>
    run(async () => {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: loginEmail ?? phoneToEmail(phone), password: loginPw });
      if (e || !data.user) throw new Error('كلمة المرور غير صحيحة.');
      const { data: mine } = await supabase.rpc('my_wash').maybeSingle();
      if (mine) return router.replace('/wash/owner');
      setExisting(true);
      setPhase('ready');
    });

  function resetPhone() {
    setPhase('phone');
    setLoginEmail(null);
    setExisting(false);
    setLoginPw('');
    setPassword('');
    setConfirm('');
    setError(null);
  }

  const pwOk = password.length >= 6 && password === confirm;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr.trim());
  const canNext = [
    phase === 'ready' || (phase === 'password' && pwOk) || (phase === 'email' && emailOk && isValidIraqiMobile(phone) && pwOk),
    name.trim().length >= 3 &&
      name.trim().length <= 60 &&
      area.trim().length <= 40 &&
      address.trim().length >= 5 &&
      !!coords &&
      (!phone2 || isValidIraqiMobile(phone2)) &&
      (!whatsapp || isValidIraqiMobile(whatsapp)),
    rows.length > 0 && rows.every(rowOk),
    !!chosenPlan && agree,
  ][step];

  /** «إدخال» في الخطوة الأولى يفعل ما يفعله زرُّها. */
  function phoneAction() {
    if (busy) return;
    if (phase === 'phone') return void send();
    if (phase === 'email' && !canNext) return;
    if (phase === 'login' && loginPw) return void login();
    if (canNext) go(1);
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!coords) return setError('ارجع إلى خطوة المغسلة وحدّد موقعها.');
    if (!chosenPlan) return setError('اختر باقة.');
    if (!agree) return setError('وافق على شروط الاشتراك أوّلاً.');

    setBusy(true);
    setError(null);
    // بالإيميل: عنوانُ الدخول هو الإيميلُ نفسُه، والهاتفُ في بيانات الحساب لاسترجاع كلمة المرور بالرمز.
    const email = phase === 'email' ? emailAddr.trim().toLowerCase() : phoneToEmail(phone);

    let ownerId: string | null = null;
    if (existing) {
      ownerId = (await supabase.auth.getUser()).data.user?.id ?? null;
    } else {
      const { data: auth, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { phone: displayPhone(phone) } } });
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
    setBusy(false);
    setDone(svcErr ? 'تعذّر حفظ الخدمات — أضفها من لوحتك لاحقاً.' : '');
  }

  if (done !== null) {
    return (
      <div className="card space-y-4 p-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-extrabold text-slate-800">تم استلام طلب تسجيل المغسلة</h2>
        <p className="text-sm leading-relaxed text-slate-600">سيتم مراجعة المعلومات وتفعيل الحساب بعد الدفع والموافقة.</p>
        <p className="text-sm text-slate-600">
          سنتواصل معك على <span dir="ltr">{displayPhone(phone)}</span>
        </p>
        {done && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{done}</p>}
        {promo === 'free' && (cfg?.trial_days ?? 0) > 0 ? (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-[12px] font-bold text-brand-800">مدينتك ضمن عرض الانطلاق — تفعّل الإدارة التجربة المجانية بعد المراجعة.</p>
        ) : (
          <>
            <a href="/wash/owner/subscription/" className="btn-primary w-full">
              ادفع الآن — إدارة الاشتراك
            </a>
            <p className="text-[12px] leading-relaxed text-slate-500">أو ادفع لاحقاً: يبقى حسابك غير مفعّل حتى تدخل إلى صفحة الاشتراكات وتضيف إيصال الدفع وتكتب في ملاحظات التحويل «المغسلة».</p>
          </>
        )}
        <p className="text-[11px] text-slate-400">الصور تُرفع لاحقاً من لوحة المغسلة.</p>
        <a href="/wash/owner/" className="btn-ghost w-full">
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
  /** حقلا كلمة المرور — بعد رمز الهاتف، أو مع الإيميل مباشرة. */
  const pwFields = (
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
          {(phase === 'phone' || phase === 'email') && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="طريقة التسجيل">
              {(['email', 'phone'] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={phase === m} onClick={() => { setPhase(m); setError(null); }} className={`min-h-[40px] rounded-lg text-[12.5px] font-bold ${phase === m ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500'}`}>
                  {m === 'email' ? 'بالإيميل — الأسهل' : 'برقم الهاتف — رمز تحقق'}
                </button>
              ))}
            </div>
          )}

          {phase === 'email' && (
            <>
              <div>
                <label htmlFor="wash-email" className="label">
                  الإيميل {req}
                </label>
                <input id="wash-email" type="email" inputMode="email" value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} className="field" placeholder="name@example.com" dir="ltr" autoComplete="email" />
                <p className="mt-1 text-xs text-brand-700">هذا هو اسم الدخول. لا رمز تحقّق ولا رسائل.</p>
              </div>
              <div>
                <label htmlFor="wash-phone-e" className="label">
                  رقم هاتف المغسلة {req}
                </label>
                <input id="wash-phone-e" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" autoComplete="tel" />
                <p className="mt-1 text-xs text-slate-500">يظهر للزبائن، وبه تسترجع كلمة المرور إن نسيتها.</p>
              </div>
              {pwFields}
            </>
          )}

          {phase === 'phone' && (
            <>
              <div>
                <label htmlFor="wash-phone" className="label">
                  رقم الهاتف {req}
                </label>
                <input id="wash-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className="field" placeholder="07XXXXXXXXX" dir="ltr" autoComplete="tel" />
                <p className="mt-1 text-xs text-brand-700">هذا الرقم هو اسم الدخول، ويظهر للزبائن.</p>
              </div>
              <button type="button" onClick={() => send()} disabled={busy || !isValidIraqiMobile(phone)} className="btn-primary w-full">
                {busy && <SpinnerIcon className="h-4 w-4" />}
                متابعة
              </button>
            </>
          )}

          {phase === 'login' && (
            <>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                {loginEmail ? 'هذا الإيميل' : 'هذا الرقم'} مسجّل مسبقاً — أدخل كلمة المرور لتكمل بحسابك.
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
              {phase === 'password' && pwFields}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="wash-name" className="label">
              اسم المغسلة {req}
            </label>
            <input id="wash-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} className="field" placeholder="مغسلة النخيل" autoComplete="off" />
            <p className="mt-1 text-[11px] text-slate-400">كما يعرفه الناس — 3 أحرف على الأقل.</p>
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
                المنطقة
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
            <p className="mt-1 text-xs text-slate-400">حرّك الخريطة حتى يقع المؤشّر على المغسلة.</p>
          </div>
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-bold text-slate-600">بيانات إضافية (اختياري)</summary>
            <div className="mt-3 space-y-3">
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
            </div>
          </details>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="wash-bays" className="label">
                عدد الخانات
              </label>
              <select id="wash-bays" value={bays} onChange={(e) => setBays(Number(e.target.value))} className="field">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">كم خانة؟ — كم سيارة تُغسل في الوقت نفسه</p>
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
          </div>

          <p className="label pt-2">الخدمات والأسعار</p>
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
                      <span className="block font-bold text-slate-700">{VEHICLE_LABELS[v]}</span>
                      {/* التسمياتُ تختلف بين الناس — السطرُ يحسم ما يندرج تحت كلّ حجم قبل أن يُسعّره. */}
                      <span className="block text-[11px] leading-tight text-slate-500">{VEHICLE_HINT[v]}</span>
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

      {step === 3 && (
        <div className="space-y-3">
          {!cfg ? (
            <div className="flex justify-center py-6">
              <SpinnerIcon className="h-5 w-5 text-brand" />
            </div>
          ) : (
            <>
              {promo === 'free' && cfg.trial_days > 0 ? (
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-800">مدينتك ضمن عرض الانطلاق: {cfg.trial_days} يوماً مجاناً على أيّ باقة — تُفعَّل بعد موافقة الإدارة، بلا دفع.</p>
              ) : cfg.promo_first_month > 0 && (
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

          <p className="label pt-2">مراجعة الطلب</p>
          <dl className="divide-y divide-slate-100 text-[13px]">
            {(
              [
                ['رقم الهاتف', <span dir="ltr">{displayPhone(phone)}</span>, 0],
                ['المغسلة', `${name.trim()} — ${city}${area.trim() ? ` – ${area.trim()}` : ''}`, 1],
                ['العنوان', address.trim(), 1],
                ['الدوام', is24h ? 'مفتوحة 24 ساعة' : `${time12(opensAt)} – ${time12(closesAt)}`, 2],
                ['الخانات والموعد', `${num(bays)} خانة · ${num(slotMinutes)} دقيقة`, 2],
                ['الخدمات', `${num(rows.length)} خدمات: ${rows.map((r) => r.name.trim()).join('، ')}`, 2],
              ] as [string, React.ReactNode, number][]
            ).map(([k, v, s]) => (
              <div key={k} className="flex items-start gap-2 py-2">
                <dt className="w-24 shrink-0 text-[12px] text-slate-500">{k}</dt>
                <dd className="flex min-w-0 flex-1 items-start justify-between gap-2 break-words font-medium text-slate-800">
                  <span className="min-w-0">{v}</span>
                  {edit(s)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {error === 'ALREADY' ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-bold">{phase === 'email' ? 'هذا الإيميل' : 'هذا الرقم'} مسجّل من قبل — سجّل الدخول.</p>
          <button
            type="button"
            onClick={() => {
              const viaEmail = phase === 'email' ? emailAddr.trim().toLowerCase() : null;
              resetPhone();
              setLoginEmail(viaEmail);
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
          <button type="submit" disabled={busy || !canNext} className="btn-primary flex-[2]">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            إرسال للمراجعة
          </button>
        )}
      </div>
    </form>
  );
}
