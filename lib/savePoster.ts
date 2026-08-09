'use client';

/** Gets a canvas image onto the user's phone.
 *
 *  A plain `<a download>` is ignored inside a WKWebView, so on iOS the button
 *  simply did nothing. The order below goes from the path that lands the image
 *  in an app the user chose, down to the one that always works:
 *
 *  1. Web Share with a file — reaches WhatsApp, Instagram, Photos directly.
 *  2. `<a download>` — the desktop and Android answer.
 *  3. Open the image in a new tab — the last resort, where the user long-presses
 *     to save. Never silent failure.
 */
export async function savePoster(
  canvas: HTMLCanvasElement,
  filename: string,
  text?: string
): Promise<void> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return;

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...(text ? { text } : {}) });
      return;
    } catch {
      // the user dismissed the sheet, or the platform refused — fall through
    }
  }

  const url = URL.createObjectURL(blob);

  // The `download` property exists on iOS and does nothing, so feature
  // detection is useless here — the platform has to be named.
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  if (iOS) {
    window.open(url, '_blank');
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
