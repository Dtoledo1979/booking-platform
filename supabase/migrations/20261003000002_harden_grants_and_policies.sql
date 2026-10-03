-- ============================================================
-- Hardening after the first advisor run:
--
-- 1. Function EXECUTE. Postgres grants EXECUTE to PUBLIC on every new
--    function, and a schema-scoped ALTER DEFAULT PRIVILEGES can only add
--    privileges, not remove that global default. So the revoke in the
--    previous migration had no effect on functions. Fix it globally for
--    future functions and explicitly for the existing ones.
--
-- 2. One permissive policy per table/role/action. Several SELECT policies
--    (and "for all" write policies, which also apply to SELECT) were
--    evaluated on every read. Reads are now a single OR-ed policy and
--    writes are split into insert/update/delete.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Function privileges
-- ------------------------------------------------------------
alter default privileges for role postgres revoke execute on functions from public;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Policies call these helpers as the querying role, so API roles need them.
-- They return false for anonymous callers and only answer "does the
-- current user hold role X here", so exposing them leaks nothing.
grant execute on function
  private.is_org_member(uuid),
  private.is_org_owner(uuid),
  private.has_location_role(uuid, public.member_role[]),
  private.is_location_member(uuid),
  private.is_location_public(uuid),
  private.is_own_staff(uuid)
to anon, authenticated;

-- Onboarding requires a signed-in user.
grant execute on function public.create_organization(text, text, text, text, boolean) to authenticated;

-- Trigger functions (set_updated_at, validate_timezone, handle_new_user)
-- need no grants: triggers don't check EXECUTE when they fire.

-- ------------------------------------------------------------
-- 2. Policies
-- ------------------------------------------------------------

-- locations
drop policy "public reads active locations" on public.locations;
drop policy "members read their locations" on public.locations;
create policy "read locations" on public.locations
  for select to anon, authenticated
  using (status = 'active' or private.is_location_member(id));

-- Child tables managed by location managers. Same shape for each:
-- one read policy (public when the location is active, or members) and
-- separate manager-only insert/update/delete policies.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('location_photos',        'public reads photos',         'members read photos',         'managers write photos',         true),
      ('location_opening_hours', 'public reads opening hours',  'members read opening hours',  'managers write opening hours',  true),
      ('service_categories',     'public reads categories',     'members read categories',     'managers write categories',     true),
      ('staff_services',         'public reads staff services', 'members read staff services', 'managers write staff services', true),
      ('staff_working_hours',    null,                          'members read working hours',  'managers write working hours',  false)
    ) as v (tbl, public_read, member_read, manager_write, is_public)
  loop
    if t.public_read is not null then
      execute format('drop policy %I on public.%I', t.public_read, t.tbl);
    end if;
    execute format('drop policy %I on public.%I', t.member_read, t.tbl);
    execute format('drop policy %I on public.%I', t.manager_write, t.tbl);

    if t.is_public then
      execute format(
        'create policy "read" on public.%I for select to anon, authenticated
           using (private.is_location_public(location_id) or private.is_location_member(location_id))',
        t.tbl);
    else
      execute format(
        'create policy "read" on public.%I for select to authenticated
           using (private.is_location_member(location_id))',
        t.tbl);
    end if;

    execute format(
      'create policy "managers insert" on public.%I for insert to authenticated
         with check (private.has_location_role(location_id, ''{manager}''))', t.tbl);
    execute format(
      'create policy "managers update" on public.%I for update to authenticated
         using (private.has_location_role(location_id, ''{manager}''))
         with check (private.has_location_role(location_id, ''{manager}''))', t.tbl);
    execute format(
      'create policy "managers delete" on public.%I for delete to authenticated
         using (private.has_location_role(location_id, ''{manager}''))', t.tbl);
  end loop;
end $$;

-- services: the public only sees active, online-bookable services.
drop policy "public reads active services" on public.services;
drop policy "members read services" on public.services;
drop policy "managers write services" on public.services;
create policy "read" on public.services
  for select to anon, authenticated
  using (
    (active and is_bookable_online and private.is_location_public(location_id))
    or private.is_location_member(location_id)
  );
create policy "managers insert" on public.services
  for insert to authenticated with check (private.has_location_role(location_id, '{manager}'));
create policy "managers update" on public.services
  for update to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
create policy "managers delete" on public.services
  for delete to authenticated using (private.has_location_role(location_id, '{manager}'));

-- staff: the public only sees active team members.
drop policy "public reads active staff" on public.staff;
drop policy "members read staff" on public.staff;
drop policy "managers write staff" on public.staff;
create policy "read" on public.staff
  for select to anon, authenticated
  using (
    (active and private.is_location_public(location_id))
    or private.is_location_member(location_id)
  );
create policy "managers insert" on public.staff
  for insert to authenticated with check (private.has_location_role(location_id, '{manager}'));
create policy "managers update" on public.staff
  for update to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
create policy "managers delete" on public.staff
  for delete to authenticated using (private.has_location_role(location_id, '{manager}'));

-- time_off: managers/reception manage any entry; a professional manages
-- only their own (never a whole-location closure).
drop policy "members read time off" on public.time_off;
drop policy "managers and reception write time off" on public.time_off;
drop policy "professionals write own time off" on public.time_off;
create policy "read" on public.time_off
  for select to authenticated using (private.is_location_member(location_id));
create policy "insert" on public.time_off
  for insert to authenticated
  with check (
    private.has_location_role(location_id, '{manager,reception}')
    or (staff_id is not null and private.is_own_staff(staff_id))
  );
create policy "update" on public.time_off
  for update to authenticated
  using (
    private.has_location_role(location_id, '{manager,reception}')
    or (staff_id is not null and private.is_own_staff(staff_id))
  )
  with check (
    private.has_location_role(location_id, '{manager,reception}')
    or (staff_id is not null and private.is_own_staff(staff_id))
  );
create policy "delete" on public.time_off
  for delete to authenticated
  using (
    private.has_location_role(location_id, '{manager,reception}')
    or (staff_id is not null and private.is_own_staff(staff_id))
  );
