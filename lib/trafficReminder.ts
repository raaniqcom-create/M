import { MANUAL_TRAFFIC_MINUTES } from './products';

// A single local notification, fired once, MANUAL_TRAFFIC_MINUTES after the
// owner set the traffic level.
//
// Local rather than a server push on purpose: the trigger is one tap on this
// phone, the delay is fixed, and the phone already knows the time. Routing it
// through the server would mean a row, a cron pass, and a push that can be
// late — for a reminder whose whole value is landing exactly when the reading
// goes stale.
//
// The general every-30-minutes product reminder is unaffected; it still runs
// from netlify/functions/owner-reminders.mts.
const ID = 7301; // fixed: scheduling again replaces rather than stacks

type Plugin = typeof import('@capacitor/local-notifications').LocalNotifications;

async function plugin(): Promise<Plugin | null> {
  // absent in a browser, and importing it there throws
  if (typeof window === 'undefined' || !('Capacitor' in window)) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch {
    return null;
  }
}

/** Cancels any pending traffic reminder. Safe to call when none is scheduled. */
export async function cancelTrafficReminder(): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: [{ id: ID }] });
  } catch {
    /* nothing was pending */
  }
}

/** Schedules the reminder, replacing any previous one.
 *
 *  Every call cancels first: an owner who taps خفيف then مزدحم a minute later
 *  should get one reminder thirty minutes from the second tap, not two
 *  reminders a minute apart. */
export async function scheduleTrafficReminder(stationName?: string): Promise<boolean> {
  const p = await plugin();
  if (!p) return false;

  try {
    const perm = await p.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await p.requestPermissions();
      if (asked.display !== 'granted') return false;
    }

    await cancelTrafficReminder();
    await p.schedule({
      notifications: [
        {
          id: ID,
          title: 'حدّث حالة الازدحام',
          body: stationName
            ? `مضت ${MANUAL_TRAFFIC_MINUTES} دقيقة على آخر تحديث لـ${stationName}. حدّثها ليراها الناس، أو اتركها فتُمسح.`
            : `مضت ${MANUAL_TRAFFIC_MINUTES} دقيقة على آخر تحديث. حدّث حالة الازدحام ليراها الناس.`,
          schedule: { at: new Date(Date.now() + MANUAL_TRAFFIC_MINUTES * 60_000) },
          smallIcon: 'ic_stat_icon_config_sample',
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}
