-- محطة غير مسجّلة أعلنّا عنها — وتُنسى بعد دقيقة.
--
-- الإدارة تُعلن عن وقود في محطات لم تنضمّ بعد، فيصل الخبر إشعاراً ثم يختفي:
-- من فتح هاتفه بعد ساعة لا يجد له أثراً، ومن أراد التأكّد لا يجد أحداً يسأله.
-- والاسم اليوم مدفونٌ في نصّ الإشعار لا في عمود، فلا يمكن عرضه ولا تتبّعه.
--
-- فيُحفظ ما تعرفه الإدارة وقت الإنشاء، ويُعرض في لوحة حمراء طوال اليوم — حمراء
-- لأن ما نعرفه عنها ناقص بطبيعته: لا نعلم متى نفد، ولا الازدحام، ولا الدوام.
-- والناس هم من يُغلقها: أربعة يقولون «نفد» فتختفي.
--
-- والقصد أبعد من العرض. محطةٌ ترى اسمها في لوحة حمراء بينما جاراتها المسجّلة
-- في الأخضر ببياناتها الكاملة، تجد في التسجيل مصلحةً لا منّةً — وهو ما يجعل
-- البيانات تُحدَّث بلا أن نطارد أحداً.
begin;

-- ما تعرفه الإدارة وقت الإعلان: أي محطة، وفي أي مدينة هي فعلاً.
--
-- وcities عمودٌ آخر ومعناه مختلف: جمهور الإشعار، ويشمل مدناً مجاورة. فمحطة
-- الرمادي أُعلنت لستّ مدن — وموقعها الرمادي وحدها.
alter table announcements
  add column if not exists station_name text,
  add column if not exists origin_city  text;

comment on column announcements.station_name is
  'اسم المحطة غير المسجّلة. null للإعلانات العامة التي لا تخصّ محطة.';

-- صوتٌ واحد لكل جهاز على كل إعلان، قابل للتبديل.
--
-- والمفتاح مركّب لا فريد على الجهاز وحده: من صوّت «نفد» ثم رأى الوقود عاد
-- يستطيع تصحيح صوته، ولا يستطيع مضاعفته.
create table if not exists announcement_votes (
  announcement_id uuid not null references announcements(id) on delete cascade,
  device_id       text not null,
  verdict         text not null check (verdict in ('yes', 'no')),
  created_at      timestamptz not null default now(),
  primary key (announcement_id, device_id)
);

create index if not exists announcement_votes_ann_idx on announcement_votes (announcement_id);

alter table announcement_votes enable row level security;
-- لا سياسة إدراج: التصويت يمرّ بالدالة أدناه وحدها، وإلا أدرج حاملُ المفتاح
-- المنشور ألف صوت بأمر curl واحد — وهو ما وقع في traffic_votes قبل تشديدها.

-- ما يُعرض للناس، بأصواته.
--
-- ويُخفى حين يقول أربعةٌ «نفد» — وحين يكونون أكثر ممّن قال «ما زال». الشرط
-- الثاني ليس زينة: بلا مقارنة يكفي أربعة غاضبين لإسقاط خبرٍ أكّده عشرون، وهو
-- باب التلاعب نفسه الذي أُغلق في تقييم الازدحام.
create or replace function public.open_announcements()
returns table(
  id           uuid,
  station_name text,
  origin_city  text,
  product      text,
  cities       text[],
  send_at      timestamptz,
  yes_votes    int,
  no_votes     int
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.station_name, a.origin_city, a.product, a.cities, a.send_at,
         coalesce(v.yes, 0)::int, coalesce(v.no, 0)::int
    from announcements a
    left join lateral (
      select count(*) filter (where verdict = 'yes') yes,
             count(*) filter (where verdict = 'no')  no
        from announcement_votes w
       where w.announcement_id = a.id
    ) v on true
   where a.active
     and a.station_name is not null
     and a.sent_at is not null
     -- طوال اليوم بتوقيت بغداد، لا أربعاً وعشرين ساعة زاحفة: خبر السابعة صباحاً
     -- ينتهي بانتهاء يومه، لا في السابعة من صباح الغد.
     and (a.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and not (coalesce(v.no, 0) >= 4 and coalesce(v.no, 0) > coalesce(v.yes, 0))
     -- ومحطةٌ سجّلت بعد إعلانها تخرج من اللوحة الحمراء فوراً.
     --
     -- بركة الرحمن أُعلنت وهي غير مسجّلة، ثم انضمّت. وإبقاؤها في لوحة «غير
     -- مسجّلة» يُسيء إليها ويُكذّب المنصّة في آن. والمطابقة فضفاضة عمداً:
     -- الأسماء تُكتب بصياغات مختلفة، والخطأ المقبول هنا أن نُسقط صفّاً لا أن
     -- نتّهم محطةً مسجّلة.
     and not exists (
       select 1 from stations st
        where st.status = 'approved'
          and (a.station_name ilike '%' || st.name || '%'
               or st.name ilike '%' || a.station_name || '%')
     )
   order by a.sent_at desc;
$$;

revoke all on function public.open_announcements() from public;
grant execute on function public.open_announcements() to anon, authenticated;

-- التصويت.
create or replace function public.vote_announcement(
  p_id      uuid,
  p_device  text,
  p_verdict text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_verdict not in ('yes', 'no') then
    raise exception 'bad verdict' using errcode = '22023';
  end if;
  if length(coalesce(p_device, '')) < 8 then
    raise exception 'bad device' using errcode = '22023';
  end if;
  -- ولا يُصوَّت إلا على خبر اليوم القائم: تصويتٌ على إعلان قديم لا معنى له،
  -- وفتحُ الباب له يسمح بحشو الجدول بأصوات على صفوف لا تُعرض.
  if not exists (
    select 1 from announcements a
     where a.id = p_id and a.active and a.station_name is not null
       and (a.sent_at at time zone 'Asia/Baghdad')::date
           = (now() at time zone 'Asia/Baghdad')::date
  ) then
    raise exception 'no announcement' using errcode = '42704';
  end if;

  insert into announcement_votes (announcement_id, device_id, verdict)
  values (p_id, p_device, p_verdict)
  on conflict (announcement_id, device_id) do update
     set verdict = excluded.verdict, created_at = now();
end
$fn$;

revoke all on function public.vote_announcement(uuid, text, text) from public;
grant execute on function public.vote_announcement(uuid, text, text) to anon, authenticated;

commit;
