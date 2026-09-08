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
import { sendScheduleAlert } from '../_shared/alert.ts';

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

/** دقيقةٌ واحدةٌ تُنتظر قبل العرض.
 *
 *  **لأنّ القناةَ تنشر رسالتين لا رسالة.** قِيس على ليلة ٢٠٢٦-٠٩-٠٧: المحسّنُ
 *  ٢٣:٢٩ والعاديُّ ٢٣:٣٢ — ثلاثُ دقائق. فعرضٌ فوريٌّ يجعلهما اقتراحين
 *  منفصلين، ونشرتين، وإشعارين — والثاني لا يصل أحداً لأنّ حاجز الخمس
 *  والأربعين دقيقة يحجبه.
 *
 *  فتُنتظر الدفعةُ دقيقةً حتى تستقرّ، ثمّ تُعرض جدولاً واحداً. **ودقيقةٌ لا
 *  ربعُ ساعة**: قرارُ صاحب المنصّة — «هنالك من يسبق». والدقيقةُ تكفي لرسالتين
 *  متتاليتين، وما تأخّر عنها يصل عرضاً ثانياً يُضاف بلا إشعار. */
const SETTLE_MINUTES = 1;

/** ستّةٌ على الأكثر في العرض الواحد: دفعةُ ليلةٍ لا أرشيفُ أسبوع. */
const MAX_MERGE = 6;

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

/** ساعةُ شبكة الأمان بتوقيت بغداد — طلبُ صاحب المنصّة. */
const ALERT_HOUR = 7;

const baghdadHour = () =>
  Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      hour12: false,
    })
  );

const baghdadDay = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });

/** يُرسل نصّاً إلى بوت المنصّة كأنّ الإدارةَ كتبته.
 *
 *  السرُّ من بيئة الدالّة نفسِها، فلا يخرج منها. وهو المسلكُ الذي يجعل
 *  المعاينةَ والتصحيحَ والنشرَ كلَّها في مكانٍ واحد. */
