-- ============================================================
-- Core tenancy: organizations, locations, memberships, staff,
-- services and schedules. See docs/02-modelo-de-datos.md.
--
-- Security model:
--   * Every table has RLS enabled.
--   * anon/authenticated start with NO privileges (Supabase's defaults are
--     revoked below) and get explicit, column-scoped grants.
--   * Role checks live in the non-exposed `private` schema as
--     security definer helpers, so policies never recurse through RLS.
-- ============================================================

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Tables and functions created from now on start locked down; each one
-- gets explicit grants instead of inheriting Supabase's broad defaults.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ------------------------------------------------------------
-- Types
-- ------------------------------------------------------------
create type public.billing_status as enum ('incomplete', 'trialing', 'active', 'past_due', 'canceled');
create type public.member_role as enum ('owner', 'manager', 'reception', 'professional');
create type public.location_status as enum ('draft', 'active', 'paused', 'archived');
create type public.photo_category as enum ('venue', 'portfolio');
create type public.price_type as enum ('fixed', 'from');

-- ------------------------------------------------------------
-- Shared trigger functions
-- ------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- User profiles (any signed-up person: owner, staff or client)
-- ------------------------------------------------------------
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  phone text check (char_length(phone) <= 32),
  phone_verified_at timestamptz,
  locale text not null default 'en-NZ',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function private.set_updated_at();

-- Create the profile automatically on signup, from the metadata the
-- signup form passes in options.data.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, first_name, last_name, phone)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ------------------------------------------------------------
-- Organizations (the subscribing account)
-- ------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  stripe_customer_id text unique,
  billing_status public.billing_status not null default 'incomplete',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_owner_idx on public.organizations (owner_user_id);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------
-- Locations (independent branch; unit of billing and payouts)
-- ------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60)
    -- Reserved so a location page at /{slug} never shadows an app route.
    check (slug <> all (array[
      'admin', 'api', 'app', 'auth', 'book', 'booking', 'bookings', 'dashboard',
      'help', 'login', 'logout', 'pricing', 'privacy', 'settings', 'signup',
      'support', 'terms', 'www'
    ])),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  phone text check (char_length(phone) <= 32),
  email text check (char_length(email) <= 254),
  address_line text,
  suburb text,
  city text,
  postcode text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  timezone text not null default 'Pacific/Auckland',
  status public.location_status not null default 'draft',
  is_verified boolean not null default false,
  -- Booking rules (docs/03)
  min_notice_minutes int not null default 120 check (min_notice_minutes between 0 and 10080),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  slot_step_minutes int not null default 15 check (slot_step_minutes in (5, 10, 15, 20, 30, 60)),
  default_buffer_minutes int not null default 0 check (default_buffer_minutes between 0 and 240),
  require_card boolean not null default true,
  auto_assign_strategy text not null default 'least_busy'
    check (auto_assign_strategy in ('least_busy', 'first_available')),
  no_show_grace_minutes int not null default 15 check (no_show_grace_minutes between 0 and 240),
  -- Payouts (Stripe Connect, docs/04); written only by server code
  stripe_account_id text,
  stripe_charges_enabled boolean not null default false,
  -- Presentation
  amenities jsonb not null default '{}'::jsonb check (jsonb_typeof(amenities) = 'object'),
  logo_path text,
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_org_idx on public.locations (organization_id);
create trigger locations_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger locations_valid_timezone before insert or update of timezone on public.locations
  for each row execute function private.validate_timezone();

-- ------------------------------------------------------------
-- Memberships (who works in the org, with which role and scope)
-- ------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text check (char_length(invited_email) <= 254),
  role public.member_role not null,
  location_id uuid references public.locations (id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Owners are org-wide; every other role is scoped to one location.
  check ((role = 'owner') = (location_id is null)),
  check (user_id is not null or invited_email is not null)
);

-- One accepted/linked membership per user, role and scope. Pending invites
-- (user_id null) are deduplicated by email instead.
create unique index memberships_user_role_scope_uniq
  on public.memberships (organization_id, user_id, role, location_id) nulls not distinct
  where user_id is not null;
create unique index memberships_invite_uniq
  on public.memberships (organization_id, lower(invited_email), role, location_id) nulls not distinct
  where user_id is null;

create index memberships_user_idx on public.memberships (user_id);
create index memberships_location_idx on public.memberships (location_id);

-- ------------------------------------------------------------
-- Role helpers (private, security definer: bypass RLS on memberships)
-- ------------------------------------------------------------
create function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.accepted_at is not null
  );
$$;

create function private.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.accepted_at is not null
  );
$$;

-- True when the current user holds one of p_roles at the location, or owns
-- its organization (owners implicitly hold every role everywhere).
create function private.has_location_role(p_location uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.locations l on l.id = p_location
    where m.user_id = (select auth.uid())
      and m.accepted_at is not null
      and (
        (m.role = 'owner' and m.organization_id = l.organization_id)
        or (m.location_id = p_location and m.role = any (p_roles))
      )
  );
$$;

