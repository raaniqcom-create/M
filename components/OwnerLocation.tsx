'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { rebuildSite } from '@/lib/rebuild';
import { LocationField } from './LocationField';
import { SpinnerIcon } from './icons';
import type { Station } from '@/types/database';

/** صاحبُ المحطة يصحّح عنوانَها ودبّوسَها على الخريطة بنفسه.
 *
 *  كان ذلك للإدارة وحدَها (`app/admin/station`)، والمالكُ يُرسل طلباً في
 *  تيليجرام وينتظر. وطلبُ صاحب المنصّة: «أضف في معلومات المحطة إمكانيةَ
 *  تغيير العنوان على الموقع الجغرافيّ». فالعنوانُ والدبّوسُ هنا — أمّا الاسمُ
 *  والرقمُ والمدينةُ فتبقى عند الإدارة: المدينةُ هي مفتاحُ الإشعارات، والاسمُ
 *  ما يبحث به الناس.
 *
 *  والحقلُ هو حقلُ التسجيل نفسُه (`LocationField`)، بسياسة الكتابة القائمة
 *  «stations: owner update own». وصفحةُ المحطة المُسبَقةُ البناء تحمل الدبّوسَ
 *  القديم حتى يُعاد البناء — فيُطلب كما في إخفاء الرقم. */
export function OwnerLocation({
  station,
  onSaved,
}: {
  station: Station;
  onSaved: (patch: Pick<Station, 'address' | 'lat' | 'lng'>) => void;
}) {
  const [address, setAddress] = useState(station.address);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    station.lat != null && station.lng != null ? { lat: station.lat, lng: station.lng } : null
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty =
    address.trim() !== station.address ||
    coords?.lat !== station.lat ||
    coords?.lng !== station.lng;

  async function save() {
    if (!coords) return setNote('حدّد موقع المحطة على الخريطة قبل الحفظ.');
    if (!address.trim()) return setNote('العنوان مطلوب.');
    setBusy(true);
    setNote(null);
    const patch = { address: address.trim(), lat: coords.lat, lng: coords.lng };
    const { error } = await supabase.from('stations').update(patch).eq('id', station.id);
    if (error) {
      setBusy(false);
      return setNote('تعذّر الحفظ: ' + error.message);
    }
    onSaved(patch);
    const why = await rebuildSite();
    setBusy(false);
    setNote(
      why
        ? `حُفظ الموقع ويظهر في التطبيق الآن. صفحتك المنشورة تتأخّر: ${why}`
        : 'حُفظ الموقع. يظهر في التطبيق الآن، وعلى صفحتك المنشورة خلال دقيقتين.'
    );
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">موقع المحطة على الخريطة</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        صحّح العنوان أو حرّك الدبّوس إلى مكان المحطة بالضبط — فالسائق يصل بما تضعه هنا.
      </p>

      <label className="mt-3 block">
        <span className="text-xs font-bold text-slate-600">العنوان</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
        />
      </label>

      <div className="mt-3">
        <LocationField coords={coords} onChange={setCoords} city={station.city} />
      </div>

      <button
        type="button"
        disabled={busy || !dirty}
        onClick={save}
        className="btn-primary mt-4 w-full disabled:opacity-50"
      >
        {busy && <SpinnerIcon className="h-4 w-4" />}
        حفظ الموقع
      </button>
      {note && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
            note.startsWith('تعذّر') || note.startsWith('حدّد') || note.startsWith('العنوان')
              ? 'bg-red-50 font-bold text-red-700'
              : 'bg-brand-50 text-brand-900'
          }`}
        >
          {note}
        </p>
      )}
    </section>
  );
}
