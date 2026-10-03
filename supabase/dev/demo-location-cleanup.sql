-- Removes the dev-only Demo Studio fixture (and anything booked there).
--   supabase db query --linked -f supabase/dev/demo-location-cleanup.sql
begin;
delete from public.appointments where location_id = 'd0000000-0000-4000-8000-000000000003';
delete from public.location_clients where location_id = 'd0000000-0000-4000-8000-000000000003';
delete from public.organizations where id = 'd0000000-0000-4000-8000-000000000002';
delete from auth.users where id = 'd0000000-0000-4000-8000-000000000001';
commit;