async function tellBot(text: string): Promise<boolean> {
  const admins = (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!admins.length || !secret) return false;
  const admin = Number(admins[0]);
  const now = Math.floor(Date.now() / 1000);
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram`, {
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
        text,
      },
    }),
  });
  if (!r.ok) console.error('telegram', r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  const cron = Deno.env.get('CRON_SECRET');
  if (!cron || req.headers.get('x-cron-secret') !== cron) {
    return new Response('forbidden', { status: 403 });
  }

  // ── شبكةُ الأمان الصباحيّة ───────────────────────────────────────────
  //
  // الجدولُ يُنشر ليلاً — بعد الحاديةَ عشرةَ غالباً، وأحياناً بعد منتصف الليل.
  // وإشعارٌ يخرج الثالثةَ فجراً إزعاجٌ لا خبر، وجدولٌ بلا إشعارٍ خبرٌ لا يصل.
  // فالسابعةُ صباحاً (طلبُ صاحب المنصّة): إن بقي جدولُ اليوم بلا إشعار، خرج.
  //
  // و`alerted_at` يمنع التكرار: إن خرج الإشعارُ مساءً صمتت هذه تماماً. ولا
  // تُرسل بنفسها بل تكتب `/اشعار` إلى البوت — فالنداءُ واحدٌ في مكانٍ واحد،
  // ويبقى في محادثة الإدارة أثرٌ يقول ما جرى.
  // `?morning=1` يُشغّلها الآن، و`&dry=1` يجعلها بروفةً تعدّ ولا تُرسل —
  // فيُفحص المسارُ كاملاً قبل السابعة، لا بعد فواتها.
  const params = new URL(req.url).searchParams;
  const forced = params.get('morning') === '1';
  const dry = params.get('dry') === '1';

  if (forced || baghdadHour() === ALERT_HOUR) {
    const day = baghdadDay();
    const { data: due } = await db
      .from('fuel_schedule')
      .select('product, city')
      .eq('for_date', day)
      .is('alerted_at', null);

    if (due?.length) {
      const cities = [...new Set(due.map((r) => r.city).filter(Boolean))] as string[];
      const products = [...new Set(due.map((r) => r.product))] as string[];
      const { sent, why } = await sendScheduleAlert(cities, products, due.length, 'اليوم', dry);

      // **الختمُ عند النجاح وحدَه.** ولو خُتم عند الفشل لَسكتت الشبكةُ عن جدولٍ
      // لم يصل أحداً، وهو نقيضُ ما بُنيت له.
      if (sent && !dry) {
        await db
          .from('fuel_schedule')
          .update({ alerted_at: new Date().toISOString() })
          .eq('for_date', day)
          .is('alerted_at', null);
      }

      // وتُخبر الإدارةَ بما جرى — إخبارٌ لا اعتماد: فشلُ الرسالة لا يمسّ
      // الإشعارَ الذي خرج سلفاً.
      if (dry) return json({ ok: true, dryRun: { day, due: due.length, cities, products, sent, why } });

      await tellBot(
        sent
          ? `📣 شبكةُ الصباح: وصل إشعارُ جدول ${day} إلى ${sent} مشتركاً في ${cities.join(' · ')}.`
          : `⚠️ شبكةُ الصباح: لم يخرج إشعارُ جدول ${day} — ${why}`
      ).catch(() => {});

      return json({ ok: true, morningAlert: { day, due: due.length, sent, why } });
    }
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
  // **دفعةُ الليلة كلُّها في عرضٍ واحد.** تُرتَّب بزمنها لا بعكسه: العنوانُ
  // يسبق ما تحته، والمحلِّلُ يقرأ الوقودَ الجاري مع العناوين.
  const { data: pending } = await db
    .from('channel_posts')
    .select('id, body, posted_at')
    .eq('state', 'seen')
    .gte('posted_at', new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString())
    .lte('posted_at', new Date(Date.now() - SETTLE_MINUTES * 60_000).toISOString())
    .order('posted_at', { ascending: true })
    .limit(MAX_MERGE);

  if (!pending?.length) return json({ ok: true, fetched, fresh, proposed: null });
  // ثابتٌ لا هروبٌ نصّيّ: تحريراتٌ آليّةٌ في هذا المستودع أكلت الشرطةَ المائلة
  // مرّتين، فصار سطرُ الفصل حرفاً يُبنى من رقمه.
  const NL = String.fromCharCode(10);
  const post = {
    id: pending.map((p) => p.id).join(' + '),
    body: pending.map((p) => p.body).join(NL),
  };

  const admins = (Deno.env.get('TELEGRAM_ADMIN_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!admins.length) return json({ ok: false, why: 'TELEGRAM_ADMIN_IDS غائب' }, 500);
  const admin = Number(admins[0]);

  // ولا يُقاطَع عملٌ جارٍ: مسوّدةٌ مفتوحةٌ تعني أنّ الإدارةَ في وسط شيء —
  // تسجيلِ محطةٍ أو مراجعةِ جدولٍ سابق — وكتابةُ مسوّدةٍ فوقها تمحوه.
  //
  // **لكنّ المتروكةَ ليست جارية.** وقع: عُرض جدولٌ ولم يُضغط عليه، فبقيت
  // مسوّدتُه ساعاتٍ تحجب كلَّ عرضٍ بعدها — والرصدُ يصمت بلا أن يقول لماذا.
  // فثلاثُ ساعاتٍ حدٌّ: ما دونها عملٌ جارٍ يُحترم، وما فوقها متروكٌ يُتخطّى.
  const STALE_HOURS = 3;
  const { data: busy } = await db
    .from('telegram_drafts')
    .select('telegram_id, updated_at')
    .eq('telegram_id', admin)
    .gte('updated_at', new Date(Date.now() - STALE_HOURS * 3_600_000).toISOString())
    .maybeSingle();
  if (busy) return json({ ok: true, fetched, fresh, proposed: null, why: 'مسوّدةٌ مفتوحة' });

  if (!(await tellBot(post.body))) {
    return json({ ok: false, fetched, fresh, why: 'تعذّر بلوغُ البوت' }, 500);
  }

  await db
    .from('channel_posts')
    .update({ state: 'proposed', acted_at: new Date().toISOString() })
    .in('id', pending.map((p) => p.id));

  return json({ ok: true, fetched, fresh, proposed: post.id, merged: pending.length });
});
