'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckIcon, ShareIcon, SpinnerIcon } from './icons';

// Reserved because Next resolves these static routes before the /[slug]
// catch-all — a station claiming one would get an unreachable link.
const RESERVED = new Set([
  'login',
  'register',
  'owner',
  'admin',
  'station',
  'offline',
  'api',
  'icons',
  'ads',
  'manifest.json',
  'sw.js',
]);

function clean(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

// Owners asked for a link they can pin on their own Facebook/Telegram page, so
// customers check status themselves instead of phoning the station.
export function StationLinkCard({
  stationId,
  name,
  slug,
  onSlugChange,
}: {
  stationId: string;
  name: string;
  slug: string;
  onSlugChange: (next: string) => void;
}) {
  const [origin, setOrigin] = useState('');
  const [draft, setDraft] = useState(slug);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setDraft(slug), [slug]);

  const url = `${origin}/${slug}`;

  async function saveSlug() {
    const next = clean(draft);
    if (next === slug) return;

    if (next.length < 3) {
      setError('الرابط يجب أن يكون ٣ أحرف إنجليزية أو أكثر.');
      return;
    }
    if (RESERVED.has(next)) {
      setError('هذا الرابط محجوز للنظام. اختر اسماً آخر.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('stations').update({ slug: next }).eq('id', stationId);
    setSaving(false);

    if (err) {
      setError(
        err.code === '23505'
          ? 'هذا الرابط مستخدم من محطة أخرى. جرّب اسماً مختلفاً.'
          : 'تعذّر حفظ الرابط. حاول مجدداً.'
      );
      return;
    }
    onSlugChange(next);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function share() {
    const text = `تابع حالة الوقود في ${name} مباشرة`;
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch {
        return; // user cancelled
      }
    }
    copy();
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">رابط محطتك الخاص</h3>
      <p className="mt-1 text-xs text-slate-500">
        انشره على صفحتك ليتابع الزبائن حالة الوقود والازدحام بأنفسهم.
      </p>

      <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2" dir="ltr">
        <span className="shrink-0 text-xs text-slate-400">{origin}/</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveSlug}
          aria-label="اسم الرابط"
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-base font-bold text-brand-900 focus:outline-none"
          placeholder="alnakheal1"
          maxLength={30}
        />
        {saving && <SpinnerIcon className="h-4 w-4 shrink-0 text-slate-400" />}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        أحرف إنجليزية وأرقام فقط. اكتب الاسم ثم اضغط خارج الحقل للحفظ.
      </p>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-traffic-red">
          {error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className="btn-ghost">
          {copied && <CheckIcon className="h-4 w-4 text-brand" />}
          {copied ? 'تم النسخ' : 'نسخ الرابط'}
        </button>
        <button type="button" onClick={share} className="btn-primary">
          <ShareIcon className="h-4 w-4" />
          مشاركة
        </button>
      </div>
    </section>
  );
}
