/** Where the real app lives, now that both listings are public. Kept in one
 *  place because four screens link to them and a stale store URL is the one
 *  broken link a first-time visitor is guaranteed to hit. */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6799531591';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=online.muhta.app';

/** The numeric id Safari needs for its own top-of-page install banner. */
export const APPLE_APP_ID = '6799531591';

export type Platform = 'android' | 'ios' | 'other';

/** iPadOS 13+ reports itself as a Mac, so touch support disambiguates. */
export function detectPlatform(ua = navigator.userAgent): Platform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}

export function storeUrl(p: Platform): string | null {
  if (p === 'android') return PLAY_STORE_URL;
  if (p === 'ios') return APP_STORE_URL;
  return null;
}