create function private.is_location_member(p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_location_role(
    p_location, array['owner', 'manager', 'reception', 'professional']::public.member_role[]
  );
$$;

create function private.is_location_public(p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.locations where id = p_location and status = 'active');
$$;


-- ------------------------------------------------------------
-- Location content
-- ------------------------------------------------------------
create table public.location_photos (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  path text not null,
  category public.photo_category not null default 'portfolio',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index location_photos_location_idx on public.location_photos (location_id);

create table public.location_opening_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);
create index location_opening_hours_location_idx on public.location_opening_hours (location_id);

-- ------------------------------------------------------------
-- Staff and schedules
-- ------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (char_length(bio) <= 1000),
  photo_path text,
  calendar_color text check (calendar_color ~ '^#[0-9a-fA-F]{6}$'),
  is_bookable_online boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables prove a staff member belongs to the same location.
  unique (id, location_id),
  unique (location_id, user_id)
);
create index staff_user_idx on public.staff (user_id);

create function private.is_own_staff(p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (select 1 from public.staff where id = p_staff and user_id = (select auth.uid()));
$;
create trigger staff_updated_at before update on public.staff
  for each row execute function private.set_updated_at();

create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  location_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at),
  foreign key (staff_id, location_id) references public.staff (id, location_id) on delete cascade,
  -- Two shifts of the same person can't overlap on the same weekday.
  exclude using gist (
    staff_id with =,
    weekday with =,
    tsrange('2000-01-01'::date + starts_at, '2000-01-01'::date + ends_at) with &&
  )
);
create index staff_working_hours_location_idx on public.staff_working_hours (location_id);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  staff_id uuid, -- null = whole location closed
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (staff_id, location_id) references public.staff (id, location_id) on delete cascade
);
create index time_off_location_range_idx on public.time_off using gist (location_id, tstzrange(starts_at, ends_at));

-- ------------------------------------------------------------
-- Service catalog
-- ------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order int not null default 0,
  unique (id, location_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  duration_minutes int not null check (duration_minutes between 5 and 720),
  buffer_after_minutes int check (buffer_after_minutes between 0 and 240), -- null = location default
  price_cents int not null check (price_cents >= 0),
  price_type public.price_type not null default 'fixed',
  is_bookable_online boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, location_id),
  foreign key (category_id, location_id) references public.service_categories (id, location_id) on delete set null (category_id)
);
create index services_location_idx on public.services (location_id);
create trigger services_updated_at before update on public.services
  for each row execute function private.set_updated_at();

create table public.staff_services (
  staff_id uuid not null,
  service_id uuid not null,
  location_id uuid not null,
  price_cents_override int check (price_cents_override >= 0),            -- phase 2
  duration_minutes_override int check (duration_minutes_override between 5 and 720), -- phase 2
  primary key (staff_id, service_id),
  foreign key (staff_id, location_id) references public.staff (id, location_id) on delete cascade,
  foreign key (service_id, location_id) references public.services (id, location_id) on delete cascade
);
create index staff_services_service_idx on public.staff_services (service_id);

-- ============================================================
-- Row Level Security
-- ============================================================
-- Policies call the private helpers, so API roles need to execute them
-- (the schema itself is not exposed through the Data API).
grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;
revoke execute on function private.handle_new_user() from anon, authenticated;

alter table public.user_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.memberships enable row level security;
alter table public.location_photos enable row level security;
alter table public.location_opening_hours enable row level security;
alter table public.staff enable row level security;
alter table public.staff_working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;

-- Start from zero, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;

-- user_profiles: each person reads and edits only their own row.
-- (Staff access to client details comes later through location_clients.)
create policy "own profile: read" on public.user_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile: update" on public.user_profiles
  for update to authenticated using (user_id = (select auth.uid()));
grant select on public.user_profiles to authenticated;
grant update (first_name, last_name, phone, locale, marketing_opt_in) on public.user_profiles to authenticated;

-- organizations: members read; only the owner renames. Creation goes
-- through create_organization(); billing fields are webhook-only.
create policy "members read org" on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy "owner renames org" on public.organizations
  for update to authenticated using (private.is_org_owner(id));
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

-- memberships: you see your own; owners see the whole org; managers see
-- their location. All writes go through server code (invites, role changes).
create policy "read memberships" on public.memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    or private.is_org_owner(organization_id)
    or (location_id is not null and private.has_location_role(location_id, '{manager}'))
  );
grant select on public.memberships to authenticated;

-- locations: anyone reads active ones; members read their own in any status.
-- stripe_account_id is never readable from the API.
create policy "public reads active locations" on public.locations
  for select to anon, authenticated using (status = 'active');
create policy "members read their locations" on public.locations
  for select to authenticated using (private.is_location_member(id));
create policy "owner creates locations" on public.locations
  for insert to authenticated with check (private.is_org_owner(organization_id));
create policy "managers edit location" on public.locations
  for update to authenticated using (private.has_location_role(id, '{manager}'));

