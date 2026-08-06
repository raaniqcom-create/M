import { redirect, notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 300;

// Short handle: /alnakheal1 -> the full station page. Next resolves static
// routes (/login, /admin, …) before this catch-all, so they can never be
// shadowed by a station slug.
export default async function SlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data } = await db
    .from('stations')
    .select('id')
    .ilike('slug', slug)
    .eq('status', 'approved')
    .maybeSingle();

  if (!data) notFound();
  redirect(`/station/${data.id}`);
}
