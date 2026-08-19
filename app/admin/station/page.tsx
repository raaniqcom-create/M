'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABELS, PRODUCT_ORDER } from '@/lib/products';
import { StationLinkCard } from '@/components/StationLinkCard';
import { StationPoster } from '@/components/StationPoster';
import { AvailabilityPoster } from '@/components/AvailabilityPoster';
import { SpinnerIcon } from '@/components/icons';
import { announceStation, rebuildSite } from '@/lib/rebuild';
import type { FuelProduct, Station, StationProduct, StationStatus } from '@/types/database';

type Complaint = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: '⏳ بانتظار الموافقة',
  approved: '✅ معتمدة وظاهرة',
  rejected: '❌ مرفوضة',
  suspended: '⛔ موقوفة',
};

// A single static route reading ?id=, not /admin/station/[id]. The site is a
// static export, so a dynamic segment would need every station prerendered —
// and a station registered after the last build would 404 for the admin.
export default function AdminStationPage() {
  return (
    <Suspense fallback={<Center><SpinnerIcon className="h-6 w-6 text-brand" /></Center>}>
      <Panel />
    </Suspense>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center">{children}</main>;
}

function Panel() {
  const id = useSearchParams().get('id');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [products, setProducts] = useState<StationProduct[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [phoneNote, setPhoneNote] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [s, p, c] = await Promise.all([
      supabase.from('stations').select('*').eq('id', id).maybeSingle(),
      supabase.from('station_products').select('*').eq('station_id', id),
      supabase
        .from('complaints')
        .select('id, reason, note, created_at, resolved_at')
        .eq('station_id', id)
        .order('created_at', { ascending: false }),
    ]);
    const st = (s.data as Station) ?? null;
    setStation(st);
    // the edit box opens holding the current name, not an empty field
    if (st) setNameDraft(st.name);
    setProducts((p.data as StationProduct[]) ?? []);
    setComplaints((c.data as Complaint[]) ?? []);
  }, [id]);

  useEffect(() => {
    (async () => {
      // stored session, not a round trip — a dropped request must not read as
      // "not signed in"
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return setAllowed(false);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role !== 'admin') return setAllowed(false);
      setAllowed(true);
      await load();
    })();
  }, [load]);

  async function setAvailable(product: FuelProduct, next: boolean) {
    if (!station) return;
    setBusy(product);
    setProducts((prev) =>
      prev.map((p) => (p.product === product ? { ...p, is_available: next } : p))
    );
    const { error } = await supabase
      .from('station_products')
      .update({ is_available: next, updated_at: new Date().toISOString() })
      .eq('station_id', station.id)
      .eq('product', product);

    if (error) {
      // never let the switch claim something the database refused
      setProducts((prev) =>
        prev.map((p) => (p.product === product ? { ...p, is_available: !next } : p))
      );
      setBusy(null);
      return;
    }

    setBusy(null);
  }

  /** The alert is a separate, deliberate act. Flipping five switches is one
   *  delivery, not five events — and a driver who gets five buzzes in ten
   *  seconds deletes the app, which costs us every alert after this one. */
  async function announce() {
    if (!station) return;
    const available = products.filter((p) => p.is_available).map((p) => p.product);
    if (!available.length) return;
    setBusy('announce');
    const { data: sess } = await supabase.auth.getSession();
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ stationId: station.id, products: available }),
    }).catch(() => {});
    setSentAt(new Date().toISOString());
    setBusy(null);
  }

  /** Corrects a name typed wrong at registration.
   *
   *  Only the name. The slug stays as generated, so the link the owner may
   *  already have printed on a sign or sent to their followers keeps working —
   *  stations_guard() only builds a slug when there is none, never on rename.
   *
   *  The site is a static export, so the rebuild is part of the edit rather
   *  than an afterthought: without it the station's own page keeps showing the
   *  wrong name until something else triggers a build. */
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!station) return;
    const next = nameDraft.trim();
    if (!next) return setPhoneNote('اكتب اسم المحطة.');
    if (next === station.name) return setEditingName(false);

    setBusy('name');
    const { error } = await supabase.from('stations').update({ name: next }).eq('id', station.id);
    if (error) {
      setBusy(null);
      setPhoneNote(`تعذّر الحفظ: ${error.message}`);
      return;
    }
    setStation({ ...station, name: next });
    setEditingName(false);

    const why = await rebuildSite();
    setBusy(null);
    setPhoneNote(
      why
        ? `حُفظ الاسم، لكن تحديث الموقع فشل: ${why} — صفحة المحطة ستحمل الاسم القديم حتى البناء التالي.`
        : 'حُفظ الاسم، ويُحدَّث على الموقع خلال دقيقتين.'
    );
  }

  async function setStatus(status: StationStatus) {
    if (!station) return;
    setBusy('status');
    await supabase.from('stations').update({ status }).eq('id', station.id);
    // A newly approved station has no page until the site is rebuilt, so the
    // announcement waits for the rebuild rather than racing it to a 404.
    if (status === 'approved') {
      const why = await rebuildSite();
      if (why) setPhoneNote(`المحطة اعتُمدت، لكن تحديث الموقع فشل: ${why} — لم يُرسل الإشعار بعد.`);
      else await announceStation(station.id);
    }
    setStation({ ...station, status });
    setBusy(null);
  }

  /** Hands the station to its real owner's number. Approval happens after you
   *  have spoken to them, so this is deliberately a separate, explicit act. */
  async function movePhone() {
    if (!station) return;
    setBusy('phone');
    setPhoneNote(null);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/station-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ stationId: station.id, phone: newPhone }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setPhoneNote(out.error ?? 'تعذّر التغيير');
    setPhoneNote(
      out.password
        ? `تم. الدخول: ${out.phone} · كلمة المرور: ${out.password}`
        : `تم. الرقم ${out.phone} له حساب سابق، يدخل بكلمة مروره المعروفة.`
    );
    setNewPhone('');
    await load();
  }

  async function resolve(cid: string) {
    await supabase
      .from('complaints')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', cid);
    await load();
  }

  if (allowed === null) return <Center><SpinnerIcon className="h-6 w-6 text-brand" /></Center>;
  if (!allowed)
    return (
      <Center>
        <div className="px-6 text-center">
          <p className="text-sm font-medium text-slate-600">هذه الصفحة للإدارة فقط.</p>
          <a href="/login" className="btn-primary mt-4 px-6">تسجيل الدخول</a>
        </div>
      </Center>
    );
  if (!station)
    return (
      <Center>
        <div className="px-6 text-center">
          <p className="text-sm font-medium text-slate-600">المحطة غير موجودة.</p>
          <a href="/admin" className="btn-ghost mt-4 px-6">رجوع للوحة</a>
        </div>
      </Center>
    );

  const open = complaints.filter((c) => !c.resolved_at);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 pb-16 pt-6">
      <header>
        <a href="/admin" className="text-xs font-bold text-brand-700">← لوحة الإدارة</a>

        {editingName ? (
          <form
            onSubmit={saveName}
            className="mt-1 rounded-xl border-2 border-brand bg-white p-3"
          >
            <label htmlFor="st-name" className="label">اسم المحطة</label>
            <input
              id="st-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="field"
              autoFocus
            />
            {/* The slug is generated once, at registration, and never from a
                later rename — so a corrected name keeps the link its owner has
                already published. Saying so here stops the admin hesitating. */}
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              الرابط لا يتغيّر: <span dir="ltr">muhta.online/{station.slug}</span> يبقى كما هو،
              فما شاركه صاحب المحطة يظلّ يعمل.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="submit" disabled={busy === 'name'} className="btn-primary disabled:opacity-60">
                {busy === 'name' ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'حفظ'}
              </button>
              <button
                type="button"
                onClick={() => { setEditingName(false); setNameDraft(station.name); }}
                className="btn-ghost"
              >
                إلغاء
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-1 flex items-start justify-between gap-2">
            <h1 className="text-lg font-extrabold">{station.name}</h1>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-brand-700"
            >
              تعديل الاسم
            </button>
          </div>
        )}
        <p className="text-sm text-slate-500">{station.city} — {station.address}</p>
        <p className="mt-1 text-xs font-bold text-slate-600">
          {STATUS_LABEL[station.status] ?? station.status} · ☎️ {station.phone}
        </p>
      </header>

      <section className="card p-5">
        <h2 className="text-sm font-bold">حالة المحطة</h2>
        <p className="mt-1 text-xs text-slate-400">
          الإيقاف يخفيها عن المستخدمين فوراً دون حذف بياناتها — للمحطة التي لا تحدّث حالتها.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {station.status !== 'approved' && (
            <button type="button" disabled={busy === 'status'} onClick={() => setStatus('approved')} className="btn-primary">
              تفعيل
            </button>
          )}
          {station.status !== 'suspended' && (
            <button
              type="button"
              disabled={busy === 'status'}
              onClick={() => setStatus('suspended' as StationStatus)}
              className="btn-ghost text-traffic-red"
            >
              إيقاف المحطة
            </button>
          )}
          {/* The slug page is the one drivers actually reach. The /station/<id>
              route is only prerendered for approved, non-demo stations, so
              linking to it blindly hands the admin a 404. */}
          {station.slug && station.status === 'approved' ? (
            <a href={`/${station.slug}`} className="btn-ghost col-span-2">
              معاينة كما يراها المستخدم
            </a>
          ) : (
            <p className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5 text-center text-xs text-slate-500">
              {station.status !== 'approved'
                ? 'لا معاينة قبل الاعتماد — المحطة غير منشورة بعد.'
                : 'اضبط رابطاً مختصراً في الأسفل لتظهر صفحتها العامة.'}
            </p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">رقم المحطة الأساسي</h2>
        <p className="mt-1 text-xs text-slate-400">
          هذا الرقم يظهر للمستخدمين وهو اسم دخول صاحب المحطة معاً. تغييره ينقل ملكية اللوحة
          إلى الرقم الجديد.
        </p>
        <p className="mt-2 text-xs font-bold text-slate-600" dir="ltr">{station.phone}</p>

        {/* The admin can override either way: an owner who hid the number and
            then asks for it back by phone should not have to find the toggle. */}
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={!!station.phone_hidden}
            onChange={async () => {
              const next = !station.phone_hidden;
              setStation({ ...station, phone_hidden: next });
              await supabase.from('stations').update({ phone_hidden: next }).eq('id', station.id);
              // baked into the prerendered pages; without this it stays readable
              rebuildSite();
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-xs leading-relaxed text-slate-600">
            <b>مخفي عن الناس</b>
            <span className="mt-1 block text-slate-500">
              يختفي زر الاتصال من التطبيق والبوتات، ويبقى الرقم هنا وفي كل شاشات
              الإدارة. لا يتغيّر اسم دخول المالك.
            </span>
          </span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="07XXXXXXXXX"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
        />
        <button
          type="button"
          disabled={busy === 'phone' || newPhone.replace(/\D/g, '').length < 10}
          onClick={movePhone}
          className="btn-ghost mt-2 w-full"
        >
          نقل المحطة إلى هذا الرقم
        </button>
        {phoneNote && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            {phoneNote}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">توفر الوقود</h2>
        <p className="mt-1 text-xs text-slate-400">
          فعّل ما هو متوفر، ثم أرسل إشعاراً واحداً بكل المنتجات.
        </p>
        <ul className="mt-2 divide-y divide-slate-100">
          {PRODUCT_ORDER.map((product) => {
            const row = products.find((p) => p.product === product);
            const on = Boolean(row?.is_available);
            return (
              <li key={product} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-semibold text-slate-700">{PRODUCT_LABELS[product]}</span>
                <button
                  type="button"
                  disabled={!row || busy === product}
                  aria-pressed={on}
                  onClick={() => setAvailable(product, !on)}
                  className={`h-7 w-12 rounded-full p-0.5 transition-colors duration-200 ${
                    on ? 'bg-brand' : 'bg-slate-300'
                  } disabled:opacity-40`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white transition-transform duration-200 ${
                      on ? '-translate-x-5' : ''
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={announce}
          disabled={busy === 'announce' || !products.some((p) => p.is_available)}
          className="btn-primary mt-4 w-full disabled:opacity-40"
        >
          {busy === 'announce' ? 'جارٍ الإرسال…' : 'إرسال إشعار واحد للمتابعين'}
        </button>
        {sentAt && (
          <p className="mt-2 text-center text-xs font-semibold text-brand">
            تم إرسال الإشعار.
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">الشكاوى {open.length > 0 && `(${open.length})`}</h2>
        {complaints.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">لا توجد شكاوى على هذه المحطة.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {complaints.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${c.resolved_at ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {c.reason}
                    </p>
                    {c.note && <p className="mt-0.5 text-xs text-slate-500">{c.note}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {new Intl.DateTimeFormat('ar-IQ', {
                        timeZone: 'Asia/Baghdad',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(c.created_at))}
                    </p>
                  </div>
                  {!c.resolved_at && (
                    <button type="button" onClick={() => resolve(c.id)} className="shrink-0 text-xs font-bold text-brand-700">
                      تمّت المعالجة
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StationLinkCard
        stationId={station.id}
        name={station.name}
        slug={station.slug}
        onSlugChange={(slug) => setStation({ ...station, slug })}
      />

      <StationPoster key={station.slug ?? 'none'} name={station.name} slug={station.slug} />

      <AvailabilityPoster
        name={station.name}
        slug={station.slug}
        products={products.filter((p) => p.is_available).map((p) => p.product)}
      />
    </main>
  );
}
