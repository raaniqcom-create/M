'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { randomId } from '@/lib/uid';
import { NOTICE_TEMPLATES, type NoticeVars } from '@/lib/noticeTemplates';
import { SpinnerIcon } from './icons';

/** تنبيهٌ عامٌّ من المنصّة إلى كلِّ الأجهزة — يُكتب من قالب، ويُجدوَل.
 *
 *  **وموسمُ الامتحانات هو الذي استدعاه.** يُقطع الإنترنت في عموم العراق
 *  ساعاتٍ معلومة، فلا تصل تحديثاتُ المحطات ولا تصل الإشعارات — والمنصّةُ
 *  تعرض حينها حالةً قديمةً كأنها الآن. والتنبيهُ **قبل** القطع هو الحيلةُ
 *  الوحيدة الممكنة: بعده لا يصل شيء.
 *
 *  ولذلك يُجدوَل ولا يُترك لمن يستيقظ في الخامسة والنصف. والمِكنسةُ التي
 *  تُرسل الأخبار المجدولة كانت قائمةً أصلاً منذ آب — وكانت **تتخطّى** كلَّ
 *  خبرٍ بلا مدن بعد أن تحجزه، فيُختَم «أُرسل» ولا يصل أحداً. صُلّح ذلك معها.
 *
 *  وشاشةُ «ما ينتظر الإرسال» تحته هي بابُ التراجع: ما جُدول يُلغى ما دام لم
 *  يُحجَز بعد. */
