-- تصويت على منتجٍ نفد لا يصف الساحة بعد نفاده.
--
-- الطابور سببه منتج. فإن نفد المنتج انفضّ الطابور — لا يبقى الناس واقفين على
-- مضخة فارغة. لكن التصويتات تعيش ثلاثين دقيقة، فكانت المحطة تُعرض «مزدحمة»
-- نصف ساعة بعد أن زال سبب الزحام، فتصرف عنها من كان سيجد العادي فارغاً.
--
-- فالتصويت يُحتسب ما دام منتجه معروضاً للبيع. وتصويت «الساحة كلها»
-- (product is null) يُحتسب دائماً: صاحبه لم ينسبه إلى مضخة بعينها.

create or replace view public.station_traffic_avg as
select
  v.station_id,
  count(*) filter (where v.level = 'green')  as green_votes,
  count(*) filter (where v.level = 'yellow') as yellow_votes,
  count(*) filter (where v.level = 'red')    as red_votes,
  count(*)                                   as total_votes,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level,
  max(v.created_at) as last_vote_at
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and (
    v.product is null
    or exists (
      select 1 from station_products sp
       where sp.station_id = v.station_id
         and sp.product    = v.product
         and sp.is_available
    )
  )
group by v.station_id;

-- والقائمة لكل منتج بالقاعدة نفسها، فلا تعرض طابوراً على مضخة أُغلقت
create or replace view public.station_product_traffic as
select
  v.station_id,
  v.product,
  count(*)          as total_votes,
  max(v.created_at) as last_vote_at,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and v.product is not null
  and exists (
    select 1 from station_products sp
     where sp.station_id = v.station_id
       and sp.product    = v.product
       and sp.is_available
  )
group by v.station_id, v.product;
