'use client';

import { useEffect } from 'react';

// Native push for the app shells. A WebView has no Push API, so inside the app
// the browser bell can never work — this registers the device with the OS and
// stores the token so the server can reach it. A no-op on the web, where the
// existing web-push path already applies.
//
// The token means different things per platform: Firebase on Android, a raw
// APNs device token on iOS. The server needs to know which, hence `platform`.
export function NativePush() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cap = (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
        }
      ).Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const platform = cap.getPlatform?.() === 'ios' ? 'ios' : 'android';

      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Android takes the sound from the channel, not from each message, and a
      // channel's sound is fixed once created — so this must exist before the
      // first notification arrives or the device is stuck on the default tone.
      // iOS has no channels; the sound rides on each payload instead.
      if (platform === 'android') {
        await PushNotifications.createChannel({
          id: 'muhta_alerts',
          name: 'تنبيهات الوقود',
          description: 'إشعار فور توفر الوقود في محطاتك',
          importance: 5,
          visibility: 1,
          sound: 'alert',
          vibration: true,
        }).catch(() => {});
      }

      // Android 13+ needs the runtime prompt; older versions grant implicitly
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== 'granted' || cancelled) return;

      await PushNotifications.addListener('registration', async (token) => {
        const { supabase } = await import('@/lib/supabase');
        // Plain insert, duplicate swallowed. Every upsert resolution PostgREST
        // offers needs an UPDATE policy, and the only UPDATE policy here is
        // admin-only — so every registration was rejected 42501 and the table
        // stayed empty on both platforms since launch. Loosening UPDATE would
        // let anyone flip is_admin on another device's row and receive the
        // admin alerts, so the client gives up the update instead.
        const { error } = await supabase
          .from('device_tokens')
          .insert({ token: token.value, platform });
        // 23505 = this device already registered, which is the happy path on
        // every launch after the first.
        if (error && error.code !== '23505') {
          console.error('device token save failed', error);
        }
        // the admin screen claims this row later; it has no other way to know
        // which of the many device tokens belongs to the phone in your hand
        try {
          localStorage.setItem('device-token', token.value);
        } catch {
          /* private mode — the admin flag is a convenience, not a requirement */
        }
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
