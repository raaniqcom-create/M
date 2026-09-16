'use client';

import { supabase } from './supabase';

/** صورةُ المغسلة: تصغيرٌ في المتصفّح ثمّ رفعٌ إلى حاوية `wash` — يشترك فيه رفعُ
 *  الغلاف والمعرض (WashPhotoUpload)، وتسجيلُ المغسلة، وإعلاناتُ الإدارة (ads/). */
export const MAX_SIDE = 1280;
export const THUMB_SIDE = 480;

/** صورةُ الملفّ → لوحةٌ مصغّرة (أطولُ ضلعٍ n) → JPEG. الهاتفُ يصوّر بعشرة ميغابايت،
 *  والقائمةُ تعرض مصغّراً بعرض الشاشة — فالمصغّرُ ٤٨٠ للدليل والغلافُ ١٢٨٠ للصفحة. */
export async function shrinkImage(file: File, side: number): Promise<Blob> {
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

/** يرفع (أو يستبدل) `path` في حاوية `wash` ويعيد رابطَه العامّ موسوماً بالوقت لكسر الذاكرة. */
export async function putWashImage(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage.from('wash').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return `${supabase.storage.from('wash').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}
