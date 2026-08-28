-- محادثةٌ بين الإدارة وصاحب المحطة.
--
-- ── لماذا جدولٌ واحد بلا خيوط ────────────────────────────────────────────
--
-- للمحطة مالكٌ واحد (stations.owner_id)، فلها مجرًى واحد. و station_id هو
-- المجرى نفسُه. وجدولُ threads يحمل عموداً لا تحمله stations أصلاً، ويزيد
-- ضمّةً على كل استعلام.
--
-- ── ولماذا هذا أسهل من واتساب ───────────────────────────────────────────
--
-- ليس لأنه أسرع — بل لأن الرسالة تصل ومعها اسمُ المحطة ومدينتُها وحالُها
-- وتاريخُ ما قيل لها. والإدارةُ ترى قبل أن تكتب ماذا قال لها النظامُ هذا
-- الصباح. ورقمٌ غريبٌ في قائمةٍ طويلة لا يحمل شيئاً من ذلك.

create table if not exists public.station_messages (
  id         uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,

  -- ثلاثيٌّ لا منطقيّ، لأن الفرق يُغيّر سلوكاً لا لوناً: زرُّ واتساب لا يظهر
  -- على تذكيرٍ آليٍّ لم يُجَب — سكوتُ المالك عن الآليّ هو الحال الطبيعية،
  -- وملاحقتُه عليه إزعاجٌ بلا سبب.
  sender     text not null check (sender in ('admin','owner','system')),
  body       text not null check (btrim(body) <> '' and length(body) <= 2000),

  -- نوعُ التذكير بلغة owner_pings.kind، وللآليّ وحده
  kind       text,

  -- ختمُ قراءة الطرف المقابل. عمودٌ واحد لا اثنان: لكلِّ رسالةٍ مستلمٌ واحد
  -- يُعرف من كاتبها — ما كتبه المالك تقرؤه الإدارة، وما كتبته الإدارةُ أو
  -- المنصّة يقرؤه المالك. فعمودان نصفُهما فارغٌ في كل صفّ، ويحتاج كلُّ عدٍّ
  -- أن يعرف أيَّهما يقرأ.
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint station_messages_kind_is_system
    check ((kind is not null) = (sender = 'system'))
);

create index if not exists station_messages_thread_idx
  on public.station_messages (station_id, created_at);

-- جزئيٌّ صغير يخدم الطرفين: ما لم يُقرأ هو وحده ما يُعَدّ
create index if not exists station_messages_unread_idx
  on public.station_messages (station_id) where read_at is null;


-- ── الصلاحيات ────────────────────────────────────────────────────────────
--
-- **والانتحالُ يُمنع بالبنية لا بحارسٍ يُنسى.**

alter table public.station_messages enable row level security;

revoke all on public.station_messages from anon, authenticated;
grant select, insert on public.station_messages to authenticated;

-- وامتيازُ التحديث على عمودٍ واحد. RLS لا تحدّ الأعمدة، وامتيازُ العمود يفعل:
-- فمن يختم القراءة لا يملك تعديلَ نصٍّ ولا نقلَ رسالةٍ إلى مجرًى آخر —
-- والسياسةُ تحته لا تحرس ما لا يُمنَح أصلاً.
grant update (read_at) on public.station_messages to authenticated;

-- القراءة: المالك مجراه، والإدارة الكلّ — سياسةٌ مستقلّة تُضاف لا شرطٌ
-- يُحشر في الأولى، على نمط schema.sql:148-150
drop policy if exists "station_messages: owner reads own" on public.station_messages;
create policy "station_messages: owner reads own" on public.station_messages
for select using (
  exists (select 1 from stations s where s.id = station_id and s.owner_id = auth.uid())
);

drop policy if exists "station_messages: admin reads all" on public.station_messages;
create policy "station_messages: admin reads all" on public.station_messages
for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- الكتابة: كلٌّ باسمه. و sender='system' لا سياسةَ تقبلها إطلاقاً — فلا
-- يكتبها إلا service_role الذي يتجاوز RLS، أي owner-daily وحدها.
--
-- و read_at is null مثبَّتة: صفٌّ يُولد «مقروءاً» يسقط من عدّاد الطرف الآخر
-- قبل أن يراه.
drop policy if exists "station_messages: owner writes own" on public.station_messages;
create policy "station_messages: owner writes own" on public.station_messages
for insert with check (
  sender = 'owner' and kind is null and read_at is null
  and exists (select 1 from stations s where s.id = station_id and s.owner_id = auth.uid())
);

drop policy if exists "station_messages: admin writes any" on public.station_messages;
create policy "station_messages: admin writes any" on public.station_messages
for insert with check (
  sender = 'admin' and kind is null and read_at is null
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ختمُ القراءة: كلٌّ يختم ما وصله لا ما كتبه. و USING تكفي عن WITH CHECK لأن
-- العمودين اللذين تفحصهما (sender, station_id) غير ممنوحَين للتحديث أصلاً.
drop policy if exists "station_messages: owner marks read" on public.station_messages;
create policy "station_messages: owner marks read" on public.station_messages
for update using (
  sender <> 'owner'
  and exists (select 1 from stations s where s.id = station_id and s.owner_id = auth.uid())
);

drop policy if exists "station_messages: admin marks read" on public.station_messages;
create policy "station_messages: admin marks read" on public.station_messages
for update using (
  sender = 'owner'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ولا حذفَ: لا امتيازَ ولا سياسة. المجرى سِجلّ.

comment on table public.station_messages is
  'محادثةُ الإدارة وصاحب المحطة. صفٌّ لكل رسالة، و station_id هو المجرى.';


-- ── غير المقروء عند الإدارة ──────────────────────────────────────────────
--
-- المالكُ يعدّ في متصفّحه (صفوفُ مجراه قليلة)، والإدارةُ تحتاج العدَّ لكل
-- المحطات دفعةً — فمنظور.
--
-- والعدُّ في القاعدة لا في JS: سقفُ PostgREST عند ألف صفٍّ حوّل ٦١٩ متابعاً
-- إلى ١٧٥ في owner-daily، وحوّل قياسَ الوصول من ٢٢ محطةً إلى ٣.

create or replace view public.station_unread
with (security_invoker = true) as
select station_id,
       count(*)::int   as unread,
       max(created_at) as last_at
  from public.station_messages
 where sender = 'owner' and read_at is null
 group by station_id;

comment on view public.station_unread is
  'ما لم تقرأه الإدارةُ من كل محطة. security_invoker فتُبقي RLS على القاعدة.';

grant select on public.station_unread to authenticated;


-- ── البثّ الحيّ ──────────────────────────────────────────────────────────
--
-- لا `alter publication` في هذا المستودع إطلاقاً: كلُّ الجداول السابقة
-- فُعِّلت من لوحة Supabase. وخطوةٌ يدويّة لا تُكتب هي خطوةٌ تُنسى — وبدونها
-- يعمل الطرفان ولا يصل شيءٌ حيّاً، فيُقرأ ذلك «لم يردّ».
do $$
begin
  execute 'alter publication supabase_realtime add table public.station_messages';
exception
  when duplicate_object then null;   -- مُضافٌ سلفاً
  when undefined_object then null;   -- لا منشورَ بهذا الاسم — يُفعَّل من اللوحة
  when insufficient_privilege then null;  -- المنشورُ ليس ملكَ هذا الدور
end $$;
