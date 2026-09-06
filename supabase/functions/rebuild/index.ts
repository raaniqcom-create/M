// Rebuilds the public site after a station is approved.
//
// The site is a static export: a station's page only exists if it was approved
// when the build ran. deploy.yml has always listened for a `stations-changed`
// repository_dispatch — nothing ever sent one, so every station approved since
// the last push had a dead link, and the owner was handed a URL that 404s.
//
// The GitHub token cannot live in the browser bundle, so the dispatch goes
// through here. Admin-only: a rebuild is cheap but not free, and an open
// endpoint is a free CI-minute faucet for anyone holding the anon key.
import { createClient } from 'jsr:@supabase/supabase-js@2';
// وليس btoa: العنوانُ والرسالةُ عربيّة، وbtoa يرمي على أيّ حرفٍ فوق ٢٥٥.
// وهو السطرُ الوحيد الذي كان سينكسر عند أوّل استعمالٍ حقيقيّ لا في الفحص.
import { encodeBase64 } from 'jsr:@std/encoding/base64';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const REPO = 'raaniqcom-create/M';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // Two callers, both trusted, neither able to use the other's credential:
    // the admin panel holds a session, and the Telegram bot holds the shared
    // cron secret because a bot has no session to hold.
    const secret = Deno.env.get('CRON_SECRET');
    const isCron = !!secret && req.headers.get('x-cron-secret') === secret;
    let isAdmin = false;

    if (!isCron) {
      const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!jwt) return json({ error: 'غير مصرّح' }, 401);

      const { data: auth } = await db.auth.getUser(jwt);
      if (!auth?.user) return json({ error: 'غير مصرّح' }, 401);

      const { data: profile } = await db
        .from('profiles').select('role').eq('id', auth.user.id).maybeSingle();

      // الإدارة، أو صاحب محطة معتمدة. وكان الشرط «إدارة» وحدها، وهو ما جعل
      // إخفاء الرقم كذبةً على صاحبه: يقلب المفتاح في لوحته، فيُحدَّث الجدول
      // ويُطلق هذا النداء فيردّ 403، والنداء بلا await ونتيجته مُهمَلة — فلا
      // يُبنى شيء، ورقمه يبقى مقروءاً في الصفحة المنشورة إلى الأبد بينما
      // لوحته تقول له إنه مخفيّ.
      isAdmin = profile?.role === 'admin';
      if (!isAdmin) {
        const { count } = await db
          .from('stations')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', auth.user.id)
          .eq('status', 'approved');
        // والباب يبقى مغلقاً على من سواهما: ستّة ملّاك لا يُغرقون CI، وحاملُ
        // المفتاح المنشور وحده لا يزال بلا مدخل.
        if (!count) return json({ error: 'غير مصرّح' }, 403);
      }
    }

    const token = Deno.env.get('GH_DISPATCH_TOKEN');
    if (!token) return json({ error: 'GH_DISPATCH_TOKEN غير مضبوط' }, 500);

    // ── وضعُ الصيانة ────────────────────────────────────────────────────
    //
    // **هنا لا في دالّةٍ ثانية.** الحراسةُ والعميلُ وكتلةُ CORS والرمزُ كلُّها
    // مكتوبةٌ فوق؛ ودالّةٌ جديدة تنسخها وتضيف سرّاً يُنقل في كلّ هجرة.
    //
    // **وللإدارة وحدَها.** البابُ أعلاه يقبل صاحبَ محطةٍ معتمدة عمداً — لأن
    // البناءَ رخيص. وإطفاءُ الموقع ليس كذلك. والكرونُ مرفوضٌ أيضاً: لا معنى
    // لمهمّةٍ مجدولةٍ تُطفئ الموقع.
    const body = (await req.json().catch(() => ({}))) as {
      maintenance?: boolean;
      message?: string;
      hours?: number;
    };

    if (typeof body.maintenance === 'boolean') {
      if (!isAdmin) return json({ error: 'غير مصرّح' }, 403);

      // و`until` تُحسب هنا لا في المتصفّح: ساعةُ الهاتف قد تكون مضبوطةً خطأً،
      // وهي التي تُطفئ الصيانةَ وحدَها إن تعذّر إطفاؤها بيد.
      const hours = Math.min(Math.max(body.hours ?? 2, 1), 24);
      const status = {
        maintenance: body.maintenance,
        until: body.maintenance ? new Date(Date.now() + hours * 3600_000).toISOString() : '',
        message: (body.message ?? '').slice(0, 300),
      };

      const PATH = 'public/status.json';
      const gh = (extra: RequestInit = {}) => ({
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'muhta-rebuild',
        },
        ...extra,
      });

      // GitHub يطلب sha الملفّ القائم وإلّا ردّ 409 — والملفُّ مشحونٌ دائماً.
      const cur = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${PATH}`,
        gh()
      );
      if (!cur.ok) return json({ error: `GitHub ${cur.status}: ${await cur.text()}` }, 502);
      const { sha } = (await cur.json()) as { sha: string };

      const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'muhta-rebuild',
        },
        body: JSON.stringify({
          message: body.maintenance ? 'صيانة: إيقاف مؤقّت' : 'صيانة: عودة',
          content: encodeBase64(new TextEncoder().encode(JSON.stringify(status, null, 2) + '
')),
          sha,
        }),
      });
      if (!put.ok) return json({ error: `GitHub ${put.status}: ${await put.text()}` }, 502);

      // الإيداعُ نفسُه يُطلق النشر، فلا حاجةَ إلى repository_dispatch.
      return json({ ok: true, until: status.until });
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'muhta-rebuild',
      },
      body: JSON.stringify({ event_type: 'stations-changed' }),
    });

    // 204 is the documented success; anything else is worth surfacing so the
    // admin knows the link will stay dead until someone pushes.
    if (res.status !== 204) {
      return json({ error: `GitHub ${res.status}: ${await res.text()}` }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
