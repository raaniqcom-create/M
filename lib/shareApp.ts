'use client';

const SITE = 'https://muhta.online';

/** Deliberately written to be forwarded, not read: it opens on the problem the
 *  reader already has, names the app once, and ends. A paragraph gets skipped
 *  in a family group; two lines get passed on. */
export const SHARE_TEXT =
  'وداعاً للسؤال عن البانزين والنفط والغاز 🚗⛽\n' +
  'تطبيق «المحطة التقنية» يخبرك أي محطة في الأنبار يتوفر فيها الوقود الآن — ' +
  'وينبّهك فور وصوله. مجاناً وبسرعة.';

export type ShareResult = 'shared' | 'copied' | 'failed';

/** Hands the OS sheet to the user so they pick the app, rather than us picking
 *  it for them. Clipboard is the fallback: plain Android WebViews and desktop
 *  browsers have no share sheet, and forcing one messenger there would be
 *  worse than letting them paste wherever they were already going. */
export async function shareApp(): Promise<ShareResult> {
  const payload = { title: 'المحطة التقنية', text: SHARE_TEXT, url: SITE };

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (e) {
      // AbortError is the user closing the sheet — not a failure, and falling
      // through to the clipboard would silently overwrite what they copied.
      if ((e as Error)?.name === 'AbortError') return 'shared';
    }
  }

  try {
    await navigator.clipboard.writeText(`${SHARE_TEXT}\n${SITE}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