grant select (
  id, organization_id, slug, name, description, phone, email,
  address_line, suburb, city, postcode, lat, lng, timezone, status, is_verified,
  min_notice_minutes, max_advance_days, slot_step_minutes, default_buffer_minutes,
  require_card, auto_assign_strategy, no_show_grace_minutes, stripe_charges_enabled,
  amenities, logo_path, cover_path, created_at, updated_at
) on public.locations to anon, authenticated;
-- New locations always start as 'draft'; status, is_verified and Stripe
-- fields are not grantable, so only server code can change them.
grant insert (organization_id, name, slug, timezone) on public.locations to authenticated;
grant update (
  slug, name, description, phone, email, address_line, suburb, city, postcode, lat, lng,
  timezone, min_notice_minutes, max_advance_days, slot_step_minutes, default_buffer_minutes,
  require_card, auto_assign_strategy, no_show_grace_minutes, amenities, logo_path, cover_path
) on public.locations to authenticated;

-- Location content tables: public reads when the location is active,
-- members always read, managers write.
create policy "public reads photos" on public.location_photos
  for select to anon, authenticated using (private.is_location_public(location_id));
create policy "members read photos" on public.location_photos
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write photos" on public.location_photos
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select on public.location_photos to anon, authenticated;
grant insert, update, delete on public.location_photos to authenticated;

create policy "public reads opening hours" on public.location_opening_hours
  for select to anon, authenticated using (private.is_location_public(location_id));
create policy "members read opening hours" on public.location_opening_hours
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write opening hours" on public.location_opening_hours
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select on public.location_opening_hours to anon, authenticated;
grant insert, update, delete on public.location_opening_hours to authenticated;

-- staff: the public sees active team members (no user_id link exposed).
create policy "public reads active staff" on public.staff
  for select to anon, authenticated
  using (active and private.is_location_public(location_id));
create policy "members read staff" on public.staff
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write staff" on public.staff
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select (
  id, location_id, display_name, bio, photo_path, calendar_color,
  is_bookable_online, active, sort_order
) on public.staff to anon;
grant select on public.staff to authenticated;
grant insert, update, delete on public.staff to authenticated;

-- staff_working_hours: internal. Public availability comes from an RPC.
create policy "members read working hours" on public.staff_working_hours
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write working hours" on public.staff_working_hours
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select, insert, update, delete on public.staff_working_hours to authenticated;

-- time_off: internal. Managers and reception manage any; a professional
-- manages only their own (never whole-location closures).
create policy "members read time off" on public.time_off
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers and reception write time off" on public.time_off
  for all to authenticated
  using (private.has_location_role(location_id, '{manager,reception}'))
  with check (private.has_location_role(location_id, '{manager,reception}'));
create policy "professionals write own time off" on public.time_off
  for all to authenticated
  using (staff_id is not null and private.is_own_staff(staff_id))
  with check (staff_id is not null and private.is_own_staff(staff_id));
grant select, insert, update, delete on public.time_off to authenticated;

create policy "public reads categories" on public.service_categories
  for select to anon, authenticated using (private.is_location_public(location_id));
create policy "members read categories" on public.service_categories
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write categories" on public.service_categories
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select on public.service_categories to anon, authenticated;
grant insert, update, delete on public.service_categories to authenticated;

create policy "public reads active services" on public.services
  for select to anon, authenticated
  using (active and is_bookable_online and private.is_location_public(location_id));
create policy "members read services" on public.services
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write services" on public.services
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;

create policy "public reads staff services" on public.staff_services
  for select to anon, authenticated using (private.is_location_public(location_id));
create policy "members read staff services" on public.staff_services
  for select to authenticated using (private.is_location_member(location_id));
create policy "managers write staff services" on public.staff_services
  for all to authenticated
  using (private.has_location_role(location_id, '{manager}'))
  with check (private.has_location_role(location_id, '{manager}'));
grant select on public.staff_services to anon, authenticated;
grant insert, update, delete on public.staff_services to authenticated;

-- ============================================================
-- Onboarding RPC: create an organization with its first location in one
-- transaction. For solo operators the owner is also added as bookable
-- staff, so the same booking engine serves every segment.
-- ============================================================
create function public.create_organization(
  p_organization_name text,
  p_location_name text,
  p_location_slug text,
  p_timezone text default 'Pacific/Auckland',
  p_owner_is_professional boolean default true
)
returns uuid -- the new location id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_location uuid;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (name, owner_user_id)
  values (trim(p_organization_name), v_user)
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role, accepted_at)
  values (v_org, v_user, 'owner', now());

  insert into public.locations (organization_id, name, slug, timezone)
  values (v_org, trim(p_location_name), lower(trim(p_location_slug)), p_timezone)
  returning id into v_location;

  if p_owner_is_professional then
    select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), trim(p_location_name))
      into v_display_name
      from public.user_profiles where user_id = v_user;

    insert into public.staff (location_id, user_id, display_name)
    values (v_location, v_user, coalesce(v_display_name, trim(p_location_name)));
  end if;

  return v_location;
end;
$$;

grant execute on function public.create_organization(text, text, text, text, boolean) to authenticated;
