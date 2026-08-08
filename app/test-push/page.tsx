'use client';

import { useEffect, useState } from 'react';
import { urlBase64ToUint8Array } from '@/lib/push';
import { FuelIcon, SpinnerIcon } from '@/components/icons';

type Step = { label: string; state: 'pending' | 'ok' | 'fail'; detail?: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function TestPushPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState<string>('');

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setEnv(
      [
        ios ? 'آيفون' : /android/i.test(ua) ? 'أندرويد' : 'حاسوب',
        standalone ? 'مثبّت على الشاشة' : 'في المتصفح',
        'PushManager' in window ? 'يدعم الإشعارات' : 'لا يدعم الإشعارات',
      ].join(' · ')
    );
  }, []);

  async function run() {
    setBusy(true);
    const log: Step[] = [];
    const push = (label: string, state: Step['state'], detail?: string) => {
      log.push({ label, state, detail });
      setSteps([...log]);
    };

    try {
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor;

      // Inside the Android app there is no Push API at all — it speaks to
      // Firebase instead, so the whole web-push path would fail misleadingly.
      if (cap?.isNativePlatform?.()) {
        push('البيئة', 'ok', 'تطبيق أندرويد — إشعارات Firebase');

        const { PushNotifications } = await import('@capacitor/push-notifications');
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== 'granted') perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') {
          push('إذن الإشعارات', 'fail', `الحالة: ${perm.receive}`);
          setBusy(false);
          return;
        }
        push('إذن الإشعارات', 'ok');

        const token = await new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 15000);
          PushNotifications.addListener('registration', (t) => {
            clearTimeout(timer);
            resolve(t.value);
          });
          PushNotifications.addListener('registrationError', () => {
            clearTimeout(timer);
            resolve(null);
          });
          PushNotifications.register();
        });

        if (!token) {
          push('تسجيل الجهاز', 'fail', 'لم يصدر رمز الجهاز — تحقق من الاتصال');
          setBusy(false);
          return;
        }
        push('تسجيل الجهاز', 'ok', token.slice(0, 22) + '…');

        const r = await fetch(`${SUPABASE_URL}/functions/v1/test-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON },
          body: JSON.stringify({ deviceToken: token }),
        });
        const o = await r.json();
        if (r.ok) push('إرسال الإشعار', 'ok', 'يجب أن يصلك الآن');
        else push('إرسال الإشعار', 'fail', String(o.error).slice(0, 140));
        setBusy(false);
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // The single most common reason a "notification" test does nothing:
        // the runtime has no push support at all.
        push('دعم الإشعارات', 'fail', 'هذا المتصفح لا يدعم إشعارات الويب');
        setBusy(false);
        return;
      }
      push('دعم الإشعارات', 'ok');

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        push('إذن الإشعارات', 'fail', `الحالة: ${perm}`);
        setBusy(false);
        return;
      }
      push('إذن الإشعارات', 'ok');

      const reg = await navigator.serviceWorker.ready;
      push('تشغيل الخدمة الخلفية', 'ok');

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        }));
      const json = sub.toJSON();
      push('الاشتراك في خدمة الإشعارات', 'ok', new URL(json.endpoint!).host);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/test-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });
      const out = await res.json();

      if (res.ok) push('إرسال الإشعار', 'ok', 'يجب أن يصلك الآن');
      else push('إرسال الإشعار', 'fail', String(out.error).slice(0, 120));
    } catch (e) {
      push('خطأ غير متوقع', 'fail', (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <a href="/" className="mb-6 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="text-center text-xl font-extrabold">اختبار الإشعارات</h1>
      <p className="mt-2 text-center text-xs text-slate-500">{env}</p>

      <button onClick={run} disabled={busy} className="btn-primary mt-6 w-full">
        {busy && <SpinnerIcon className="h-4 w-4" />}
        أرسل إشعاراً تجريبياً لهذا الجهاز
      </button>

      {steps.length > 0 && (
        <ol className="card mt-5 space-y-3 p-5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className={s.state === 'ok' ? 'text-brand' : 'text-traffic-red'}>
                {s.state === 'ok' ? '✅' : '❌'}
              </span>
              <span className="flex-1">
                <span className="font-semibold">{s.label}</span>
                {s.detail && (
                  <span className="mt-0.5 block text-xs text-slate-500" dir="auto">
                    {s.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        على آيفون يجب أولاً إضافة الموقع للشاشة الرئيسية من سفاري، ثم فتحه من الأيقونة —
        سفاري لا يسمح بالإشعارات من داخل المتصفح.
      </p>

      <a href="/" className="mt-6 block text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
