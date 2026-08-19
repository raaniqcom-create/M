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
  if (mins < 60) return `قبل ${mins} دقيقة`;

  // وما فوق الساعة صار يُقال بوحدته.
  //
  // كانت الدالة تقف عند الدقائق لأن قارئها الوحيد كان تقييم الازدحام، وعمره
  // نصف ساعة فلا يبلغ غيرها. ثم صارت تُستعمل لعمر حالة المنتجات، وهذه تُقاس
  // بالساعات والأيام — فقراءةٌ عمرها ثلاثة أيام كانت تُكتب «قبل ٤٣٨٢ دقيقة»،
  // وهو رقم لا يقرؤه أحد ولا يقرّر به أحد.
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${plural(hrs, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`;

  const days = Math.floor(hrs / 24);
  return `قبل ${plural(days, 'يوم', 'يومين', 'أيام', 'يوماً')}`;
}

/** العربية تعدّ على أربعة وجوه: واحد، واثنان، وثلاثة إلى عشرة، وما فوقها. */
function plural(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
