'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, timeoutSignal } from '@/lib/supabase';
import { isAborted, readFailure } from '@/lib/fn';
import { ANBAR_CITIES } from '@/lib/cities';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { ANNOUNCE_TEMPLATES, tooLong, type TemplateInput } from '@/lib/announceTemplates';
import { SpinnerIcon } from './icons';
import type { FuelProduct } from '@/types/database';

const CITY_NAMES = ANBAR_CITIES.map((c) => c.name);

/** Announcing fuel at a station that has not joined the platform yet.
 *
 *  A stop-gap by design: once a station registers, its own owner does this from
 *  their panel and the announcement carries their name and links to their page.
 *  Until then the choice is between telling people nothing and telling them
 *  what the directorate told us — and the people who installed the app this
 *  week are owed the second.
 *
 *  Nothing here sends directly. It writes a row, and the sweep that already
 *  runs every two minutes delivers it: one code path for a scheduled send and
 *  an immediate one, so "now" cannot behave differently from "at ten". */
export function StationAnnouncePanel() {
  const [templateId, setTemplateId] = useState(ANNOUNCE_TEMPLATES[0].id);
  const [station, setStation] = useState('');
  // معرّف المحطة المختارة من القائمة. فارغٌ يعني «غير مسجّلة — اكتب اسمها».
  const [pickedId, setPickedId] = useState('');
  const [registered, setRegistered] = useState<{ id: string; name: string; city: string }[]>([]);
  const [asPopup, setAsPopup] = useState(false);
  const [product, setProduct] = useState<FuelProduct>('gasoline_premium');
  const [city, setCity] = useState<string>(CITY_NAMES[0]);
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [hours, setHours] = useState(3);

  const [reach, setReach] = useState<{ ios: number; android: number; web: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** تحذيرُ التكرار. وجودُه يوقف النشرة الأولى ويحوّل الزرّ إلى «انشر رغم ذلك». */
  const [dupWarn, setDupWarn] = useState<string | null>(null);
  // يبقى بين الضغطات ولا يُمسح إلا بعد حفظٍ مؤكَّد، فإعادة المحاولة — تلقائية
  // كانت أو بيد المدير — تحمل المفتاح نفسه ولا تُنشئ خبراً ثانياً.
  const keyRef = useRef<string | null>(null);

  const template = ANNOUNCE_TEMPLATES.find((t) => t.id === templateId)!;
  // المسجّلة كلها مرة واحدة، وتُصفّى بالمدينة عند العرض: القائمة ثابتة الحجم
  // (عشرات لا آلاف)، ونداءٌ لكل تغيير مدينة عملٌ بلا مقابل.
  useEffect(() => {
    supabase
      .from('stations_public')
      .select('id, name, city')
      .eq('status', 'approved')
      .order('name')
      .then(({ data }) => setRegistered((data ?? []) as { id: string; name: string; city: string }[]));
  }, []);

  const inCity = registered.filter((r) => r.city === city);

  // تبديل المدينة يُسقط الاختيار: محطةٌ من الرمادي تحت عنوان الفلوجة أسوأ من
  // خانةٍ فارغة، لأنها تُرسَل ولا يُنتبه لها.
  useEffect(() => {
    setPickedId('');
    setStation('');
  }, [city]);

  // تغيّرَ ما يُحذَّر منه، فيسقط التحذير: من بدّل المحطة أو المنتج أو الموعد
  // لم يعد أمام القرار الذي حُذِّر منه.
  useEffect(() => setDupWarn(null), [station, city, product, when, at]);

  const input: TemplateInput = { station: station.trim() || '…', city, product };

  // Everyone who will be notified: the station's own city, plus any neighbour
  // the admin adds — someone in Amiriyat may well drive to Falluja for fuel.
  const audience = useMemo(
    () => [...new Set([city, ...extraCities])],
    [city, extraCities]
  );

  const title = template.title(input);
  const line = template.line(input);
  // مصفوفةٌ من عنصرٍ واحد: العمودُ `ticker` نصوصٌ، وسطرُ الشريط عن المحطة
  // لا عن مدينة القارئ. وكانت تُبنى بطول الجمهور ولا يُقرأ منها إلا الأوّل.
  const ticker = [template.ticker(input)];
  const lengthError = station.trim() ? tooLong(template, input) : null;

  function toggleExtra(c: string) {
    setExtraCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  /** Counts before it sends. A notification cannot be recalled, so the number of
   *  phones about to buzz is shown while the decision is still reversible. */
  async function countReach() {
    setErr(null);
    setReach(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('announce_reach', {
        p_cities: audience,
        p_product: product,
      });
      // كانت تُعرض رسالة المكتبة كما هي، فقرأ المدير «AbortError: Fetch is
      // aborted» — إنجليزيةً، وداخليةً، ولا تقول له ماذا يفعل. والعدّ قراءة
      // لا كتابة، فإعادة المحاولة بلا ثمن.
      if (error) return setErr(readFailure(error));
      const r = (data ?? {}) as { ios?: number; android?: number; web?: number };
      setReach({ ios: r.ios ?? 0, android: r.android ?? 0, web: r.web ?? 0 });
    } catch (e) {
      setErr(readFailure(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setErr(null);
    setNote(null);

    if (!station.trim()) return setErr('اكتب اسم المحطة.');
    if (lengthError) return setErr(lengthError);
    if (when === 'later' && !at) return setErr('اختر وقت الظهور.');

    // A local datetime-local value is wall-clock in the admin's own timezone;
    // new Date() reads it that way, and toISOString converts it correctly.
    const sendAt = when === 'now' ? new Date() : new Date(at);
    if (when === 'later' && Number.isNaN(sendAt.getTime())) return setErr('وقت غير صالح.');
    if (when === 'later' && sendAt.getTime() < Date.now() - 60_000) {
      return setErr('الوقت المختار في الماضي.');
    }

    // ── تحذيرُ التكرار ───────────────────────────────────────────────────
    //
    // فجرَ الرابع من أيلول جُدول الخبرُ مرّتين بفارق دقيقتين: الأولى وصلت
    // 995 جهازاً بنصٍّ خاطئ، والثانية بالنصّ الصحيح وصلت **خمسة** — لأن مهلةَ
    // الخمس والأربعين دقيقة تُقاس على الشخص لا على الخبر، فمن وصله الأوّلُ
    // سكت عن الثاني.
    //
    // ويحذّر ولا يمنع: المدير قد يقصد التكرار. ويفشل **مفتوحاً** — تحذيرٌ
    // يصير مانعاً عند تعثّر شبكةٍ أسوأُ من غياب التحذير.
    if (!dupWarn) {
      const w = 45 * 60_000;
      const { data: near } = await supabase
        .from('announcements')
        .select('send_at, sent_at')
        .eq('station_name', station.trim())
        .eq('origin_city', city)
        .eq('product', product)
        .eq('active', true)
        .gte('send_at', new Date(sendAt.getTime() - w).toISOString())
        .lte('send_at', new Date(sendAt.getTime() + w).toISOString())
        .order('send_at', { ascending: false })
        .limit(1)
        .abortSignal(timeoutSignal(8_000) as AbortSignal);

      const prev = (near ?? [])[0];
      if (prev) {
        const gap = Math.max(1, Math.round(Math.abs(sendAt.getTime() - new Date(prev.send_at).getTime()) / 60_000));
        setDupWarn(
          prev.sent_at
            ? `أُرسل خبرٌ لهذه المحطة وهذا المنتج قبل ${gap} دقيقة. ومهلةُ الشخص الواحد ٤٥ دقيقة — فمن وصله الأوّلُ لن يصله هذا، وتعود المهلة بعد ${Math.max(1, 45 - gap)} دقيقة.`
            : `خبرٌ آخر لهذه المحطة وهذا المنتج ينتظر الإرسال ${new Date(prev.send_at).toLocaleString('ar-IQ')} — وبينه وبين هذا ${gap} دقيقة. سيخرج أحدهما أوّلاً فيبتلع المهلة، ولن يصل الثاني أحداً تقريباً. الأفضلُ إلغاءُ أحدهما من «ما ينتظر الإرسال» أدناه.`
        );
        return;
      }
    }

    setBusy(true);

    // مفتاحٌ واحد لكل ضغطة، يُعاد به في كل محاولة. فإن كانت محاولةٌ سابقة قد
    // وصلت القاعدة والتزمت قبل أن ينقطع الجواب، ترتدّ التالية على الفهرس
    // الفريد (23505) بدل أن تُنشئ خبراً ثانياً — والخبر الثاني يصل الناس ولا
    // يُستردّ. وبهذا صارت إعادة المحاولة آمنة، فصارت تلقائية.
    if (!keyRef.current) {
      keyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    const key = keyRef.current;

    const row = {
      title,
      // **جملةٌ واحدة، لا سطرٌ لكلِّ مدينة.**
      //
      // كان المتنُ يُكتب سطراً لكلِّ مدينةِ جمهور. والصفُّ لا يحمل إلا محطةً
      // واحدة (`station_name` عمودٌ مفرد)، فالأسطرُ كلُّها الجملةُ نفسُها
      // مكرّرة — ثمّ يقرؤها المُرسِلُ فيحسبها محطاتٍ عدّة، فيستبدل بها قائمةَ
      // المدن: «16 محطات في الفلوجة والرمادي…» عن محطةٍ واحدة، إلى تسعِ مئةٍ
      // وخمسةٍ وتسعين جهازاً. ضاع الخبرُ وبقي التوجيه.
      //
      // والمدينةُ في الجملة مدينةُ **المحطة** لا مدينةُ المستلم — وهي ما
      // يحتاجه قارئٌ في الكرمة ليقرّر أيقود أم لا. والمناطقُ تبقى في `cities`
      // أدناه: توجيهاً لا نصّاً، كما أراد المالك.
      //
      // وبهذا صار المحفوظُ هو المُعايَنُ هو المُرسَلُ هو ما تعرضه ‎/news‎ وما
      // يقيسه `tooLong` — أربعُ صورٍ كانت تفترق، صارت واحدة.
      body: line,
      note: 'هذه المحطة لم تسجّل في التطبيق بعد. ننشر الخبر لأن وصول المعلومة إليكم أهمّ من انتظارها. وإن كنت صاحب محطة أو تعرف صاحبها فالتسجيل مجاني، ويجعل خبر محطتك يصل أهل مدينتك بنفسه لحظة تعلنه.',
      source: 'إدارة المحطة التقنية',
      product,
      cities: audience,
      // الاسم والمدينة في عمودين لا في نصّ الإشعار وحده.
      //
      // كان الخبر يصل ثم يختفي: من فتح هاتفه بعد ساعة لا يجد أثراً للمحطة، ولا
      // نستطيع نحن عرضها ولا تتبّعها لأن اسمها مدفون في body. وحفظهما هنا هو
      // ما يجعل اللوحة الحمراء ممكنة أصلاً.
      station_name: station.trim(),
      origin_city: city,
      linked_station_id: pickedId || null,
      as_popup: asPopup,
      // سطر واحد بمدينة المحطة الحقيقية، لا سطر لكل مدينة جمهور: خمس مدن
      // كانت تعني خمسة أسطر متطابقة إلا في آخر كلمة، تزحم الشريط وتطرد
      // أخبار المحطات المسجّلة منه.
      ticker: [template.ticker(input)],
      send_at: sendAt.toISOString(),
      expires_at: new Date(sendAt.getTime() + hours * 3600_000).toISOString(),
      active: true,
      client_key: key,
    };

    // ثلاث محاولات، ومهلةٌ ثلاثون ثانية لا اثنتا عشرة: هذه كتابةٌ يقصدها
    // إنسان ضغط زرّاً وينتظر، لا قراءةً في خلفية شاشة. والمهلة القصيرة كافية
    // لقائمة المحطات، وليست كافية لهاتفٍ على 4G ضعيف في الثانية صباحاً.
    let error: { code?: string; message: string } | null = null;
    let landed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await supabase
        .from('announcements')
        .insert(row)
        .abortSignal(timeoutSignal(30_000) as AbortSignal);
      error = r.error;
      if (!error) break;
      // سبقتْ محاولةٌ ووصلت. الخبر مجدول، والانقطاع كان في الجواب لا في الطلب.
      if (error.code === '23505') { error = null; landed = true; break; }
      // خطأٌ من القاعدة لا انقطاع — إعادته لن تغيّر جوابها.
      if (!isAborted(error)) break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
    setBusy(false);

    // والكتابة ليست كالقراءة: طلبٌ يُجهَض لا يعني أنه لم يقع. الإدراج قد يكون
    // وصل القاعدة والتزم بينما تخلّى المتصفح عن انتظار الجواب — فمن يقرأ
    // «تعذّر الحفظ» يُعيد الضغط، فيُجدول الخبر مرتين ويصل الناس مرتين، وإشعارٌ
    // أُرسل لا يُستردّ. فيُقال الحقّ: لا نعرف، فافحص قبل أن تُعيد.
    if (error) {
      return setErr(
        isAborted(error)
          ? 'انقطع الاتصال في المحاولات الثلاث. أعد الضغط حين تتحسّن الشبكة — وإن كانت إحداها قد وصلت فلن يتكرّر الخبر، سنقول لك ذلك.'
          : `تعذّر الحفظ: ${error.message}`
      );
    }
    keyRef.current = null;

    if (landed) {
      // وصلت محاولةٌ سابقة. ولا نؤكّد نصّاً لم نكتبه: يُقرأ الصفّ المحفوظ
      // ويُقال وقته كما هو في القاعدة — فلو كان المدير قد عدّل شيئاً بعد
      // الانقطاع، عرف أن المحفوظ هو الأول لا ما بين يديه الآن.
      const { data: saved } = await supabase
        .from('announcements')
        .select('send_at')
        .eq('client_key', key)
        .maybeSingle();
      setNote(
        saved?.send_at
          ? `كان قد حُفظ في محاولة سابقة — يُرسل ${new Date(saved.send_at).toLocaleString('ar-IQ')}. لم يتكرّر.`
          : 'كان قد حُفظ في محاولة سابقة. لم يتكرّر.'
      );
    } else {
      setNote(
        when === 'now'
          ? 'حُفظ. يُرسل خلال دقيقتين ويظهر في الشريط عند إرساله.'
          : `حُفظ. يُرسل ${sendAt.toLocaleString('ar-IQ')} ويظهر في الشريط عندها.`
      );
    }
    setStation('');
    setReach(null);
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-bold">إشعارات المحطات</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          لإعلان توفّر الوقود في محطة لم تسجّل بعد. مؤقّت — حين تسجّل المحطة يصبح صاحبها
          هو من يعلن، ويحمل الإشعار اسمه ورابط صفحته.
        </p>

        <label className="label mt-4 block">النموذج</label>
        <div className="grid grid-cols-1 gap-2">
          {ANNOUNCE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              aria-pressed={t.id === templateId}
              className={`rounded-xl border p-3 text-start transition-colors duration-200 ${
                t.id === templateId
                  ? 'border-brand bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`block text-sm font-bold ${t.id === templateId ? 'text-brand-700' : 'text-slate-700'}`}>
                {t.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>

        {/* الاختيار من قائمة أولاً، والكتابة استثناء.
          *
          *  كان الاسم نصّاً حرّاً، والربط بالمحطة يقع بمطابقة ilike في الاتجاهين
          *  — تخطئ فتربط اسمين متشابهين، وتخطئ فلا تربط اسماً كُتب بصياغة أخرى
          *  فتظهر محطة مسجّلة في لوحة «غير المسجّلة». والاختيار من القائمة يجعل
          *  الربط معرّفاً صريحاً لا تخميناً. */}
        <label htmlFor="an-pick" className="label mt-4 block">
          المحطة <span className="text-traffic-red">*</span>
        </label>
        <select
          id="an-pick"
          value={pickedId}
          onChange={(e) => {
            const v = e.target.value;
            setPickedId(v);
            setStation(v ? (inCity.find((r) => r.id === v)?.name ?? '') : '');
          }}
          className="field"
        >
          <option value="">— محطة غير مسجّلة (اكتب اسمها) —</option>
          {inCity.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {!pickedId && (
          <>
            <label htmlFor="an-station" className="label mt-3 block">
              اسم المحطة غير المسجّلة
            </label>
            <input
              id="an-station"
              value={station}
              onChange={(e) => setStation(e.target.value)}
              placeholder="الرمادي القديمة (السينما)"
              className="field"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              اكتب الاسم وحده بلا وصفٍ زائد — هو ما يُعرض للناس، ويُبحث به إن سجّلت المحطة
              لاحقاً.
            </p>
          </>
        )}

        {pickedId && (
          <p className="mt-1 text-[11px] leading-relaxed text-brand-800">
            محطة مسجّلة — الخبر يُربط بصفحتها، ولا يُعرض إلا ما دامت لوحتها تؤكّد المنتج.
          </p>
        )}

        {/* المقاطعة تُطلب ولا تقع تلقائياً: انتباه القارئ ينفد، وشاشةٌ تظهر مع
            كل خبر تُعلّمه إغلاقها قبل قراءتها. */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={asPopup}
            onChange={(e) => setAsPopup(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-xs leading-relaxed text-slate-600">
            <b>اعرضه كشاشة منبثقة</b>
            <span className="mt-1 block text-slate-500">
              تظهر لمن يفتح التطبيق مرةً واحدة، وتُغلق ولا تعود. للخبر الاستثنائي وحده —
              وكثرتها تُفقدها أثرها.
            </span>
          </span>
        </label>

        <label htmlFor="an-product" className="label mt-4 block">نوع المنتج</label>
        <select
          id="an-product"
          value={product}
          onChange={(e) => setProduct(e.target.value as FuelProduct)}
          className="field"
        >
          {PRODUCT_ORDER.map((p) => (
            <option key={p} value={p}>{PRODUCT_LABELS[p]}</option>
          ))}
        </select>

        <label htmlFor="an-city" className="label mt-4 block">مدينة المحطة</label>
        <select
          id="an-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="field"
        >
          {CITY_NAMES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <p className="label mt-4">مدن إضافية يصلها الإشعار (اختياري)</p>
        <div className="flex flex-wrap gap-1.5">
          {CITY_NAMES.filter((c) => c !== city).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleExtra(c)}
              aria-pressed={extraCities.includes(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                extraCities.includes(c)
                  ? 'border-brand bg-brand-100 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-sm font-bold">وقت الظهور</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([['now', 'الآن'], ['later', 'بوقت محدّد']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setWhen(v)}
              aria-pressed={when === v}
              className={`min-h-[44px] rounded-xl border text-sm font-bold ${
                when === v ? 'border-brand bg-brand-100 text-brand' : 'border-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {when === 'later' && (
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="field mt-3"
            aria-label="وقت الظهور"
          />
        )}

        <label htmlFor="an-hours" className="label mt-4 block">
          يبقى في الشريط (ساعات)
        </label>
        <input
          id="an-hours"
          type="number"
          min={1}
          max={24}
          value={hours}
          onChange={(e) => setHours(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
          className="field"
          dir="ltr"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          بعدها يختفي وحده. خبر الوقود يفسد بسرعة — وبقاؤه بعد نفاد الكمية أسوأ من
          عدم نشره.
        </p>
      </section>

      {/* What the phone will actually show, built by the same functions that
          build the real thing — not a description of it. */}
      <section className="card p-5">
        <h3 className="text-sm font-bold">المعاينة</h3>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-extrabold text-slate-800">{title}</p>
          <p className="mt-1 text-xs text-slate-600">{line}</p>
          <p className="mt-2 text-[11px] text-slate-400" dir="ltr">
            {title.length}/64 · {line.length}/178
          </p>
        </div>

        <p className="mt-3 text-[11px] font-bold text-slate-500">في الشريط السفلي:</p>
        <p className="mt-1 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-semibold text-white">
          {ticker[0]}
        </p>

        {lengthError && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-traffic-red">
            {lengthError}
          </p>
        )}

        <button
          type="button"
          onClick={countReach}
          disabled={busy}
          className="btn-ghost mt-4 w-full disabled:opacity-60"
        >
          {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'كم شخصاً سيصله؟'}
        </button>

        {reach && (
          <p className="mt-2 rounded-xl bg-brand-50 p-3 text-xs font-semibold leading-relaxed text-brand-900">
            سيصل <strong dir="ltr">{reach.ios + reach.android + reach.web}</strong> شخصاً —{' '}
            <span dir="ltr">{reach.ios}</span> آيفون · <span dir="ltr">{reach.android}</span> أندرويد ·{' '}
            <span dir="ltr">{reach.web}</span> متصفح، في {audience.join(' و ')}.
          </p>
        )}
      </section>

      <section className="card p-5">
        <button
          type="button"
          onClick={publish}
          disabled={busy || !station.trim() || !!lengthError}
          className="btn-primary w-full disabled:opacity-50"
        >
          {busy ? (
            <SpinnerIcon className="mx-auto h-5 w-5" />
          ) : dupWarn ? (
            'انشر رغم ذلك'
          ) : when === 'now' ? (
            'انشر الآن'
          ) : (
            'جدول النشر'
          )}
        </button>

        {dupWarn && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900">
            ⚠️ {dupWarn}
          </p>
        )}

        {err && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-traffic-red">{err}</p>
        )}
        {note && (
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs font-semibold leading-relaxed text-brand-700">
            {note}
          </p>
        )}
      </section>
    </div>
  );
}
