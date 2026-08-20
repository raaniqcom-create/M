-- «حالة النظام جامدة على أعداد قديمة».
--
-- ولم تكن جامدة، بل مقيَّدة. دالة health كانت تجلب الصفوف ثم تعدّها في الذاكرة:
--
--   db.from('alerts').select('address')          → subscribers = new Set(...).size
--   db.from('device_tokens').select('platform')  → devices = data.length
--
-- وواجهة PostgREST تقصّ الردّ عند ألف صفّ افتراضياً. فجدول alerts فيه ٥١١٧
-- صفّاً، والعدّ يقع على أوّل ١٩٪ منها: ٣٣٢ بدل ١٠٤٥. والأجهزة أسوأ — تُعرض
-- ١٠٠٠ بالضبط مهما بلغت، فالرقم عالقٌ عند السقف لا يتحرّك أبداً.
--
-- ولهذا بدا زرّ «إعادة الفحص» معطّلاً: يعمل في كل ضغطة، ويعود بالرقم المقيَّد
-- نفسه. عطلٌ يبدو جموداً.
--
-- وهذه ثالث مرة يضرب فيها هذا السقف نفس المشروع: قبله معاينة الإدارة، ثم
-- رسائل الملّاك (١٧٥ بدل ٦١٩). والقاعدة المستفادة أن العدّ لا يُكتب في JS
-- أبداً — يُكتب حيث تعيش الصفوف.
--
-- ودالةٌ لا استعلام: alerts لا تمنح SELECT لأحد لأن صفوفها عناوين دفع. فيخرج
-- العدد مجمّعاً ولا يخرج عنوان واحد.
begin;

create or replace function public.health_counts()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'stations',    (select count(*) from stations where status = 'approved'),
    'subscribers', (select count(distinct address) from alerts),
    'devices',     (select count(*) from device_tokens)
  );
$$;

revoke all on function public.health_counts() from public;
grant execute on function public.health_counts() to service_role;

commit;
