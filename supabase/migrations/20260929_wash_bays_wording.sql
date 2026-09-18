-- «غسيل»: «المسارب» تصير «الخانات» — في رسالة add_walk_in الحيّة.
--
-- صاحبُ المنصّة: «الدوام والخانات… عدد الخانات | كم خانة». الواجهةُ بُدّلت في مكانها،
-- وبقي نصُّ الخطأ داخل add_walk_in تعرضه اللوحةُ كما يصل من القاعدة.
-- نُبدّل النصَّ داخل التعريف الحيّ بأسلوب 20260925 (pg_get_functiondef → replace → execute)
-- كي لا تُمحى قائمةُ الأحجام التي زُرعت فيه هناك.
-- التراجع: الاستبدالُ المعاكس بالأسلوب نفسِه.
begin;

do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'add_walk_in';
  if src is null then raise exception 'add_walk_in غائبة'; end if;
  newsrc := replace(src, 'المساربُ مشغولةٌ في هذا الوقت', 'الخاناتُ مشغولةٌ في هذا الوقت');
  if newsrc = src then
    raise notice 'نصُّ add_walk_in غيرُ موجودٍ كما هو — لعلّه بُدّل سلفاً';
  else
    execute newsrc;
  end if;
end $$;

do $$ begin
  assert (select count(*) from pg_proc where proname = 'add_walk_in') = 1, 'add_walk_in مكرّرة';
  assert (select prosrc from pg_proc where proname = 'add_walk_in') like '%الخاناتُ مشغولةٌ في هذا الوقت%', 'add_walk_in بالنصّ القديم';
  -- وقائمةُ الأحجام من 20260925 ما زالت في مكانها
  assert (select prosrc from pg_proc where proname = 'add_walk_in') like '%''small''%', 'ضاعت قائمةُ الأحجام';
end $$;
commit;