export function PlatformNotice() {
  const [tplKey, setTplKey] = useState('cut_dist');
  const [vars, setVars] = useState<NoticeVars>({ cutAt: '', city: '', distAt: '', note: '' });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** حرّرَ المديرُ النصَّ بيده، فلا يُعاد كتابتُه من تحته */
  const [edited, setEdited] = useState(false);

  const [when, setWhen] = useState<'now' | 'later'>('later');
  const [at, setAt] = useState('');
  const [hours, setHours] = useState(6);

  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** مفتاحٌ ثابتٌ للمحاولة الواحدة: ضغطتان لا تُنتجان خبرين */
  const keyRef = useRef<string | null>(null);

  const tpl = NOTICE_TEMPLATES.find((t) => t.key === tplKey) ?? NOTICE_TEMPLATES[0];

  /** أقربُ وقوعٍ لهذه الساعة: اليومَ إن لم تمضِ، وإلّا غداً. */
  const nextAt = useCallback((hm: string) => {
    const p = (n: number) => String(n).padStart(2, '0');
    const [h, m] = hm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now() + 60_000) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);

  function pick(key: string) {
    const t = NOTICE_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setTplKey(key);
    setEdited(false);
    setTitle(t.title(vars));
    setBody(t.body(vars));
    setHours(t.hours);
    setReach(null);
    setNote(null);
    if (t.suggest) {
      setWhen('later');
      setAt(nextAt(t.suggest));
    } else {
      setWhen('now');
    }
  }

  // أوّلُ تعبئة، ثمّ كلَّما تغيّر حقلٌ — ما لم يُحرَّر النصُّ بيد
  useEffect(() => {
    if (edited) return;
    setTitle(tpl.title(vars));
    setBody(tpl.body(vars));
  }, [tpl, vars, edited]);

  useEffect(() => {
    if (!at && tpl.suggest) setAt(nextAt(tpl.suggest));
  }, [at, tpl.suggest, nextAt]);

  const sendAt = when === 'now' ? new Date() : new Date(at);
  const timeBad = when === 'later' && (!at || Number.isNaN(sendAt.getTime()));
  const ready = title.trim().length >= 3 && body.trim().length >= 10 && !timeBad;

  async function preview() {
    setErr(null);
    setNote(null);
    setBusy(true);
    const r = await callFn<{ audience: { ios: number; android: number; web: number } }>(
      'announce',
      { title: title.trim(), body: body.trim(), dryRun: true }
    );
    setBusy(false);
    if (!r.ok || !r.data) return setErr(r.error ?? 'تعذّر حساب عدد الأجهزة');
    const a = r.data.audience;
    setReach(a.ios + a.android + a.web);
  }

  async function schedule() {
    setErr(null);
    setBusy(true);
    // `client_key` عمودُه uuid لا نصّ. و`randomId` تنتهي في آخر ملاذٍ إلى
    // `id-…` وهو ليس uuid — فيردّ Postgres 22P02 ولا يُحفظ الخبر. فيُفحَص
    // الشكل: إمّا مفتاحٌ صحيح، وإمّا null بلا حراسةٍ من التكرار — والمراجعةُ
    // قبل التأكيد تحرس ما تبقّى.
    if (keyRef.current === null) {
      const id = randomId();
      keyRef.current = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ? id
        : '';
    }
    const { error } = await supabase.from('announcements').insert({
      title: title.trim().slice(0, 64),
      body: body.trim(),
      source: 'إدارة المحطة التقنية',
      // بلا مدنٍ ولا منتج: خبرُ المنصّة كلِّها، يذهب إلى كلِّ جهاز.
      cities: null,
      product: null,
      // وبلا اسمِ محطة، فلا يظهر في لوحة المحطات غير المسجّلة — شرطُ ظهورها
      // هناك `station_name is not null`.
      station_name: null,
      send_at: sendAt.toISOString(),
      expires_at: new Date(sendAt.getTime() + hours * 3600_000).toISOString(),
      active: true,
      client_key: keyRef.current || null,
    });
    setBusy(false);
    // 23505 يعني أن ضغطةً سابقة وصلت. لا يُكرَّر الخبر، ولا يُقال «فشل».
    if (error && error.code !== '23505') return setErr(`تعذّر الحفظ: ${error.message}`);
    keyRef.current = null;
    setReach(null);
    setEdited(false);
    setNote(
      when === 'now'
        ? 'جُدول للإرسال الآن — يصل خلال دقيقتين. وتجده أسفلَه حتى يخرج.'
        : `جُدول ${sendAt.toLocaleString('ar-IQ')} — يصل خلال دقيقتين من موعده. وتجده أسفلَه حتى يخرج.`
    );
  }

  const field = (k: keyof NoticeVars, label: string, ph: string) => (
    <div key={k}>
      <label htmlFor={`nv-${k}`} className="label">
        {label}
      </label>
      {k === 'note' ? (
        <textarea
          id={`nv-${k}`}
          rows={2}
          value={vars[k]}
          placeholder={ph}
          onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
          className="field py-2"
        />
      ) : (
        <input
          id={`nv-${k}`}
          value={vars[k]}
          placeholder={ph}
          onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
          className="field"
        />
      )}
    </div>
  );

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold">تنبيه عامّ لكل المستخدمين</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        يصل كل جهاز — لا مدينةً واحدة ولا متابعي محطة. اختر قالباً، واضبط موعده.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {NOTICE_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t.key)}
            aria-pressed={t.key === tplKey}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold ${
              t.key === tplKey ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">{tpl.hint}</p>

      {tpl.fields.length > 0 && (
        <div className="mt-3 space-y-3">
          {tpl.fields.includes('cutAt') && field('cutAt', 'ساعة القطع', '6:00 صباحاً')}
          {tpl.fields.includes('city') && field('city', 'مدينة التوزيع', 'الرمادي')}
          {tpl.fields.includes('distAt') && field('distAt', 'ساعة التوزيع', '6:30')}
          {tpl.fields.includes('note') && field('note', 'نصّ إضافي', 'اكتب السبب أو أيّ نصّ')}
        </div>
      )}

      <div className="mt-3">
        <label htmlFor="pn-title" className="label">
          العنوان
        </label>
        <input
          id="pn-title"
          value={title}
          maxLength={64}
          onChange={(e) => {
            setTitle(e.target.value);
            setEdited(true);
            setReach(null);
          }}
          className="field"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="pn-body" className="label">
          النصّ
        </label>
        <textarea
          id="pn-body"
          rows={4}
          value={body}
          maxLength={500}
          onChange={(e) => {
            setBody(e.target.value);
            setEdited(true);
            setReach(null);
          }}
          className="field py-2"
        />
        <p className="mt-1 text-[10.5px] text-slate-400">{body.length}/500</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setWhen('now');
            setReach(null);
          }}
          aria-pressed={when === 'now'}
          className={when === 'now' ? 'btn-primary' : 'btn-ghost'}
        >
          الآن
        </button>
        <button
          type="button"
          onClick={() => {
            setWhen('later');
            setReach(null);
            if (!at && tpl.suggest) setAt(nextAt(tpl.suggest));
          }}
          aria-pressed={when === 'later'}
          className={when === 'later' ? 'btn-primary' : 'btn-ghost'}
        >
          في موعد
        </button>
      </div>

      {when === 'later' && (
        <div className="mt-2">
          <label htmlFor="pn-at" className="label">
            موعد الإرسال
          </label>
          <input
            id="pn-at"
            type="datetime-local"
            value={at}
            onChange={(e) => {
              setAt(e.target.value);
              setReach(null);
            }}
            className="field"
            dir="ltr"
          />
          {tpl.suggest && (
            <button
              type="button"
              onClick={() => setAt(nextAt(tpl.suggest as string))}
              className="btn-ghost mt-2 w-full py-2 text-[11.5px]"
            >
              أقرب {tpl.suggest}
            </button>
          )}
        </div>
      )}

      <div className="mt-3">
        <label htmlFor="pn-hours" className="label">
          يبقى في «الأخبار»
        </label>
        <select
          id="pn-hours"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="field"
        >
          {[2, 3, 6, 12, 24].map((h) => (
            <option key={h} value={h}>
              {h} ساعات
            </option>
          ))}
        </select>
      </div>

      {reach === null ? (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={preview}
          className="btn-primary mt-4 w-full disabled:opacity-60"
        >
          {busy && <SpinnerIcon className="h-4 w-4" />}
          مراجعة قبل الجدولة
        </button>
      ) : (
        <div className="mt-4 rounded-xl bg-amber-50 p-3">
          <p className="text-xs font-bold leading-relaxed text-amber-900">
            يصل <b>{reach}</b> جهازاً
            {when === 'now' ? ' الآن' : ` في ${sendAt.toLocaleString('ar-IQ')}`}. وإشعارٌ خرج لا
            يُستردّ — لكنّ ما لم يخرج بعدُ يُلغى من القائمة أدناه.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={schedule} className="btn-primary">
              {busy && <SpinnerIcon className="h-4 w-4" />}
              تأكيد
            </button>
            <button type="button" onClick={() => setReach(null)} className="btn-ghost">
              رجوع
            </button>
          </div>
        </div>
      )}

      {note && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">{note}</p>
      )}
      {err && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-traffic-red">
          {err}
        </p>
      )}
    </section>
  );
}
