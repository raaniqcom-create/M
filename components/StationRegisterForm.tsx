'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRODUCT_ORDER } from '@/lib/products';
import { ANBAR_CITIES } from '@/lib/cities';
import { isValidIraqiMobile, phoneToEmail, displayPhone } from '@/lib/phone';
import { metresBetween, normalizeName, searchKnownFuel } from '@/lib/nearbyFuel';
import { findSimilar } from '@/lib/similar';
import type { Station } from '@/types/database';
import { CheckIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from './icons';
import { LocationField } from './LocationField';

/** تسجيلُ محطة — على أربع خطوات.
 *
 *  **كانت شاشةً واحدة، والحُجّةُ أن المعالجَ يُضيع من يسجّل من هاتفه بعجلة.**
 *  والقياسُ ردّها: «الرحاب» سُجّلت أربع مرّات في إحدى وسبعين دقيقة، واثنتان
 *  من أوّل اثنتَي عشرة كانتا أسماءَ أشخاص، وطلباتٌ تصل بموقع بيت صاحبها.
 *  فالشاشةُ الواحدة لم تكن أسرع بل أعجل، والعجلةُ تملأ الحقول بأيّ شيء.
 *
 *  **وأهمُّ ما في الخطوات أوّلُها: الاسم.**
 *
 *  نحن نملك 237 محطةً معروفة بأسمائها وإحداثياتها المسحيّة. فمن يكتب
 *  «النخيب» نعرض له المحطة باسمها الكامل ومدينتها ونسأله: هل تقصد هذه؟
 *  فتُملأ بضغطةٍ واحدة ثلاثةُ حقول — الاسم والمدينة والموقع — وبدقّةٍ لا
 *  يبلغها إبهامٌ على خريطة. والتعرّفُ أسهل من التذكّر، دائماً.
 *
 *  ومن لم تكن محطتُه فيها يكتبها بنفسه، ولا يُمنع. */

type Step = 0 | 1 | 2 | 3;

const STEPS = ['اسم المحطة', 'المدينة والعنوان', 'الموقع', 'بياناتك'];

export function StationRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  // الخطوة الأولى
  const [name, setName] = useState('');
  /** أُكّدت من قائمة المحطات المعروفة — فموقعُها مسحيٌّ لا تخمين */
  const [fromKnown, setFromKnown] = useState(false);
  const [twin, setTwin] = useState<{ id: string; name: string; city: string } | null>(null);

  // الخطوة الثانية
  const [city, setCity] = useState<string>(ANBAR_CITIES[0].name);
  const [address, setAddress] = useState('');

  // الخطوة الثالثة
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // الخطوة الرابعة
  const [loginPhone, setLoginPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [contactName, setContactName] = useState('');
  const [samePhone, setSamePhone] = useState(true);
  const [publicPhone, setPublicPhone] = useState('');
  const [owns, setOwns] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<
    { name: string; city: string; address: string; phone: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const hits = useMemo(() => (fromKnown ? [] : searchKnownFuel(name)), [name, fromKnown]);

  /** محطاتُ المنصّة المعتمدة — لنقول عن كل اقتراحٍ أهو مسجَّلٌ عندنا أصلاً.
   *
   *  **وهذا أهمُّ ما في الاقتراح، لا حاشيةٌ فيه.** الاقتراحاتُ من خرائطَ
   *  مفتوحة، وبعضُها محطاتٌ لها صاحبٌ في المنصّة اليوم. فمن رآها بلا إشارة
   *  ظنّها شاغرة فسجّلها — وهو بعينه ما وقع في «الرحاب» أربع مرّات.
   *
   *  صفٌّ واحد خفيف: المعرّف والاسم والمدينة والموقع. */
  const [platform, setPlatform] = useState<
    { id: string; name: string; city: string; lat: number | null; lng: number | null }[]
  >([]);
  useEffect(() => {
    let live = true;
    supabase
      .from('stations_public')
      .select('id, name, city, lat, lng')
      .eq('status', 'approved')
      .then(({ data }) => {
        if (live && data) setPlatform(data);
      });
    return () => {
      live = false;
    };
  }, []);

  /** المطابقةُ بالموقع أوّلاً — والاسمُ احتياطاً.
   *
   *  خمسُمئة متر عتبةٌ مقيسة لا مُخمَّنة: في مطابقة المحطات المعتمدة بنقاط
   *  الطرق كان أبعدُ تطابقٍ صحيح 424 متراً وأقربُ خطأٍ 580 — فالحدُّ يقع في
   *  فراغٍ بينهما. ومن لا موقعَ له في المنصّة يُطابَق باسمه بعد التوحيد. */
  function onPlatform(la: number, lo: number, n: string) {
    const key = normalizeName(n);
    return platform.find((s) =>
      s.lat != null && s.lng != null
        ? metresBetween({ lat: la, lng: lo }, { lat: s.lat, lng: s.lng }) <= 500
        : normalizeName(s.name) === key
    );
  }

  /** «الرحاب» دخلت أربع مرّات بأربعة أرقام، ففحصُ الرقم لم يقع مرّةً واحدة.
   *  وهذا يقارن الاسم بنفس المُطابِق الذي تحكم به لوحةُ الإدارة. إرشاديٌّ عن
   *  قصد: محطتان حقيقيّتان قد تشتركان في اسم، فيُنبّه ويعرض البابَ الذي أراده
   *  الطالبُ غالباً، ولا يمنع.
   *
   *  **والمدينةُ تُمرَّر ولا تُؤخَذ من الحالة.** المقارنةُ داخل مدينةٍ واحدة
   *  (`lib/similar.ts:41` يرفض ما اختلفت مدينتُه)، والخطواتُ تسأل عن الاسم
   *  قبل المدينة — فالقراءةُ من الحالة تفحص أبداً «الرمادي» وحدها، وهي
   *  القيمةُ الأولى، فيسكت التحذيرُ في سبعٍ وعشرين مدينة. وهو التحذيرُ
   *  الموجودُ أصلاً لأجل «الرحاب». */
  async function checkName(value: string, inCity = city) {
    if (!value.trim()) {
      setTwin(null);
      return;
    }
    const { data } = await supabase
      .from('stations_public')
      .select('id, name, city')
      .eq('city', inCity);
    if (!data) return;
    const request = { id: '', name: value, city: inCity, phone: '999999999999' } as Station;
    const [hit] = findSimilar(request, data as Station[]);
    setTwin(hit ? { id: hit.id, name: hit.name, city: inCity } : null);
  }

  /** تبديلُ المدينة يُعيد الفحص: الاسمُ سُئل عنه قبلها، فما فُحص فُحص في
   *  مدينةٍ لم يخترها صاحبُ الطلب بعد. */
  function pickCity(next: string) {
    setCity(next);
    void checkName(name, next);
  }

  function chooseKnown(h: ReturnType<typeof searchKnownFuel>[number]) {
    setName(h.station.n);
    setFromKnown(true);
    setCoords({ lat: h.station.la, lng: h.station.lo });
    const known = ANBAR_CITIES.find((c) => c.name === h.station.c);
    if (known) setCity(known.name);
    // بالقيمة الصريحة لا من الحالة: setCity أعلاه لم يُطبَّق بعد في هذه الجولة
    void checkName(h.station.n, known ? known.name : city);
  }

  /** خطوةٌ إلى أمام أو خلف — ورسالةُ الخطأ لا تُرافقها.
   *  خطأٌ من شاشةٍ أخرى معروضٌ فوق شاشةٍ لا حقلَ له فيها لغزٌ لا إرشاد. */
  function go(delta: 1 | -1) {
    setError(null);
    setStep((s) => (s + delta) as Step);
  }

  const canNext =
    step === 0
      ? name.trim().length > 1
      : step === 1
        ? address.trim().length > 2
        : step === 2
          ? !!coords
          : true;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

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
      setError('ارجع إلى خطوة الموقع وحدّد موقع المحطة.');
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
        // عبر دالّة: anon لم يعد يقرأ عمود الهاتف، وهذه تُرجع الاسم والمدينة
        // والعنوان فقط — وكلُّها ظاهرةٌ أصلاً لكل مستخدم.
        const { data: rows } = await supabase.rpc('station_by_phone', {
          p_phone: displayPhone(loginPhone),
        });
        const row = Array.isArray(rows) ? rows[0] : null;
        setExisting(row ? { ...row, phone: displayPhone(loginPhone) } : null);
      }
      setError(
        signUpError?.message.includes('already')
          ? 'ALREADY'
          : 'تعذّر إنشاء الحساب. تأكد أن كلمة المرور 6 أحرف على الأقل وحاول مجدداً.'
      );
      return;
    }

    const { data: station, error: stationError } = await supabase
      .from('stations')
      .insert({
        owner_id: auth.user.id,
        name: name.trim(),
        address: address.trim(),
        city,
        contact_name: contactName.trim(),
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

    // الإدارةُ يجب أن تعلم أن طلباً ينتظر؛ وبدونها يبقى في طابورٍ لا يراقبه أحد.
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
    <form
      onSubmit={submit}
      /** **«إدخال» في شاشةٍ بلا زرِّ إرسال يُرسل النموذج كلَّه.**
       *
       *  قاعدةُ الإرسال الضمنيّ في HTML: نموذجٌ لا زرَّ إرسالٍ فيه يُرسَل عند
       *  «إدخال» ما دام حقلٌ واحدٌ فيه يمنع ذلك — والخطوةُ الأولى فيها حقلٌ
       *  واحد (الاسم)، والثانيةُ حقلٌ واحد (العنوان، والقائمةُ المنسدلة لا
       *  تُحتسب). فكان الضغطُ عليها — وهو أطبعُ ما يفعله من ينهي حقلاً على
       *  لوحة هاتف — يستدعي submit فيصرخ «رقم الهاتف غير صحيح» في شاشةٍ لا
       *  رقمَ فيها أصلاً.
       *
       *  فيصير «إدخال» ما يتوقّعه صاحبُه: خطوةً إلى الأمام. */
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || step === 3) return;
        if ((e.target as HTMLElement).tagName !== 'INPUT') return;
        e.preventDefault();
        if (canNext) go(1);
      }}
      className="card space-y-5 p-5"
    >
      {/* شريطُ الخطوات: من يعرف أين هو من الطريق يُكمله */}
      <div>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs font-bold text-slate-500">
          الخطوة {step + 1} من {STEPS.length} — <span className="text-slate-800">{STEPS[step]}</span>
        </p>
      </div>

      {/* ─────────────── ١ · الاسم ─────────────── */}
      {step === 0 && (
        <div className="space-y-3">
          <div>
            <label htmlFor="name" className="label">
              اسم المحطة <span className="text-traffic-red">*</span>
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFromKnown(false);
                setTwin(null); // تحذيرٌ عن اسمٍ لم يعد مكتوباً تحذيرٌ عن لا شيء
              }}
              onBlur={(e) => checkName(e.target.value)}
              required
              className="field"
              placeholder="الأوائل"
              autoComplete="off"
            />
            {/* اثنتان من أوّل اثنتَي عشرة كانتا اسمَي أشخاص. واللافتةُ وحدها
                لم تكفِ، فالتوضيحُ يقول ما لا يُكتب لا ما يُكتب. */}
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              <b className="text-slate-600">لا تكتب كلمة «محطة»</b> — اكتب اسمها فقط كما يعرفه
              الناس. ولا تكتب اسمك الشخصي.
            </p>
          </div>

          {/* **التعرّفُ أسهل من التذكّر.** */}
          {hits.length > 0 && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-2.5">
              <p className="px-1 pb-1.5 text-[11px] font-bold text-brand-700">
                هل تقصد هذه المحطة؟ اختَرها ليُملأ اسمُها وموقعُها تلقائياً.
              </p>
              <div className="space-y-1.5">
                {hits.map((h) => {
                  const mine = onPlatform(h.station.la, h.station.lo, h.station.n);
                  /* **ما له صاحبٌ عندنا لا يُعرَض كخانةٍ شاغرة.** فالبطاقة
                     تقول إنها مسجّلة، وتقود إلى صفحتها ليتابعها — لا إلى
                     تسجيلٍ ثانٍ لمحطةٍ واحدة. */
                  if (mine) {
                    return (
                      <a
                        key={`${h.station.la},${h.station.lo}`}
                        href={`/station/${mine.id}`}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-right active:bg-brand-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold text-slate-800">
                            {mine.name}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10.5px] text-slate-500">{mine.city}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-[1px] text-[9.5px] font-extrabold text-white">
                              <CheckIcon className="h-2.5 w-2.5" />
                              مسجّلة في المنصّة
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[10.5px] font-bold text-brand-700 underline">
                          افتحها وتابعها
                        </span>
                      </a>
                    );
                  }
                  return (
                    <button
                      key={`${h.station.la},${h.station.lo}`}
                      type="button"
                      onClick={() => chooseKnown(h)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2 text-right active:bg-brand-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-bold text-slate-800">
                          {h.station.n}
                        </span>
                        <span className="block text-[10.5px] text-slate-500">{h.station.c}</span>
                      </span>
                      <span className="shrink-0 text-[10.5px] font-bold text-brand">اختَرها</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-slate-500">
                وما عليه <b className="text-brand-700">«مسجّلة في المنصّة»</b> له صاحبٌ عندنا —
                افتح صفحتها وتابعها، وإن كنت صاحبها فاستلمها من{' '}
                <a href="/reset" className="font-bold underline">
                  هنا
                </a>
                . وإن لم تكن محطتك منها، أكمل بالاسم الذي كتبته.
              </p>
            </div>
          )}

          {fromKnown && (
            <p className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-bold text-brand-700">
              <CheckIcon className="h-4 w-4 shrink-0" />
              اختَرت «{name}» — وموقعُها محفوظٌ عندنا، فستجده جاهزاً في خطوة الموقع.
            </p>
          )}
        </div>
      )}

      {/* ─────────────── ٢ · المدينة والعنوان ─────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="city" className="label">
              المدينة <span className="text-traffic-red">*</span>
            </label>
            <select
              id="city"
              value={city}
              onChange={(e) => pickCity(e.target.value)}
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
            <label htmlFor="address" className="label">
              عنوان المحطة <span className="text-traffic-red">*</span>
            </label>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="field"
              placeholder="الحي - الشارع - أقرب نقطة معروفة"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              اكتبه كما تصفه لمن يسألك عن الطريق إليها.
            </p>
          </div>
        </div>
      )}

      {/* ─────────────── ٣ · الموقع ─────────────── */}
      {step === 2 && (
        <div>
          <span className="label">
            موقع المحطة على الخريطة <span className="text-traffic-red">*</span>
          </span>
          {fromKnown && coords && (
            <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-bold text-brand-700">
              <CheckIcon className="h-4 w-4 shrink-0" />
              الموقع جاهزٌ من بياناتنا. راجِعه على الخريطة، وصحّحه إن لزم.
            </p>
          )}
          <LocationField coords={coords} onChange={setCoords} city={city} />
          <p className="mt-1 text-xs text-slate-400">
            هذا الموقع هو ما يقصده الناس. اضغط «أنا في المحطة الآن» وأنت داخلها، أو اختر
            النقطة من الخريطة.
          </p>
        </div>
      )}

      {/* ─────────────── ٤ · بياناتك ─────────────── */}
      {step === 3 && (
        <div className="space-y-4">
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
            <p className="mt-1 text-xs text-slate-400">6 أحرف أو أرقام على الأقل — احفظها جيداً</p>
          </div>

          <div>
            <label htmlFor="contact_name" className="label">
              اسم الشخص المعني بتحديث الحالة <span className="text-traffic-red">*</span>
            </label>
            <input
              id="contact_name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
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
            <p className="mt-1 text-xs text-slate-400">هذا الرقم وحده يظهر للمستخدمين</p>
          </div>

          {/* مراجعةٌ أخيرة: ما سيُرسَل، مجموعاً في نظرة */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11px] leading-relaxed text-slate-700">
            <p className="font-extrabold text-slate-800">{name || '—'}</p>
            <p>
              {city} — {address || '—'}
            </p>
            {coords && (
              <p className="mt-0.5 text-slate-500" dir="ltr">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
          </div>

          <p className="rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
            لا تتم مشاركة أي من بياناتك خارج النظام. رقم الدخول وكلمة المرور لا يظهران لأحد.
          </p>

          {/* البوّابةُ الأخيرة قبل إنشاء حسابٍ وصفِّ محطةٍ وصفوفِ منتجات —
              وكلُّها تقع قبل أن تتدخّل الإدارة. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={owns}
              onChange={(e) => setOwns(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              أؤكّد أنني <b>صاحب هذه المحطة</b> أو المسؤول عن تحديث بياناتها، وألتزم بتحديث
              توفّر الوقود فيها.
            </span>
          </label>
        </div>
      )}

      {error === 'ALREADY' && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-bold">هذه المحطة مسجّلة بالفعل بهذا الرقم.</p>
          {existing && (
            <div className="mt-2 rounded-lg bg-white/70 p-2.5 text-xs leading-relaxed text-slate-700">
              <p className="font-bold">{existing.name}</p>
              <p>
                {existing.city} — {existing.address}
              </p>
              <p className="mt-1" dir="ltr">
                {existing.phone}
              </p>
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

      {/* **التوأم يُقال حيث يُكتشف، لا حيث سُئل عنه.**
          الفحص يحتاج الاسمَ والمدينةَ معاً، والمدينةُ تُختار في الخطوة الثانية —
          فلوحةٌ داخل الأولى وحدها تظهر بعد أن يُغادَر المكانُ الذي تُرى فيه. */}
      {twin && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-extrabold text-amber-900">
            «{twin.name}» مسجّلة بالفعل في {twin.city}.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
            إن كنت تريد أن يصلك إشعار عند توفّر الوقود فيها، فتابِعها ولا تسجّلها من
            جديد. ولا تكمل التسجيل هنا إلا إن كنت صاحبها.
          </p>
          <a href={`/station/${twin.id}`} className="btn-primary mt-3 w-full">
            افتح صفحتها وتابعها
          </a>
        </div>
      )}

      {/* ─────────────── التنقّل ─────────────── */}
      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="btn-ghost flex-1"
          >
            رجوع
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={() => canNext && go(1)}
            disabled={!canNext}
            className="btn-primary flex-[2] disabled:opacity-60"
          >
            التالي
          </button>
        ) : (
          <button type="submit" disabled={busy || !owns} className="btn-primary flex-[2]">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            إرسال الطلب
          </button>
        )}
      </div>

      {step === 3 && (
        <p className="text-center text-xs text-slate-400">
          تظهر محطتك للمستخدمين بعد موافقة الإدارة
        </p>
      )}
    </form>
  );
}
