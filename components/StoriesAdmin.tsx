'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ageLabel } from '@/lib/hours';
import { platformStory, type PlatformStoryRow } from '@/lib/stories';
import { StoryViewer } from './StoryViewer';
import { SpinnerIcon } from './icons';

type Row = PlatformStoryRow & { active: boolean };

/** «الحالات» — حالةُ المنصّة بخلفيةٍ خضراء وكتابةٍ بيضاء، تُنشر من هنا بلا بناء.
 *
 *  «إضافةُ حالةٍ بخلفية خضراء وكتابة بيضاء، وإضافةُ صورةٍ عبر رابطٍ أو شعار
 *  المحطة، وتكون قابلةً للنشر» — صاحبُ المنصّة. المعاينةُ هي العارضُ الحقيقيّ
 *  نفسُه فلا يرى المديرُ شيئاً غيرَ ما يراه المواطن. و«أعد النشر» يجدّد
 *  published_at فتعود الحلقةُ خضراء لمن رآها ويبدأ عدّادُها من جديد. */
export function StoriesAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [useLogo, setUseLogo] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [href, setHref] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('platform_stories')
      .select('id, title, lines, image_url, href, label, published_at, active')
      .order('published_at', { ascending: false });
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const draft: PlatformStoryRow = {
    id: 'preview',
    title: title.trim(),
    lines,
    image_url: useLogo ? null : imageUrl.trim() || null,
    href: href.trim() || null,
    label: label.trim() || null,
    published_at: new Date().toISOString(),
  };
  const valid = !!draft.title && lines.length > 0;

  async function publish() {
    if (!valid) return;
    setBusy(true);
    setNote(null);
    const { error } = await supabase.from('platform_stories').insert({
      title: draft.title,
      lines,
      image_url: draft.image_url,
      href: draft.href,
      label: draft.label,
    });
    setBusy(false);
    if (error) return setNote('تعذّر الحفظ. أعد المحاولة.');
    setTitle('');
    setText('');
    setImageUrl('');
    setHref('');
    setLabel('');
    setNote('نُشرت — تظهر أوّلَ شريط الحالات لكلّ الزوّار.');
    void load();
  }

  async function stop(r: Row) {
    await supabase.from('platform_stories').update({ active: false }).eq('id', r.id);
    void load();
  }

  async function republish(r: Row) {
    await supabase
      .from('platform_stories')
      .update({ active: true, published_at: new Date().toISOString() })
      .eq('id', r.id);
    void load();
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold">إضافة حالة</h2>
        <p className="text-[11px] leading-relaxed text-slate-400">
          الخلفيةُ خضراء والكتابةُ بيضاء — كما تظهر للمواطن. «معاينة» تفتحها بالعارض نفسِه قبل النشر.
        </p>

        <div>
          <label htmlFor="st-title" className="label">العنوان</label>
          <input
            id="st-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="field"
            placeholder="مثال: العبوات البلاستيكية أصبحت متوفرة"
          />
        </div>

        <div>
          <label htmlFor="st-lines" className="label">الأسطر — سطرٌ في كلّ سطر</label>
          <textarea
            id="st-lines"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="field py-2"
            placeholder={'ماذا صار؟\nأين؟\nماذا يفعل المستخدم؟'}
          />
        </div>

        <div>
          <p className="label">الصورة</p>
          <div className="flex gap-2">
            {[
              { v: true, t: 'شعار المحطة' },
              { v: false, t: 'رابط صورة' },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setUseLogo(o.v)}
                aria-pressed={useLogo === o.v}
                className={`rounded-full border px-3 py-1.5 text-[11.5px] font-bold ${
                  useLogo === o.v ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600'
                }`}
              >
                {o.t}
              </button>
            ))}
          </div>
          {!useLogo && (
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              type="url"
              dir="ltr"
              className="field mt-2"
              placeholder="https://…"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="st-href" className="label">رابط الزرّ (اختياري)</label>
            <input
              id="st-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              dir="ltr"
              className="field"
              placeholder="/abwat أو https://…"
            />
          </div>
          <div>
            <label htmlFor="st-label" className="label">نصّ الزرّ</label>
            <input
              id="st-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              className="field"
              placeholder="مثال: اعرف التفاصيل"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPreview(true)} disabled={!valid} className="btn-ghost disabled:opacity-40">
            معاينة
          </button>
          <button type="button" onClick={publish} disabled={!valid || busy} className="btn-primary disabled:opacity-40">
            {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'انشر'}
          </button>
        </div>
        {note && (
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11.5px] font-semibold text-brand-700">{note}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[12px] font-extrabold text-slate-500">الحالات المنشورة</h2>
        {rows === null ? (
          <div className="flex justify-center py-6">
            <SpinnerIcon className="h-6 w-6 text-brand" />
          </div>
        ) : rows.length === 0 ? (
          <p className="card p-4 text-center text-xs text-slate-400">لا حالات بعد — الأولى تُنشر من النموذج أعلاه.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <article key={r.id} className="card flex items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.image_url || '/icons/icon-192.png'}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-800">{r.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span
                      className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                        r.active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {r.active ? 'منشورة' : 'موقوفة'}
                    </span>
                    نُشرت {ageLabel(r.published_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (r.active ? stop(r) : republish(r))}
                  className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                >
                  {r.active ? 'أوقف' : 'أعد النشر'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {preview && valid && (
        <StoryViewer stories={[platformStory(draft)]} start={0} stations={[]} onClose={() => setPreview(false)} />
      )}
    </div>
  );
}
