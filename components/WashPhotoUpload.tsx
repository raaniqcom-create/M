'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ImageIcon, SpinnerIcon } from './icons';

const MAX_SIDE = 1280;

/** صورةُ الملفّ → لوحةٌ مصغّرة (أطولُ ضلعٍ ١٢٨٠) → JPEG. الهاتفُ يصوّر بعشرة
 *  ميغابايت، والقائمةُ تعرض بطاقةً بعرض الشاشة. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.82)
  );
}

/** صورةُ غلاف المغسلة: رفعٌ إلى حاوية `wash` تحت `<wash_id>/cover.jpg`، أو رابطٌ يُلصق. */
export function WashPhotoUpload({
  washId,
  imageUrl,
  onChange,
}: {
  washId: string;
  imageUrl: string | null;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');

  async function save(url: string) {
    const { error: e } = await supabase.from('car_washes').update({ image_url: url }).eq('id', washId);
    if (e) throw e;
    onChange(url);
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await shrink(file);
      const path = `${washId}/cover.jpg`;
      const { error: up } = await supabase.storage
        .from('wash')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (up) throw up;
      const { data } = supabase.storage.from('wash').getPublicUrl(path);
      await save(`${data.publicUrl}?v=${Date.now()}`);
    } catch {
      setError('تعذّر رفع الصورة — جرّب صورةً أخرى أو الصق رابطاً.');
    }
    setBusy(false);
  }

  async function saveLink() {
    const url = link.trim();
    if (!/^https?:\/\//.test(url)) return setError('الرابط يجب أن يبدأ بـ http');
    setBusy(true);
    setError(null);
    try {
      await save(url);
      setLink('');
    } catch {
      setError('تعذّر الحفظ. حاول مجدداً.');
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-40 w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
          <ImageIcon className="h-10 w-10" />
        </div>
      )}

      <label className={`btn-primary w-full cursor-pointer ${busy ? 'opacity-60' : ''}`}>
        {busy ? <SpinnerIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
        {imageUrl ? 'تغيير الصورة' : 'اختر صورة'}
        <input type="file" accept="image/*" onChange={pick} disabled={busy} className="hidden" />
      </label>

      <div>
        <label htmlFor="wash-image-link" className="label">
          أو رابط صورة
        </label>
        <div className="flex gap-2">
          <input
            id="wash-image-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="field"
            placeholder="https://…"
            dir="ltr"
          />
          <button type="button" onClick={saveLink} disabled={busy || !link.trim()} className="btn-ghost shrink-0">
            حفظ
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}
    </div>
  );
}
