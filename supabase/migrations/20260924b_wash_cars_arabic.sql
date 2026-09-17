-- رسالتا العدد في book_wash_group تعدّان بالعربيّة: «سيّارتان» لا «2 سيّارة»، و«5 سيارات» لا «5 سيّارة».
--
-- العربيّةُ تعدّ على أربعة وجوه (واحد، اثنان، ٣–١٠، ١١ فأكثر) — وهي القاعدةُ نفسُها في
-- lib/freshness.ts `plural` وlib/wash.ts `carsLabel` على العميل. الرسالتان تخرجان من
-- القاعدة نصّاً جاهزاً للعرض، فتلزمهما المطابقةُ ذاتُها وإلّا قرأ الزبونُ «5 سيّارة».
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- دالّةُ نصٍّ صرفةٌ وإعادةُ إنشاء book_wash_group بنصَّين مصحَّحين — لا منطقَ آخر يتغيّر.
-- التراجع: إعادةُ book_wash_group من 20260924_wash_cars.sql؛ drop function wash_cars_ar(int).
begin;

/** «سيّارة واحدة» / «سيّارتان» / «5 سيارات» / «12 سيّارة». */
create or replace function public.wash_cars_ar(n integer)
returns text language sql immutable set search_path = public as $$
  select case
    when n = 1 then 'سيّارة واحدة'
    when n = 2 then 'سيّارتان'
    when n between 3 and 10 then n::text || ' سيارات'
    else n::text || ' سيّارة'
  end;
$$;
revoke all on function public.wash_cars_ar(integer) from public;
grant execute on function public.wash_cars_ar(integer) to anon, authenticated, service_role;

do $$
declare src text;
begin
  select prosrc into src from pg_proc where proname = 'book_wash_group';
  if src is null then raise exception 'book_wash_group غائبة — طبّق 20260924 أوّلاً'; end if;
end $$;

-- النصّان وحدَهما يتغيّران؛ الباقي كما هو في 20260924.
do $$
declare src text; newsrc text; args text;
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'book_wash_group';
  newsrc := replace(src,
    'raise exception ''أقصى عددٍ في الطلب الواحد % سيّارة'', cap;',
    'raise exception ''أقصى عددٍ في الطلب الواحد %'', wash_cars_ar(cap);');
  newsrc := replace(newsrc,
    'raise exception ''المتاح في هذا الموعد % سيّارة فقط — اختر موعداً آخر أو قلّل العدد'', free_n;',
    'raise exception ''المتاح في هذا الموعد % فقط — اختر موعداً آخر أو قلّل العدد'', wash_cars_ar(free_n);');
  if newsrc = src then
    raise notice 'النصّان غيرُ موجودَين كما هما — لعلّهما صُحّحا سلفاً';
  else
    execute newsrc;
  end if;
end $$;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'wash_cars_ar') = 1, 'wash_cars_ar غائبة';
  assert public.wash_cars_ar(1) = 'سيّارة واحدة', '1';
  assert public.wash_cars_ar(2) = 'سيّارتان', '2';
  assert public.wash_cars_ar(5) = '5 سيارات', '5';
  assert public.wash_cars_ar(12) = '12 سيّارة', '12';
  assert (select count(*) from pg_proc where proname = 'book_wash_group') = 1, 'book_wash_group مكرّرة';
  assert (select prosrc from pg_proc where proname = 'book_wash_group') like '%wash_cars_ar%', 'النصّان لم يُصحّحا';
end $$;

commit;
