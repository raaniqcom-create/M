'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ImageIcon, SpinnerIcon, XIcon } from './icons';

const MAX_SIDE = 1280;
const THUMB_SIDE = 480;

/** صورةُ الملفّ → لوحةٌ مصغّرة (أطولُ ضلعٍ n) → JPEG. الهاتفُ يصوّر بعشرة ميغابايت،
 *  والقائمةُ تعرض مصغّراً بعرض الشاشة — فالمصغّرُ ٤٨٠ للدليل والغلافُ ١٢٨٠ للصفحة. */
async function shrink(file: File, side: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.82)
  );
}

async function put(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage.from('wash').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return `${supabase.storage.from('wash').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

/** غلافُ المغسلة (+ مصغّرُه) ومعرضُها بحدّ الباقة — كلُّها في حاوية `wash` تحت `<wash_id>/`. */
export function WashPhotoUpload({
  washId,
  imageUrl,
  photos,
  galleryLimit,
  onChange,
}: {
  washId: string;
  imageUrl: string | null;
  photos: string[];
  galleryLimit: number;
  onChange: (patch: { image_url?: string; thumb_url?: string; photos?: string[] }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const [cover, thumb] = await Promise.all([shrink(file, MAX_SIDE), shrink(file, THUMB_SIDE)]);
      const image_url = await put(`${washId}/cover.jpg`, cover);
      const thumb_url = await put(`${washId}/thumb.jpg`, thumb);
      const { error: e2 } = await supabase.from('car_washes').update({ image_url, thumb_url }).eq('id', washId);
      if (e2) throw e2;
      onChange({ image_url, thumb_url });
    } catch {
      setError('تعذّر رفع الصورة — جرّب صورةً أخرى.');
    }
    setBusy(false);
  }

  async function pickGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photos.length >= galleryLimit) return setError(`باقتك تسمح بـ${galleryLimit} من الصور.`);
    setBusy(true);
    setError(null);
    try {
      // اسمٌ ثابتٌ لكلّ خانة (g1…gN) فلا ينمو المخزنُ بلا حدّ.
      const used = new Set(photos.map((u) => u.match(/\/(g\d+)\.jpg/)?.[1]));
      let slot = 1;
      while (used.has(`g${slot}`)) slot++;
      const url = await put(`${washId}/g${slot}.jpg`, await shrink(file, MAX_SIDE));
      const next = [...photos, url];
      const { error: e2 } = await supabase.from('car_washes').update({ photos: next }).eq('id', washId);
      if (e2) throw e2;
      onChange({ photos: next });
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      setError(m.includes('باقتك') ? m : 'تعذّر رفع الصورة — جرّب صورةً أخرى.');
    }
    setBusy(false);
  }

  async function removePhoto(url: string) {
    const next = photos.filter((u) => u !== url);
    const { error: e2 } = await supabase.from('car_washes').update({ photos: next }).eq('id', washId);
    if (e2) return setError('تعذّر الحذف.');
    onChange({ photos: next });
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
        {imageUrl ? 'تغيير الغلاف' : 'اختر صورة الغلاف'}
        <input type="file" accept="image/*" onChange={pickCover} disabled={busy} className="hidden" />
      </label>

      <div>
        <p className="label">
          المعرض <span className="font-normal text-slate-400">({photos.length} من {galleryLimit})</span>
        </p>
        {photos.length > 0 && (
          <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
            {photos.map((u) => (
              <div key={u} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-20 w-28 rounded-lg object-cover" />
                <button type="button" onClick={() => removePhoto(u)} aria-label="حذف الصورة" className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-traffic-red shadow">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < galleryLimit && (
          <label className={`btn-ghost mt-2 w-full cursor-pointer ${busy ? 'opacity-60' : ''}`}>
            إضافة صورة إلى المعرض
            <input type="file" accept="image/*" onChange={pickGallery} disabled={busy} className="hidden" />
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
          {error}
        </p>
      )}
    </div>
  );
}
