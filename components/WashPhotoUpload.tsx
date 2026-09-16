'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MAX_SIDE, THUMB_SIDE, putWashImage as put, shrinkImage as shrink } from '@/lib/washUpload';
import { ChevronLeftIcon, ImageIcon, SpinnerIcon, XIcon } from './icons';

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

  /** الغلافُ ومصغّرُه من ملفٍّ واحد — من الجهاز أو من صورةِ معرضٍ موجودة. */
  async function setCover(file: File) {
    const [cover, thumb] = await Promise.all([shrink(file, MAX_SIDE), shrink(file, THUMB_SIDE)]);
    const image_url = await put(`${washId}/cover.jpg`, cover);
    const thumb_url = await put(`${washId}/thumb.jpg`, thumb);
    const { error: e2 } = await supabase.from('car_washes').update({ image_url, thumb_url }).eq('id', washId);
    if (e2) throw e2;
    onChange({ image_url, thumb_url });
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await setCover(file);
    } catch {
      setError('تعذّر رفع الصورة — جرّب صورةً أخرى.');
    }
    setBusy(false);
  }

  /** صورةُ معرضٍ تصير غلافاً: تُجلب من رابطها وتُصغَّر كأنّها ملفٌّ جديد؛ وتبقى في المعرض. */
  async function makeCover(url: string) {
    setBusy(true);
    setError(null);
    try {
      const blob = await (await fetch(url)).blob();
      await setCover(new File([blob], 'x.jpg', { type: 'image/jpeg' }));
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
      await savePhotos([...photos, url]);
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      setError(m.includes('باقتك') ? m : 'تعذّر رفع الصورة — جرّب صورةً أخرى.');
    }
    setBusy(false);
  }

  async function savePhotos(next: string[]) {
    const { error: e2 } = await supabase.from('car_washes').update({ photos: next }).eq('id', washId);
    if (e2) throw e2;
    onChange({ photos: next });
  }

  /** busy يُسلسل الحفظَ: ضغطتان متتاليتان تحسبان من photos القديمة فتُطيح الأخيرةُ بالأولى. */
  async function removePhoto(url: string) {
    if (busy) return;
    setBusy(true);
    try {
      await savePhotos(photos.filter((u) => u !== url));
    } catch {
      setError('تعذّر الحذف.');
    }
    setBusy(false);
  }

  /** تبديلُ الصورة مع جارتها — الترتيبُ هو ترتيبُ المعرض في الصفحة. */
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= photos.length || busy) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(true);
    try {
      await savePhotos(next);
    } catch {
      setError('تعذّر الحفظ.');
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-40 w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
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
          <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto pb-1">
            {photos.map((u, i) => (
              <div key={u} className="w-28 shrink-0">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-20 w-28 rounded-lg object-cover" />
                  <button type="button" onClick={() => removePhoto(u)} disabled={busy} aria-label="حذف الصورة" className="absolute -start-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-traffic-red shadow">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* الأسهمُ بحسب اتّجاه الصفّ: الأوّلُ في اليمين، فالتقديمُ يمينٌ والتأخيرُ يسار. */}
                <div className="mt-1 flex justify-between">
                  <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="تقديم" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30">
                    <ChevronLeftIcon className="h-4 w-4 rotate-180" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={busy || i === photos.length - 1} aria-label="تأخير" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30">
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                </div>
                <button type="button" onClick={() => makeCover(u)} disabled={busy} className="mt-1 min-h-[36px] w-full text-[11px] font-bold text-brand-700 underline disabled:opacity-50">
                  اجعلها الغلاف
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
