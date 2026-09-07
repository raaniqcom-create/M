// رصدُ القنوات: يقرأ صفحاتِها العامّة كلَّ عشر دقائق، ويعرض الجدولَ على
// الإدارة في تلغرام — ولا يكتب صفّاً واحداً في `fuel_schedule`.
//
// ── ولماذا لا يُنشر تلقائيّاً ────────────────────────────────────────────
//
// هذا خبرٌ يقطع الناسُ عليه الطريقَ صباحاً. و`20260823c` يسجّل أنّ المطابقةَ
// بالاسم جُرّبت في هذه المنصّة ورُفضت لأنها تُخطئ في الجهتين — فبقي الشرطُ:
// المطابقةُ تقترح، والإنسانُ يقرّر. وهذه الدالّةُ تختصر **التحويلَ** وحدَه:
// كان صاحبُ المنصّة يفتح القناةَ ويحوّل، وصار الجدولُ يصله من نفسِه بزرّيه.
//
// ── ولماذا تنادي بوتَ المنصّة بدل أن تكتب الرسالةَ بنفسها ────────────────
//
// لأنّ المعاينةَ والتصحيحَ والنشرَ كلَّها في `functions/telegram` سلفاً. ولو
// كُتبت هنا نسخةٌ ثانية لَافترقتا أوّلَ تعديل. فتُبنى رسالةٌ على شكل تحديث
// تلغرام وتُرسَل إلى مسار البوت بسرِّه — أي أنّ ما يجري كأنّ صاحبَ المنصّة
// حوّل المنشورَ بيده، بالحرف.
//
// ── والإذن ──────────────────────────────────────────────────────────────
//
// صاحبُ القناة رفض إدخالَ البوت مشرفاً، وأذن صراحةً بنشر كلّ ما ينشره. فهذه
// قراءةٌ لصفحةٍ عامّةٍ بإذنٍ مقول، والمصدرُ لا يُسمّى فيما يراه الجمهور.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { looksLikeSchedule } from '../../../lib/schedule.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** نصُّ المنشور من صفحة القناة.
 *
 *  بلا مكتبةِ تحليلٍ: الصفحةُ ثابتةُ الشكل منذ سنين، وكلُّ ما يلزم منها ثلاثةُ
 *  أشياء — معرّفُ المنشور وطابعُه ونصُّه. ومكتبةٌ كاملةٌ لأجلها ثِقلٌ بلا مقابل.
 *
 *  والكياناتُ تُفكّ يدويّاً: `&quot;` و`&amp;` تَرِدان فعلاً في نصّ القناة،
 *  و`<br/>` هي أسطرُ الجدول نفسُها — فلو أُسقطت لَصار المنشورُ سطراً واحداً
 *  وقُرئ محطةً واحدة. */
interface ChannelPost {
  id: string;
  postedAt: string | null;
  body: string;
}

/** عشرون ساعة: جدولٌ يُنشر ليلاً عن الغد يبقى نافعاً حتى مساء الغد. وما
 *  قبلها أرشيفٌ لا خبر. */
const FRESH_HOURS = 20;

function isRecent(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < FRESH_HOURS * 3_600_000;
}

function readChannel(html: string, slug: string): ChannelPost[] {
  const out: ChannelPost[] = [];
  // كلُّ منشورٍ كتلةٌ تبدأ بـ data-post ثمّ نصُّه ثمّ طابعُه.
  const blocks = html.split('data-post="').slice(1);
  for (const block of blocks) {
    const id = block.slice(0, block.indexOf('"'));
    if (!id.startsWith(`${slug}/`)) continue;

    const textMatch = block.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    if (!textMatch) continue;

    const body = textMatch[1]
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    if (!body) continue;

    const timeMatch = block.match(/datetime="([^"]+)"/);
    out.push({ id, postedAt: timeMatch ? timeMatch[1] : null, body });
  }
  return out;
}

