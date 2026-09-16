'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CITY_NAMES } from '@/lib/cities';
import { num } from '@/lib/num';
import { dateLine, type CarWash, type WashAd, type WashOffer } from '@/lib/wash';
import { putWashImage, shrinkImage } from '@/lib/washUpload';
import { ImageIcon, SpinnerIcon } from './icons';

const KIND_LABELS: Record<WashAd['kind'], string> = { banner: 'بانر', station: 'محطة مموَّلة', offer: 'عرض مموَّل' };
const KINDS = Object.keys(KIND_LABELS) as WashAd['kind'][];

type Form = {
  kind: WashAd['kind'];
  title: string;
  description: string;
  image_url: string | null;
  url: string;
  wash_id: string;
  offer_id: string;
  city: string;
  starts_at: string;
  ends_at: string;
  priority: string;
  sponsored: boolean;
  active: boolean;
};
const EMPTY: Form = { kind: 'banner', title: '', description: '', image_url: null, url: '', wash_id: '', offer_id: '', city: '', starts_at: '', ends_at: '', priority: '0', sponsored: true, active: true };

const fromRow = (a: WashAd): Form => ({
  kind: a.kind,
  title: a.title,
  description: a.description ?? '',
  image_url: a.image_url,
  url: a.url ?? '',
  wash_id: a.wash_id ?? '',
  offer_id: a.offer_id ?? '',
  city: a.city ?? '',
  starts_at: a.starts_at ?? '',
  ends_at: a.ends_at ?? '',
  priority: String(a.priority ?? 0),
  sponsored: !!a.sponsored,
  active: a.active !== false,
});

/** «من 19 أيلول حتى 30 أيلول» — نافذةُ الإعلان، أو «دائم» بلا حدود. */
function adWindow(a: Pick<WashAd, 'starts_at' | 'ends_at'>): string {
  const short = (d: string) => dateLine(d, { day: 'numeric', month: 'short' });
  if (a.starts_at && a.ends_at) return `${short(a.starts_at)} – ${short(a.ends_at)}`;
  if (a.starts_at) return `من ${short(a.starts_at)}`;
  if (a.ends_at) return `حتى ${short(a.ends_at)}`;
  return 'دائم';
}

