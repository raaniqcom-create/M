-- «محطة» تُكتب مرّةً في المُشغّل، لا في كلّ شاشة.
--
-- ── ما وُجد ─────────────────────────────────────────────────────────────
--
-- عشرٌ من ثمانٍ وثلاثين محطةً معتمدةً لا يحوي اسمُها كلمةَ «محطة»:
--
--   القاسم · الفارس العربي · ساسكو · الهضاب مشيده · الحق · نور الحياة
--   علوش المشيده · المسرة · ذراع دجلة · اسوار القائم
--
-- فيقرأ المواطنُ في الإشعار «المسرة» ولا يعرف أهي محطةٌ أم حيّ. والسببُ أنّ
-- نموذجَ التسجيل يطلب اسمَ المحطة ولا يفرض الكلمة، فبعضُهم كتبها وبعضُهم لا.
--
-- ── ولماذا في المُشغّل لا في العرض ──────────────────────────────────────
--
-- دالّةُ عرضٍ كانت ستُصلح البطاقةَ وتنسى الإشعارَ ورسالةَ واتساب وبوتَ
-- تلغرام والتقريرَ المطبوع — خمسةُ أسطحٍ تقرأ `stations.name` مباشرة. وفي
-- `lib/announceTemplates.ts` دالّةُ `named()` تفعل هذا للإشعار وحدَه سلفاً،
-- وهي شاهدُ أنّ الإصلاحَ في العرض يُنسَخ ولا يعمّ.
--
-- والمُشغّلُ `stations_guard_trg` يمرّ به كلُّ إدراجٍ وكلُّ تحديث، أيّاً كان
-- المُدرِج — نموذجُ المالك، ونموذجُ الإدارة، والدوالُّ الطرفيّة. فهو الموضعُ
-- الوحيد الذي لا يُنسى.
--
-- والاختبارُ «يحوي» لا «يبدأ بـ»: «محطة وقود الراشدية» و«محطه جوهره الفلوجه»
-- كلتاهما فيها الكلمة بإملاءين، ولا تُزاد عليهما. ولذلك `محط[ةه]`.
--
-- ولا تتغيّر الروابطُ المختصرة: `station_slug` تُسقط كلَّ ما ليس لاتينيّاً
-- (schema.sql:308) فتردّ للأسماء العربية رمزاً مشتقّاً من المعرّف — فالاسمُ
-- لا يدخل في الرابط أصلاً. ثمّ إنّ الرابط لا يُولَّد إلا حين يكون فارغاً.

CREATE OR REPLACE FUNCTION public.stations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  candidate text;
  n int := 0;
begin
  -- اسمٌ بلا كلمة «محطة» يُقرأ حيّاً أو شارعاً حين يصل في إشعار. والقصُّ
  -- معه: صفٌّ في الإنتاج اسمُه «محطة اسوار القائم المشيدة » بفراغٍ لاحق.
  new.name := btrim(new.name);
  if new.name <> '' and new.name !~ 'محط[ةه]' then
    new.name := 'محطة ' || new.name;
  end if;

  -- Every insert passes here, whoever makes it, so this is the one place a
  -- missing slug can be caught for good.
  if new.slug is null or btrim(new.slug) = '' then
    candidate := station_slug(new.name, new.id);
    -- these static routes resolve before the /[slug] catch-all, so a station
    -- claiming one would own a link that never opens
    while candidate in ('login','register','owner','admin','station','offline','api',
                        'icons','ads','alerts','download','privacy','subscribe',
                        'reset','test-push','about','news','road','branch','sounds',
                        'manifest.json','sw.js')
          or exists (select 1 from stations s where s.slug = candidate and s.id <> new.id)
    loop
      n := n + 1;
      candidate := station_slug(new.name, new.id) || '-' || n::text;
    end loop;
    new.slug := candidate;
  end if;

  -- service-role callers (edge functions) and admins are trusted
  if auth.uid() is null
     or exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $function$;


-- والقائمُ يُصحَّح مرّةً. والمُشغّلُ نفسُه يحرس التحديثَ من التكرار: بعده
-- يحوي الاسمُ الكلمةَ، فلا يُزاد ثانيةً مهما أُعيد تشغيلُ الهجرة.
update stations
   set name = name
 where name !~ 'محط[ةه]'
    or name <> btrim(name);
