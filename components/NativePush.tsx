'use client';

import { useEffect } from 'react';

// Native push for the Android app. The WebView has no Push API, so inside the
// app the browser bell can never work — this registers the device with
// Firebase instead and stores the token so the server can reach it.
// A no-op on the web, where the existing web-push path already applies.
export function NativePush() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Android takes the sound from the channel, not from each message, and a
      // channel's sound is fixed once created — so this must exist before the
      // first notification arrives or the device is stuck on the default tone.
      await PushNotifications.createChannel({
        id: 'muhta_alerts',
        name: 'تنبيهات الوقود',
        description: 'إشعار فور توفر الوقود في محطاتك',
        importance: 5,
        visibility: 1,
        sound: 'alert',
        vibration: true,
      }).catch(() => {});

      // Android 13+ needs the runtime prompt; older versions grant implicitly
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== 'granted' || cancelled) return;

      await PushNotifications.addListener('registration', async (token) => {
        const { supabase } = await import('@/lib/supabase');
        // upsert so reinstalling or refreshing the token can't pile up rows
        await supabase
          .from('device_tokens')
          .upsert({ token: token.value, platform: 'android' }, { onConflict: 'token' });
      });

      await PushNotifications.addListener('registrationError', (err) => {
        console.error('push registration failed', err);
      });

      await PushNotifications.register();
    })().catch((e) => console.error('native push setup failed', e));

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
