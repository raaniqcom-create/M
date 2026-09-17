'use client';

import { useEffect, useState } from 'react';
import { callFn } from '@/lib/fn';
import { plural } from '@/lib/freshness';
import { supabase } from '@/lib/supabase';
import {
  ALL_CITIES_WORD,
  CITY_TOKEN,
  DEFAULT_NOTICE,
  NOTICE_KIND,
  pushBody,
  renderNotice,
} from '@/lib/scheduleNotice';
import { NoticeCard } from './ScheduleNotice';
import { SpinnerIcon } from './icons';

/** اعتذارُ الجدول — تُكتب الجملةُ مرّةً ويقرأ كلُّ إنسانٍ فيها اسمَ مدينته.
 *
 *  «نعتذر إلى متابعين المحطة التقنية في حديثة، لم يصلنا إلى الآن جدولُ
 *  التوزيع لمحطات غدا» — صاحبُ المنصّة. والعلامةُ `{المدينة}` هي موضعُ الاسم.
 *
 *  ── ولماذا الإشعارُ مفتاحٌ لا سلوكٌ ثابت ────────────────────────────────
 *
 *  اعتذارُ الثامنةِ مساءً خبرٌ ينتظره الناس، واعتذارُ منتصفِ الليل إزعاجٌ لا
 *  خبر. فالقرارُ للإنسان لا للشيفرة، ويُتّخذ عند كلّ إرسال. */

const TITLE = 'جدولُ الغد لم يصل بعد';
const HOURS = [6, 12, 24];
const SAMPLE = 'حديثة';