/** إعلاناتُ الإدارة (wash_ads): بانرُ الرئيسية، والمحطةُ المموَّلة، والعرضُ المموَّل — إنشاءٌ وتعديلٌ وإيقاف. */
export function WashAdsAdmin({ washes }: { washes: CarWash[] }) {
  const [rows, setRows] = useState<WashAd[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [offers, setOffers] = useState<WashOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('wash_ads').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false }).range(0, 199);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data as WashAd[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** عروضُ المغسلة المختارة — لربط «عرضٍ مموَّل» بعرضٍ بعينه. */
  const washId = form?.wash_id ?? '';
  useEffect(() => {
    let alive = true;
    if (!washId) {
      setOffers([]);
      return;
    }
    supabase
      .from('wash_offers')
      .select('id, wash_id, title, ends_at, active')
      .eq('wash_id', washId)
      .order('ends_at', { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => alive && setOffers((data as WashOffer[] | null) ?? []));
    return () => {
      alive = false;
    };
  }, [washId]);

  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setErr(null);
  }
  function openEdit(a: WashAd) {
    setEditing(a.id);
    setForm(fromRow(a));
    setErr(null);
  }
  function close() {
    setEditing(null);
    setForm(null);
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const url = await putWashImage(`ads/${crypto.randomUUID()}.jpg`, await shrinkImage(file, 1280));
      set({ image_url: url });
    } catch {
      setErr('تعذّر رفع الصورة — جرّب صورةً أخرى.');
    }
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 80) return setErr('اكتب العنوان — حتى 80 حرفاً.');
    const url = form.url.trim();
    // ‎// وحدَها رابطٌ خارجيّ متنكّر في مسارٍ داخليّ.
    if (url && !/^(https?:\/\/|\/(?!\/))/i.test(url)) return setErr('الرابط يبدأ بـhttps:// أو بـ/.');
    if (form.kind === 'station' && !form.wash_id) return setErr('اختر المحطة المموَّلة.');
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) return setErr('النهاية قبل البداية.');
    const priority = Math.min(100, Math.max(0, Math.round(Number(form.priority) || 0)));
    const row = {
      kind: form.kind,
      title,
      description: form.description.trim().slice(0, 160) || null,
      image_url: form.image_url,
      url: url || null,
      wash_id: form.wash_id || null,
      offer_id: form.wash_id && form.offer_id ? form.offer_id : null,
      city: form.city || null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      priority,
      sponsored: form.sponsored,
      active: form.active,
    };
    setBusy(true);
    setErr(null);
    const { error } = editing ? await supabase.from('wash_ads').update(row).eq('id', editing) : await supabase.from('wash_ads').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    close();
    void load();
  }

  async function toggle(a: WashAd) {
    const { error } = await supabase.from('wash_ads').update({ active: !a.active }).eq('id', a.id);
    if (error) return setErr(error.message);
    void load();
  }

  async function remove(a: WashAd) {
    if (!confirm(`حذف «${a.title}»؟`)) return;
    const { error } = await supabase.from('wash_ads').delete().eq('id', a.id);
    if (error) return setErr(error.message);
    if (editing === a.id) close();
    void load();
  }

  const washName = (id: string | null) => washes.find((w) => w.id === id)?.name;

  return (
    <div className="space-y-3">
      {err && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-traffic-red">
          {err}
        </p>
      )}

      {!rows ? (
        <SpinnerIcon className="mx-auto h-5 w-5 text-brand" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">لا إعلاناتَ بعد.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${a.active ? 'border-slate-200' : 'border-slate-100 text-slate-400'}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!a.active} onChange={() => toggle(a)} className="h-4 w-4 shrink-0 accent-[#16a34a]" aria-label="نشط" />
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    <span className="me-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{KIND_LABELS[a.kind]}</span>
                    {a.title}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {a.city ?? 'كل المدن'} · {adWindow(a)} · أولوية {num(a.priority)}
                    {a.wash_id ? ` · ${washName(a.wash_id) ?? 'مغسلة'}` : ''}
                    {a.sponsored ? ' · إعلان' : ''}
                  </span>
                </span>
              </label>
              <button type="button" onClick={() => openEdit(a)} className="font-bold text-brand-700 underline">
                تعديل
              </button>
              <button type="button" onClick={() => remove(a)} className="font-bold text-traffic-red underline">
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}

      {!form ? (
        <button type="button" onClick={openNew} className="btn-ghost w-full text-xs">
          إعلان جديد
        </button>
      ) : (
        <form onSubmit={save} className="space-y-3 rounded-xl bg-brand-50/60 p-3">
          <p className="text-xs font-extrabold text-brand-800">{editing ? 'تعديل الإعلان' : 'إعلان جديد'}</p>
          <div>
            <label htmlFor="ad-kind" className="label text-[11px]">النوع</label>
            <select id="ad-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as WashAd['kind'] })} className="field py-2 text-sm">
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ad-title" className="label text-[11px]">العنوان *</label>
            <input id="ad-title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} className="field py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="ad-desc" className="label text-[11px]">الوصف</label>
            <textarea id="ad-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={160} rows={2} className="field py-2 text-sm" />
          </div>
          <div>
            <p className="label text-[11px]">الصورة</p>
            {form.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image_url} alt="" className="mb-2 h-28 w-full rounded-xl object-cover" />
            )}
            <div className="flex gap-2">
              <label className={`btn-ghost min-h-[40px] flex-1 cursor-pointer text-xs ${uploading ? 'opacity-60' : ''}`}>
                {uploading ? <SpinnerIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                {form.image_url ? 'تغيير الصورة' : 'اختر صورة'}
                <input type="file" accept="image/*" onChange={pickImage} disabled={uploading} className="hidden" />
              </label>
              {form.image_url && (
                <button type="button" onClick={() => set({ image_url: null })} className="btn-ghost min-h-[40px] px-3 text-xs text-traffic-red">
                  إزالة
                </button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="ad-url" className="label text-[11px]">الرابط</label>
            <input id="ad-url" type="text" value={form.url} onChange={(e) => set({ url: e.target.value })} className="field py-2 text-sm" placeholder="https://… أو /wash/detail/?id=…" dir="ltr" />
          </div>
          <div>
            <label htmlFor="ad-wash" className="label text-[11px]">المحطة{form.kind === 'station' ? ' *' : ''}</label>
            <select id="ad-wash" value={form.wash_id} onChange={(e) => set({ wash_id: e.target.value, offer_id: '' })} className="field py-2 text-sm">
              <option value="">—</option>
              {washes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.city}
                </option>
              ))}
            </select>
          </div>
          {form.wash_id && (
            <div>
              <label htmlFor="ad-offer" className="label text-[11px]">العرض</label>
              <select id="ad-offer" value={form.offer_id} onChange={(e) => set({ offer_id: e.target.value })} className="field py-2 text-sm">
                <option value="">—</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}{o.active ? '' : ' (متوقّف)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="ad-city" className="label text-[11px]">المدينة</label>
            <select id="ad-city" value={form.city} onChange={(e) => set({ city: e.target.value })} className="field py-2 text-sm">
              <option value="">كل المدن</option>
              {CITY_NAMES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-600">
              تاريخ البداية
              <input type="date" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
            </label>
            <label className="text-[11px] text-slate-600">
              تاريخ النهاية
              <input type="date" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} className="field mt-0.5 py-1.5 text-sm" dir="ltr" />
            </label>
          </div>
          <div>
            <label htmlFor="ad-priority" className="label text-[11px]">الأولوية (0–100)</label>
            <input id="ad-priority" type="number" inputMode="numeric" min={0} max={100} value={form.priority} onChange={(e) => set({ priority: e.target.value })} className="field py-2 text-sm" dir="ltr" />
          </div>
          <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sponsored} onChange={(e) => set({ sponsored: e.target.checked })} className="h-4 w-4 accent-[#16a34a]" />
            مموَّل (يظهر وسم إعلان)
          </label>
          <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 accent-[#16a34a]" />
            نشط
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="btn-ghost flex-1 text-xs">
              إلغاء
            </button>
            <button type="submit" disabled={busy || uploading} className="btn-primary flex-[2] text-xs">
              {busy && <SpinnerIcon className="h-4 w-4" />}
              {editing ? 'حفظ' : 'إضافة'}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            البانر يظهر في رئيسية المغاسل، والمحطة المموَّلة تتصدّر القائمة بوسم «إعلان»، والعرض المموَّل يظهر في «عروض اليوم».
          </p>
        </form>
      )}
    </div>
  );
}