Deno.serve(async (req) => {
  const cron = Deno.env.get('CRON_SECRET');
  if (!cron || req.headers.get('x-cron-secret') !== cron) {
    return new Response('forbidden', { status: 403 });
  }

  const { data: channels } = await db
    .from('watch_channels')
    .select('slug')
    .eq('active', true);
  if (!channels?.length) return json({ ok: true, channels: 0 });

  let fetched = 0;
  let fresh = 0;

  for (const { slug } of channels) {
    let html: string;
    try {
      const r = await fetch(`https://t.me/s/${slug}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; muhta.online schedule reader)' },
      });
      if (!r.ok) {
        console.error('channel', slug, r.status);
        continue;
      }
      html = await r.text();
    } catch (e) {
      console.error('channel fetch', slug, e);
      continue;
    }

    const posts = readChannel(html, slug);
    fetched += posts.length;
    if (!posts.length) continue;

    // **ما لم يُرَ من قبلُ وحدَه.** بلا هذا يُعاد عرضُ الجدول نفسِه كلَّ عشر
    // دقائق. و`ignoreDuplicates` تجعل المكرَّرَ صمتاً لا خطأً.
    const { data: added } = await db
      .from('channel_posts')
      .upsert(
        posts.map((p) => ({
          id: p.id,
          channel: slug,
          posted_at: p.postedAt,
          body: p.body,
          // ما ليس جدولاً — أو جدولٌ مضى يومُه — يُسجَّل ولا يُعرض.
          //
          // **والقِدَمُ شرطٌ لا زينة.** صفحةُ القناة تردّ ثمانيةَ عشرَ منشوراً،
          // أكثرُها جداولُ ليالٍ مضت. فبلا هذا الشرط يُعرض على الإدارة جدولٌ
          // قديمٌ كلَّ عشر دقائق ساعاتٍ متّصلة — وأسوأُ منه أن يُنشر أحدُها
          // فيصل الناسَ خبرُ أمس على أنه خبرُ اليوم.
          state: looksLikeSchedule(p.body) && isRecent(p.postedAt) ? 'seen' : 'ignored',
        })),
        { onConflict: 'id', ignoreDuplicates: true }
      )
      .select('id');
    fresh += added?.length ?? 0;
  }

  // ── ثمّ يُعرض واحدٌ ─────────────────────────────────────────────────────
  //
  // واحدٌ في كلّ دورة، وأحدثُها: مسوّدةُ البوت صفٌّ واحدٌ لكلّ إداريّ، فعرضان
  // معاً يمحو أوّلُهما الثاني. والباقي ينتظر الدورةَ التالية — عشرُ دقائق.
  const { data: pending } = await db
    .from('channel_posts')
    .select('id, body')
    .eq('state', 'seen')
    .gte('posted_at', new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString())
    .order('posted_at', { ascending: false })
    .limit(1);

  const post = pending?.[0];
  if (!post) return json({ ok: true, fetched, fresh, proposed: null });

  const admins = (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!admins.length || !secret) {
    return json({ ok: false, why: 'TELEGRAM_ADMIN_IDS أو TELEGRAM_WEBHOOK_SECRET غائب' }, 500);
  }
  const admin = Number(admins[0]);

  // ولا يُقاطَع عملٌ جارٍ: مسوّدةٌ مفتوحةٌ تعني أنّ الإدارةَ في وسط شيء —
  // تسجيلِ محطةٍ أو مراجعةِ جدولٍ سابق — وكتابةُ مسوّدةٍ فوقها تمحوه.
  const { data: busy } = await db
    .from('telegram_drafts')
    .select('telegram_id')
    .eq('telegram_id', admin)
    .maybeSingle();
  if (busy) return json({ ok: true, fetched, fresh, proposed: null, why: 'مسوّدةٌ مفتوحة' });

  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body: JSON.stringify({
      update_id: now,
      message: {
        message_id: now,
        date: now,
        from: { id: admin, is_bot: false, first_name: 'رصد' },
        chat: { id: admin, type: 'private' },
        text: post.body,
      },
    }),
  });

  if (!res.ok) {
    console.error('telegram', res.status, await res.text());
    return json({ ok: false, fetched, fresh, why: `telegram ${res.status}` }, 500);
  }

  await db
    .from('channel_posts')
    .update({ state: 'proposed', acted_at: new Date().toISOString() })
    .eq('id', post.id);

  return json({ ok: true, fetched, fresh, proposed: post.id });
});
