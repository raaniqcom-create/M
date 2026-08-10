'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckIcon, LogOutIcon, MapPinIcon, SpinnerIcon, XIcon } from '@/components/icons';
import { AdminStationForm } from '@/components/AdminStationForm';
import { BroadcastPanel } from '@/components/BroadcastPanel';
import { ReviewsPanel } from '@/components/ReviewsPanel';
import { findSimilar } from '@/lib/similar';
import { rebuildSite } from '@/lib/rebuild';
import { KIND_LABELS, KIND_STYLES, KINDS } from '@/lib/stationMeta';
import type { Station, StationKind } from '@/types/database';

interface Ad {
  id: string;
  image_url: string;
  link_url: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [tab, setTab] = useState<'add' | 'requests' | 'ads' | 'offers' | 'reviews'>('add');
  const [pending, setPending] = useState<Station[]>([]);
  const [approved, setApproved] = useState<Station[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);

  const load = useCallback(async () => {
    const [{ data: st }, { data: ap }, { data: ad }] = await Promise.all([
      supabase.from('stations').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('stations').select('*').in('status', ['approved', 'suspended']).order('city'),
      supabase.from('ads').select('*').order('created_at', { ascending: false }),
    ]);
    setPending(st ?? []);
    setApproved(ap ?? []);
    setAds(ad ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile?.role !== 'admin') {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      // Tie this phone to the admin feed so complaints and new registrations
      // reach it. The token is written by NativePush, which runs before login
      // and therefore cannot know who is holding the device.
      const deviceToken = localStorage.getItem('device-token');
      if (deviceToken) {
        await supabase
          .from('device_tokens')
          .update({ is_admin: true })
          .eq('token', deviceToken);
      }
      setAdminId(data.user.id);
      load();
    })();
  }, [router, load]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    setPending((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('stations').update({ status }).eq('id', id);
    if (status === 'approved') await rebuildSite();
    load();
  }

  // Seeded demo rows all carry this fixed prefix, so cleanup is one click and
  // can never catch a station a real owner registered.
  const DEMO_PREFIX = 'b0000000-0000-0000-0000-';
  const demoStations = approved.filter((s) => s.id.startsWith(DEMO_PREFIX));

  async function removeStation(id: string, name: string) {
    if (!confirm(`حذف «${name}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setApproved((prev) => prev.filter((s) => s.id !== id));
    setPending((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('stations').delete().eq('id', id);
    load();
  }

  async function removeDemoStations() {
    if (!confirm(`حذف ${demoStations.length} محطة تجريبية نهائياً؟`)) return;
    const ids = demoStations.map((s) => s.id);
    setApproved((prev) => prev.filter((s) => !ids.includes(s.id)));
    await supabase.from('stations').delete().in('id', ids);
    load();
  }

  /** The applicant is the real owner of a station we already hold. Move that
   *  station onto their number and drop the duplicate request — the record,
   *  its products and its published link all survive. */
  async function takeover(existingId: string, request: Station) {
    if (!confirm(`نقل «${request.name}» القائمة إلى الرقم ${request.phone}؟`)) return;
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/station-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ stationId: existingId, phone: request.phone }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(out.error ?? 'تعذّر النقل');
      return;
    }
    await supabase.from('stations').delete().eq('id', request.id);
    alert(out.password ? `تم. كلمة المرور: ${out.password}` : 'تم النقل.');
    await load();
  }

  async function setKind(id: string, kind: StationKind) {
    setApproved((prev) => prev.map((s) => (s.id === id ? { ...s, kind } : s)));
    await supabase.from('stations').update({ kind }).eq('id', id);
  }

  async function addAd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const { error } = await supabase.from('ads').insert({
      image_url: String(fd.get('image_url')),
      link_url: String(fd.get('link_url')),
      start_date: String(fd.get('start_date')),
      end_date: String(fd.get('end_date')),
    });
    if (!error) {
      form.reset();
      load();
    }
  }

  async function toggleAd(ad: Ad) {
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: !a.active } : a)));
    await supabase.from('ads').update({ active: !ad.active }).eq('id', ad.id);
  }

  if (allowed === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <SpinnerIcon className="h-6 w-6 text-slate-400" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-base font-bold">هذه الصفحة للإدارة فقط</h1>
        <p className="mt-2 text-sm text-slate-500">لا تملك صلاحية الوصول لهذه اللوحة.</p>
        <a href="/" className="btn-ghost mt-5 px-6">
          العودة للرئيسية
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-brand">لوحة الإدارة</h1>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace('/login');
          }}
          aria-label="تسجيل الخروج"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"
        >
          <LogOutIcon />
        </button>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-brand-50 p-1">
        {([
          ['add', 'إضافة محطة'],
          ['requests', `الطلبات (${pending.length})`],
          ['ads', 'الإعلانات'],
          ['offers', 'العروض'],
          ['reviews', 'التقييمات'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-[42px] rounded-lg text-[13px] font-semibold transition-colors duration-200 ${
              tab === t ? 'bg-white text-brand shadow-soft' : 'text-brand-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'add' && adminId && (
        <div className="mt-4 space-y-4">
          <AdminStationForm adminId={adminId} onDone={load} />

          <section className="card p-5">
            <h2 className="text-sm font-bold">المحطات المعتمدة ({approved.length})</h2>
            <p className="mt-1 text-xs text-slate-400">اضغط على النوع لتبديله بين حكومية وأهلية</p>

            {demoStations.length > 0 && (
              <button
                type="button"
                onClick={removeDemoStations}
                className="btn mt-3 w-full border border-traffic-red bg-white text-traffic-red"
              >
                <XIcon className="h-4 w-4" />
                حذف المحطات التجريبية ({demoStations.length})
              </button>
            )}
            <ul className="mt-3 space-y-3">
              {approved.map((s) => (
                <li key={s.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  {/* the name is the way in: everything per-station lives on
                      its own page rather than swelling this list */}
                  <a href={`/admin/station/?id=${s.id}`} className="block">
                    <p className="text-sm font-bold text-brand-700 underline">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.city} — {s.address}
                    </p>
                  </a>
                  {s.status === 'suspended' && (
                    <p className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-traffic-red">
                      ⛔ موقوفة — لا تظهر للسائقين
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={s.kind === k}
                        onClick={() => setKind(s.id, k)}
                        className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                          s.kind === k ? KIND_STYLES[k] : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {KIND_LABELS[k]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeStation(s.id, s.name)}
                      aria-label={`حذف ${s.name}`}
                      className="mr-auto flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-traffic-red"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                      حذف
                    </button>
                  </div>
                </li>
              ))}
              {approved.length === 0 && (
                <li className="text-sm text-slate-400">لا توجد محطات معتمدة بعد</li>
              )}
            </ul>
          </section>
        </div>
      )}

      {tab === 'requests' && (
        <div className="mt-4 space-y-3">
          {pending.length === 0 && (
            <p className="card p-6 text-center text-sm text-slate-400">لا توجد طلبات معلّقة</p>
          )}
          {pending.map((s) => (
            <article key={s.id} className="card p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{s.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[s.kind]}`}>
                  {KIND_LABELS[s.kind]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {s.city} — {s.address}
              </p>
              <p className="mt-1 text-sm text-slate-500" dir="ltr">
                {s.phone}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand"
              >
                <MapPinIcon className="h-4 w-4" />
                عرض الموقع على الخريطة
              </a>
              {/* Advisory only. Two stations in one city really can share a
                  word in their name, so the match is surfaced for a human who
                  has spoken to the applicant — never acted on automatically. */}
              {findSimilar(s, approved).map((m) => (
                <div key={m.id} className="mt-2 rounded-xl bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-900">
                    يشبه محطة قائمة: {m.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {m.city} — {m.address} · <span dir="ltr">{m.phone}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => takeover(m.id, s)}
                    className="btn-ghost mt-2 w-full text-xs"
                  >
                    نقل «{m.name}» إلى هذا الشخص وحذف الطلب
                  </button>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                    تبقى المحطة ومنتجاتها ورابطها المنشور كما هي، ويتغيّر مالكها ورقمها فقط.
                  </p>
                </div>
              ))}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => decide(s.id, 'approved')}
                  className="btn bg-brand text-white"
                >
                  <CheckIcon className="h-4 w-4" />
                  اعتماد كمحطة جديدة
                </button>
                <button
                  type="button"
                  onClick={() => decide(s.id, 'rejected')}
                  className="btn border border-traffic-red bg-white text-traffic-red"
                >
                  <XIcon className="h-4 w-4" />
                  رفض
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'offers' && <BroadcastPanel />}
      {tab === 'reviews' && <ReviewsPanel />}

      {tab === 'ads' && (
        <div className="mt-4 space-y-4">
          <form onSubmit={addAd} className="card space-y-3 p-5">
            <h2 className="text-sm font-bold">إضافة إعلان</h2>
            <div>
              <label htmlFor="image_url" className="label">
                رابط صورة الإعلان
              </label>
              <input
                id="image_url"
                name="image_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div>
              <label htmlFor="link_url" className="label">
                رابط الوجهة
              </label>
              <input
                id="link_url"
                name="link_url"
                type="url"
                required
                className="field"
                dir="ltr"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start_date" className="label">
                  من تاريخ
                </label>
                <input id="start_date" name="start_date" type="date" required className="field" />
              </div>
              <div>
                <label htmlFor="end_date" className="label">
                  إلى تاريخ
                </label>
                <input id="end_date" name="end_date" type="date" required className="field" />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              إضافة
            </button>
          </form>

          <div className="space-y-3">
            {ads.map((ad) => (
              <article key={ad.id} className="card overflow-hidden">
                {/* admin-supplied URL, no optimization pipeline — plain img is right here */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.image_url} alt="" className="h-24 w-full object-cover" />
                <div className="flex items-center justify-between p-3">
                  <span className="text-xs text-slate-500" dir="ltr">
                    {ad.start_date} → {ad.end_date}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAd(ad)}
                    aria-pressed={ad.active}
                    className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold ${
                      ad.active ? 'bg-brand-100 text-brand' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {ad.active ? 'مفعّل' : 'موقوف'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
