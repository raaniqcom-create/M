-- نزعُ الإدراج المباشر في traffic_votes — الخطوةُ التي وُعد بها ولم تُكتب.
--
-- 20260819b قالت في رأسها: «كل ما هنا إضافي: لا يُنزع امتياز… النزع في
-- 20260819c». و20260819c لم تمسّ traffic_votes، ولا 20260819d بعدها. وبقي في
-- schema.sql:160 «for insert with check (true)» ومنحُ INSERT الافتراضيّ لدور
-- anon — فكلُّ حراسات cast_traffic_vote (الجهاز، والموقع، والدوام، ونافذةُ
-- الثلاثين دقيقة) تُتجاوَز بطلبٍ واحد إلى PostgREST بلا شيءٍ منها.
--
-- وقِيس حيّاً قبل هذه الهجرة (2026-09-03): إدراجُ anon بمعرّف محطةٍ وهميّ ردّ
-- 23503 — قيدَ المفتاح الأجنبيّ — لا 42501. أي أن السياسة أذنت، والقيدُ
-- وحدَه هو الذي منع. فالبابُ مفتوح.
--
-- cast_traffic_vote دالّةٌ security definer (20260819b:48) فلا يضيرها النزع:
-- تبقى البابَ الوحيد، على نمط تشديد push_subscriptions وdevice_tokens.

drop policy if exists "traffic_votes: public insert" on public.traffic_votes;
revoke insert, update, delete on public.traffic_votes from anon, authenticated;

comment on table public.traffic_votes is
  'أصواتُ الازدحام. لا إدراجَ مباشراً — cast_traffic_vote وحدَها، وهي التي تحرس الجهازَ والموقعَ والدوام.';
