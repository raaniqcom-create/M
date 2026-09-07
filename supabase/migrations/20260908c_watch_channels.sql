-- رصدُ القنوات: تُقرأ صفحاتُها العامّة، ويُعرض ما فيها على الإدارة — ولا يُنشر
-- شيءٌ بلا ضغطة.
--
-- ── الإذنُ الذي يقوم عليه هذا كلُّه ──────────────────────────────────────
--
-- صاحبُ القناة رفض إدخالَ البوت مشرفاً — وله الحقّ — وقال لصاحب المنصّة
-- صراحةً إنّ له أن ينشر كلَّ ما ينشره، وإنّ نشرَه صدقةٌ جارية عن روح والده.
-- فالقراءةُ من الصفحة العامّة بإذنٍ مقولٍ لا باستباحة، والمصدرُ لا يُسمّى في
-- شيءٍ يراه الجمهور (قرارُ صاحب المنصّة).
--
-- ── ولماذا جدولان لا واحد ───────────────────────────────────────────────
--
-- `watch_channels` قائمةُ ما يُرصَد — وقد طلب صاحبُ المنصّة أن تتّسع: «توجد
-- لكلّ مدينةٍ قناة». فإضافةُ قناةٍ صفٌّ لا نشرةُ شيفرة.
--
-- و`channel_posts` سجلُّ ما قُرئ. وهو ليس ترفاً: بلا علامةِ «رأيتُ هذا» تُعاد
-- المقترحاتُ كلَّ عشر دقائق، فتمتلئ محادثةُ الإدارة بالجدول نفسِه أربعَ عشرةَ
-- مرّةً في الساعة. ويُفيد ثانياً بأنّه يجيب لاحقاً: كم منشوراً وصل، وكم منها
-- كان جدولاً، وكم نُشر.

create table if not exists public.watch_channels (
  -- المعرّفُ في الرابط: t.me/s/<slug>
  slug text primary key,
  title text not null,
  active boolean not null default true,
  added_at timestamptz not null default now()
);

alter table public.watch_channels enable row level security;
revoke all on public.watch_channels from anon, authenticated;

comment on table public.watch_channels is
  'قنواتٌ عامّةٌ تُقرأ صفحاتُها بحثاً عن جداول وصول الوقود. الإضافةُ صفٌّ، والإيقافُ active=false.';

insert into public.watch_channels (slug, title)
values ('Benzene_ramadi', 'محطات البنزين المحسن — الرمادي')
on conflict (slug) do nothing;


create table if not exists public.channel_posts (
  -- «Benzene_ramadi/70» — معرّفُ المنشور كما تكتبه تلغرام، فريدٌ بطبعه.
  id text primary key,
  channel text not null references public.watch_channels(slug) on delete cascade,
  posted_at timestamptz,
  body text not null,

  -- seen      قُرئ ولم يُعرض بعد
  -- ignored   قُرئ وليس جدولاً
  -- proposed  عُرض على الإدارة وينتظر ضغطتها
  -- published نُشر
  state text not null default 'seen',
  seen_at timestamptz not null default now(),
  acted_at timestamptz
);

create index if not exists channel_posts_state_idx on public.channel_posts (state, posted_at);

alter table public.channel_posts enable row level security;
revoke all on public.channel_posts from anon, authenticated;

comment on table public.channel_posts is
  'كلُّ منشورٍ قُرئ من قناةٍ مرصودة، وما صار إليه. علامةُ «رأيتُ هذا» تمنع إعادةَ العرض كلَّ عشر دقائق.';
