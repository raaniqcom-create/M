import type { Metadata } from 'next';
import { StoryPreview } from '@/components/StoryPreview';

export const metadata: Metadata = {
  title: 'معاينة حالة',
  robots: { index: false, follow: false },
};

/** `/story-preview?d=…` — الحالةُ كما ستظهر، من بياناتٍ في الرابط لا من القاعدة:
 *  تُرسَل معاينةً لمن يراجعها قبل النشر (أو قبل موعدها) بلا جلسةٍ ولا صلاحية. */
export default function StoryPreviewPage() {
  return <StoryPreview />;
}