export function ScheduleNoticeAdmin() {
  const [title, setTitle] = useState(TITLE);
  const [body, setBody] = useState(DEFAULT_NOTICE);
  const [hours, setHours] = useState(12);
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState<'send' | 'pull' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState<number | null>(null);

  async function countLive() {
    const { count } = await supabase
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .eq('kind', NOTICE_KIND)
      .eq('active', true)
      .gt('expires_at', new Date().toISOString());
    setLive(count ?? 0);
  }

  useEffect(() => {
    void countLive();
  }, []);

  async function send() {
    if (!body.trim()) return;
    setBusy('send');
    setNote(null);
    const now = new Date();
    const expires = new Date(now.getTime() + hours * 3600_000);

    // الإشعارُ أوّلاً: صفٌّ محفوظٌ بلا إشعارٍ أهونُ من إشعارٍ بلا صفّ — الأوّلُ
    // يُعاد إرسالُه، والثاني خبرٌ في الجيوب لا أثرَ له على الشاشة.
    if (push) {
      // نداءٌ واحدٌ بلا `cities`: `announce` تبثّ لكلّ جهاز، فلا يتكرّر الإشعارُ
      // على مشتركِ «كلّ المدن» كما يقع لو نُودي لكلّ مدينةٍ على حدة.
      const r = await callFn('announce', {
        title: title.trim().slice(0, 64),
        body: pushBody(body.trim(), null).slice(0, 178),
        url: '/schedule',
      });
      if (!r.ok) {
        setBusy(null);
        setNote(r.error ?? 'تعذّر إرسال الإشعار — ولم يُحفظ الاعتذار.');
        return;
      }
    }

    const { error } = await supabase.from('announcements').insert({
      title: title.trim().slice(0, 64),
      body: body.trim(),
      source: 'إدارة المحطة التقنية',
      // كلُّ المحافظة — والاسمُ يتبدّل على الجهاز، لا في القاعدة.
      cities: null,
      product: null,
      // لا station_name: اللوحةُ الحمراء تقرؤه خبرَ توفّر (open_announcements).
      station_name: null,
      kind: NOTICE_KIND,
      send_at: now.toISOString(),
      // مختومٌ «أُرسل» كي تقرأه الصفحةُ ولا تعيده المِكنسة.
      sent_at: now.toISOString(),
      expires_at: expires.toISOString(),
      active: true,
    });

    setBusy(null);
    setNote(
      error
        ? `تعذّر الحفظ: ${error.message}`
        : push
          ? 'نُشر الاعتذار وخرج الإشعار.'
          : 'نُشر الاعتذار على صفحة الجدول — بلا إشعار.'
    );
    if (!error) void countLive();
  }

  async function pull() {
    setBusy('pull');
    setNote(null);
    const { error } = await supabase
      .from('announcements')
      .update({ active: false })
      .eq('kind', NOTICE_KIND)
      .eq('active', true);
    setBusy(null);
    setNote(error ? `تعذّر السحب: ${error.message}` : 'سُحب الاعتذار من الصفحة.');
    if (!error) void countLive();
  }

  const preview = renderNotice(body, null, [SAMPLE]);

  return (
    <section className="card p-5">
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-lg bg-amber-500 px-2.5 py-1 text-[12.5px] font-extrabold text-white">
          اعتذار الجدول
        </span>
        {live !== null && live > 0 && (
          <span className="text-[11px] font-bold text-amber-700">معروضٌ الآن على الصفحة</span>
        )}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        يظهر أعلى صفحة الجدول لكلّ المحافظة، و
        <b className="text-slate-600">{CITY_TOKEN}</b> يصير اسمَ مدينة القارئ نفسِه. ومن لم يختر
        مدينةً يقرأ «{ALL_CITIES_WORD}».
      </p>

      <label className="label mt-4 block" htmlFor="sn-title">
        العنوان — للإشعار وحدَه
      </label>
      <input
        id="sn-title"
        className="field w-full"
        value={title}
        maxLength={64}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="label mt-3 block" htmlFor="sn-body">
        النصّ
      </label>
      <textarea
        id="sn-body"
        className="field w-full"
        rows={4}
        maxLength={178}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setBody(DEFAULT_NOTICE)}
          className="text-[11px] font-bold text-brand-700 underline"
        >
          أعِد النصّ الأصلي
        </button>
        {/* `dir="ltr"` كي يُقرأ «124 / 178» لا «178 / 124»: السطرُ لاتينيٌّ
            كلُّه داخل فقرةٍ عربيّة، فترتيبُه ينقلب بلا عزل. */}
        <span dir="ltr" className="text-[11px] font-bold text-slate-400">
          {body.length} / 178
        </span>
      </div>

      {/* البطاقةُ نفسُها التي تُعرض على صفحة الجدول — لا نسخةٌ تشبهها. */}
      <div className="mt-3">
        <NoticeCard text={preview} />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        هكذا يقرؤها من اختار «{SAMPLE}».
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="label">يبقى</span>
        {HOURS.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={hours === h}
            onClick={() => setHours(h)}
            className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors duration-200 ${
              hours === h ? 'bg-brand text-white' : 'bg-white text-brand-800 ring-1 ring-slate-200'
            }`}
          >
            {plural(h, 'ساعة', 'ساعتان', 'ساعات', 'ساعة')}
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-2 text-[12px] font-bold leading-relaxed text-slate-700">
        <input
          type="checkbox"
          checked={push}
          onChange={(e) => setPush(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          أرسل إشعاراً أيضاً إلى كلّ الأجهزة
          <span className="block text-[11px] font-semibold text-slate-400">
            بلا علامة: يُعرض على الصفحة وحدَها ولا يُزعج أحداً. والإشعارُ يقول «
            {ALL_CITIES_WORD}» لا اسمَ مدينةٍ بعينها — نداءٌ واحدٌ كي لا يتكرّر على من
            يتابع المحافظةَ كلَّها.
          </span>
        </span>
      </label>

      {note && (
        <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs font-bold leading-relaxed text-slate-700">
          {note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy !== null || !body.trim()}
          className="btn-primary inline-flex items-center gap-2"
        >
          {busy === 'send' && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          {push ? 'انشر وأشعِر' : 'انشر على الصفحة'}
        </button>
        <button
          type="button"
          onClick={pull}
          disabled={busy !== null || live === 0}
          className="btn-ghost inline-flex items-center gap-2"
        >
          {busy === 'pull' && <SpinnerIcon className="h-4 w-4 animate-spin" />}
          اسحب الاعتذار
        </button>
      </div>
    </section>
  );
}
