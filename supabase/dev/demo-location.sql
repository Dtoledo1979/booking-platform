-- Dev-only fixture: an active "Demo Studio" location with two professionals,
-- three services and a full week of hours, for previewing the public booking
-- pages without going through Stripe. Owned by a placeholder user that
-- cannot sign in. Remove with demo-location-cleanup.sql.
--   supabase db query --linked -f supabase/dev/demo-location.sql
begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('d0000000-0000-4000-8000-000000000001', 'demo-owner@example.invalid', '{"first_name":"Demo"}');

insert into public.organizations (id, name, owner_user_id)
values ('d0000000-0000-4000-8000-000000000002', 'Demo Studio Ltd', 'd0000000-0000-4000-8000-000000000001');

insert into public.memberships (organization_id, user_id, role, accepted_at)
values ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'owner', now());

insert into public.locations (
  id, organization_id, slug, name, description, status, phone, email,
  address_line, suburb, city, postcode, min_notice_minutes
) values (
  'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'demo-studio',
  'Demo Studio', 'Cuts, fades and nails in a calm, light-filled space. Walk-ins welcome when we can.',
  'active', '09 123 4567', 'hello@example.invalid',
  '12 Ponsonby Road', 'Ponsonby', 'Auckland', '1011', 60
);

insert into public.staff (id, location_id, display_name, bio, sort_order) values
  ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000003', 'Mia', 'Colour & cuts', 0),
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000003', 'Rangi', 'Fades & beard work', 1);

insert into public.services (id, location_id, name, duration_minutes, price_cents, sort_order) values
  ('d0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000003', 'Skin fade', 45, 5500, 0),
  ('d0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003', 'Cut & blow-dry', 60, 8500, 1),
  ('d0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000003', 'Gel manicure', 60, 7000, 2);

insert into public.staff_services (staff_id, service_id, location_id) values
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000003');

insert into public.staff_working_hours (staff_id, location_id, weekday, starts_at, ends_at)
select s, 'd0000000-0000-4000-8000-000000000003', wd, '09:00', '17:00'
from unnest(array['d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000011']::uuid[]) s,
     generate_series(1, 6) wd;

insert into public.location_opening_hours (location_id, weekday, opens_at, closes_at)
select 'd0000000-0000-4000-8000-000000000003', wd, '09:00', '17:00' from generate_series(1, 6) wd;

commit;
