/** How old a crowd reading is, in words. A colour shown without this reads as
 *  live even when it is twenty-nine minutes stale — which in a fuel queue is
 *  a different station. */
export function agoLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 0) return 'الآن';
  if (mins < 1) return 'الآن';
  if (mins === 1) return 'قبل دقيقة';
  if (mins === 2) return 'قبل دقيقتين';
  if (mins < 11) return `قبل ${mins} دقائق`;
  return `قبل ${mins} دقيقة`;
}
