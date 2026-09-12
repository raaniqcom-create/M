-- «أضف عدّاداً للمشاهدات على الحالات» — صاحبُ المنصّة، ١٢ أيلول ٢٠٢٦.
--
-- حالةُ المحطة قصّةٌ تُفتح كإنستغرام؛ وعدّادُها يُحصى لكلّ (حالة، نسخة):
-- النسخةُ هي `at` — آخرُ تأكيدٍ من صاحبها — فتحديثُ الحالة قصّةٌ جديدة
-- بعدّادٍ جديد. والجهازُ يُحصى مرّةً لكلّ نسخة: القارئُ يمرّر `p_new` من
-- «رُئيت» المحلّيّة (lib/stories.ts) — كافٍ لعدّادٍ يُقرأ بالعين، لا للمحاسبة.
--
-- الجدولُ لا يُقرأ ولا يُكتب مباشرةً؛ بابُه الدالّةُ وحدَها، تزيد وتُعيد الرقم.
begin;

create table if not exists public.story_views (
  story_id text        not null,
  at       timestamptz not null,
  views    integer     not null default 0,
  primary key (story_id, at)
);

alter table public.story_views enable row level security;
revoke all on public.story_views from anon, authenticated;

comment on table public.story_views is
  'مشاهداتُ الحالات: (حالة، نسخة) → عدد. story_id معرّفُ المحطة أو «muhta-news».';

create or replace function public.story_view(p_story text, p_at timestamptz, p_new boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_new then
    insert into public.story_views (story_id, at, views)
    values (p_story, p_at, 1)
    on conflict (story_id, at) do update set views = story_views.views + 1
    returning views into n;
  else
    select views into n from public.story_views where story_id = p_story and at = p_at;
  end if;
  return coalesce(n, 0);
end;
$$;

grant execute on function public.story_view(text, timestamptz, boolean) to anon, authenticated;

-- نسخٌ قديمةٌ لا تعود تُفتح: ما مضى عليه ثلاثةُ أيّام يُمسح مع دورة الليل.
create or replace function public.prune_story_views()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.story_views where at < now() - interval '3 days' returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function public.prune_story_views() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'prune-story-views';
select cron.schedule('prune-story-views', '15 21 * * *', $$select public.prune_story_views()$$);

commit;
