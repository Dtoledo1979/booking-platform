-- ============================================================
-- Appointments, cancellation policies and fees.
-- See docs/02-modelo-de-datos.md and docs/03-reservas-y-cancelaciones.md.
--
-- Clients never write these tables directly: every state change goes
-- through a security definer RPC below, which validates availability,
-- roles, the policy window and computes fees server-side.
-- ============================================================

-- ------------------------------------------------------------
-- Types
-- ------------------------------------------------------------
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'no_show', 'cancelled');
create type public.appointment_source as enum ('online', 'staff');
create type public.cancelled_by as enum ('client', 'business', 'system');
create type public.fee_type as enum ('none', 'fixed', 'percent');
create type public.fee_kind as enum ('late_cancel', 'no_show');
create type public.fee_status as enum ('pending', 'succeeded', 'failed', 'waived', 'refunded');

alter table public.locations
  add column currency text not null default 'NZD' check (currency ~ '^[A-Z]{3}$');
grant select (currency) on public.locations to anon, authenticated;

-- ------------------------------------------------------------
-- Cancellation policies (versioned, immutable)
-- ------------------------------------------------------------
create table public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  version int not null check (version > 0),
  free_cancellation_hours int not null default 24 check (free_cancellation_hours between 0 and 336),
  -- fixed: value in cents; percent: value is 1..100 of the booked price
  late_cancel_fee_type public.fee_type not null default 'percent',
  late_cancel_fee_value int not null default 50,
  no_show_fee_type public.fee_type not null default 'percent',
  no_show_fee_value int not null default 100,
  policy_text text check (char_length(policy_text) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (location_id, version),
  unique (id, location_id),
  constraint late_cancel_fee_valid check (
    (late_cancel_fee_type = 'none' and late_cancel_fee_value = 0)
    or (late_cancel_fee_type = 'fixed' and late_cancel_fee_value > 0)
    or (late_cancel_fee_type = 'percent' and late_cancel_fee_value between 1 and 100)
  ),
  constraint no_show_fee_valid check (
    (no_show_fee_type = 'none' and no_show_fee_value = 0)
    or (no_show_fee_type = 'fixed' and no_show_fee_value > 0)
    or (no_show_fee_type = 'percent' and no_show_fee_value between 1 and 100)
  )
);

-- Every location gets version 1 with the defaults from docs/05.
create function private.create_default_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cancellation_policies (location_id, version) values (new.id, 1);
  return new;
end;
$$;

create trigger locations_default_policy after insert on public.locations
  for each row execute function private.create_default_policy();

insert into public.cancellation_policies (location_id, version)
select l.id, 1 from public.locations l
where not exists (select 1 from public.cancellation_policies p where p.location_id = l.id);

-- ------------------------------------------------------------
-- Clients per location (CRM) and saved cards
-- ------------------------------------------------------------
create table public.location_clients (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null, -- null = walk-in / phone client
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text check (char_length(last_name) <= 80),
  phone text check (char_length(phone) <= 32),
  email text check (char_length(email) <= 254),
  notes text check (char_length(notes) <= 4000),
  allergies text check (char_length(allergies) <= 1000),
  is_blocked boolean not null default false,
  blocked_reason text check (char_length(blocked_reason) <= 500),
  stripe_customer_id text, -- customer on the location's Connect account
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, location_id)
);
create unique index location_clients_user_uniq
  on public.location_clients (location_id, user_id) where user_id is not null;
create trigger location_clients_updated_at before update on public.location_clients
  for each row execute function private.set_updated_at();

create table public.client_payment_methods (
  id uuid primary key default gen_random_uuid(),
  location_client_id uuid not null,
  location_id uuid not null,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text check (last4 ~ '^[0-9]{4}$'),
  exp_month smallint check (exp_month between 1 and 12),
  exp_year smallint check (exp_year between 2000 and 2100),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (location_client_id, location_id)
    references public.location_clients (id, location_id) on delete cascade
);
create unique index client_payment_methods_one_default
  on public.client_payment_methods (location_client_id) where is_default;

-- ------------------------------------------------------------
-- Appointments
-- ------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  location_client_id uuid not null,
  status public.appointment_status not null default 'pending',
  source public.appointment_source not null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  cancellation_policy_id uuid not null,
  -- Null when created by staff and the client never accepted the policy:
  -- in that case no fee can be charged.
  policy_accepted_at timestamptz,
  policy_accepted_ip inet,
  cancelled_at timestamptz,
  cancelled_by public.cancelled_by,
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  notes_from_client text check (char_length(notes_from_client) <= 1000),
  expires_at timestamptz, -- only while pending (card entry hold)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, location_id),
  foreign key (location_client_id, location_id)
    references public.location_clients (id, location_id),
  foreign key (cancellation_policy_id, location_id)
    references public.cancellation_policies (id, location_id),
  check ((status = 'pending') = (expires_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null))
);
create index appointments_location_idx on public.appointments (location_id, created_at desc);
create index appointments_client_idx on public.appointments (location_client_id);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();

-- Internal notes live apart from the appointment so clients can read
-- their own appointments without ever seeing staff notes.
create table public.appointment_notes (
  appointment_id uuid primary key,
  location_id uuid not null,
  body text not null check (char_length(body) <= 4000),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  foreign key (appointment_id, location_id)
    references public.appointments (id, location_id) on delete cascade
);

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  location_id uuid not null,
  service_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_until timestamptz not null, -- ends_at + buffer: what blocks the calendar
  duration_minutes int not null check (duration_minutes between 5 and 720),
  price_cents int not null check (price_cents >= 0),
  service_name text not null,
  -- Mirrors appointments.status in ('pending','confirmed'); kept in sync by
  -- trigger so the exclusion constraint can use it.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (hold_until >= ends_at),
  foreign key (appointment_id, location_id)
    references public.appointments (id, location_id) on delete cascade,
  foreign key (service_id, location_id) references public.services (id, location_id),
  foreign key (staff_id, location_id) references public.staff (id, location_id),
  -- The core guarantee: one professional can never be double booked.
  constraint appointment_services_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, hold_until) with &&
  ) where (is_active)
);
create index appointment_services_appointment_idx on public.appointment_services (appointment_id);
create index appointment_services_location_start_idx on public.appointment_services (location_id, starts_at);

-- ------------------------------------------------------------
-- Fees and audit log
-- ------------------------------------------------------------
create table public.booking_fees (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  location_id uuid not null,
  location_client_id uuid not null,
  kind public.fee_kind not null,
  amount_cents int not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status public.fee_status not null default 'pending',
  stripe_payment_intent_id text unique,
  failure_reason text,
  refund_requested_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, kind),
  foreign key (appointment_id, location_id)
    references public.appointments (id, location_id) on delete cascade,
  foreign key (location_client_id, location_id)
    references public.location_clients (id, location_id)
);
create index booking_fees_location_idx on public.booking_fees (location_id, created_at desc);
create trigger booking_fees_updated_at before update on public.booking_fees
  for each row execute function private.set_updated_at();

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_location_idx on public.audit_log (location_id, created_at desc);

-- ------------------------------------------------------------
-- Appointment status rules
-- ------------------------------------------------------------
create function private.guard_appointment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled'))
    or (old.status = 'no_show' and new.status = 'completed') -- marked by mistake
  ) then
    raise exception 'invalid_status_transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger appointments_guard_status before update of status on public.appointments
  for each row execute function private.guard_appointment_status();

create function private.sync_appointment_services_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appointment_services
  set is_active = new.status in ('pending', 'confirmed')
  where appointment_id = new.id;
  return new;
end;
$$;

create trigger appointments_sync_active after update of status on public.appointments
  for each row execute function private.sync_appointment_services_active();

-- ------------------------------------------------------------
-- Private helpers
-- ------------------------------------------------------------
create function private.is_location_client(p_location_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.location_clients
    where id = p_location_client and user_id = (select auth.uid())
  );
$$;

create function private.is_appointment_client(p_appointment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    join public.location_clients lc on lc.id = a.location_client_id
    where a.id = p_appointment and lc.user_id = (select auth.uid())
  );
$$;

create function private.is_appointment_professional(p_appointment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointment_services s
    join public.staff st on st.id = s.staff_id
    where s.appointment_id = p_appointment and st.user_id = (select auth.uid())
  );
$$;

-- Managers and reception handle any appointment; a professional only
-- the ones assigned to them.
create function private.can_manage_appointment(p_appointment uuid, p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_location_role(p_location, '{manager,reception}')
      or private.is_appointment_professional(p_appointment);
$$;

create function private.audit(
  p_location uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (organization_id, location_id, actor_user_id, action, entity, entity_id, payload)
  select l.organization_id, l.id, (select auth.uid()), p_action, p_entity, p_entity_id, p_payload
  from public.locations l where l.id = p_location;
$$;

-- Caller IP as forwarded by the API gateway; evidence for disputes.
create function private.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(trim(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1
  )), '')::inet;
exception when others then
  return null;
end;
$$;

create function private.fee_cents(p_type public.fee_type, p_value int, p_price_cents int)
returns int
language sql
immutable
set search_path = ''
as $$
  -- A fee never exceeds the price of what was booked (docs/03).
  select case p_type
    when 'none' then 0
    when 'fixed' then least(p_value, p_price_cents)
    when 'percent' then least(round(p_price_cents * p_value / 100.0)::int, p_price_cents)
  end;
$$;

create function private.ensure_location_client(p_location uuid, p_user uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.location_clients (location_id, user_id, first_name, last_name, phone, email)
  select p_location, u.id,
         coalesce(up.first_name, split_part(u.email, '@', 1), 'Client'),
         up.last_name, up.phone, u.email
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  where u.id = p_user
  on conflict (location_id, user_id) where user_id is not null
    do update set user_id = excluded.user_id
  returning id;
$$;

-- Releases card-entry holds that timed out.
create function private.expire_pending_appointments(p_location uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
      cancellation_reason = 'payment_method_timeout', expires_at = null
  where location_id = p_location and status = 'pending' and expires_at <= now();
$$;

-- Fee a client would pay if they cancelled right now.
create function private.cancellation_quote(p_appointment uuid)
returns table (starts_at timestamptz, free_until timestamptz, price_cents int, fee_cents int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    min(s.starts_at),
    min(s.starts_at) - make_interval(hours => p.free_cancellation_hours),
    sum(s.price_cents)::int,
    case
      when a.status = 'confirmed'
       and a.policy_accepted_at is not null
       and now() > min(s.starts_at) - make_interval(hours => p.free_cancellation_hours)
      then private.fee_cents(p.late_cancel_fee_type, p.late_cancel_fee_value, sum(s.price_cents)::int)
      else 0
    end
  from public.appointments a
  join public.cancellation_policies p on p.id = a.cancellation_policy_id
  join public.appointment_services s on s.appointment_id = a.id
  where a.id = p_appointment
  group by a.id, a.status, a.policy_accepted_at, p.free_cancellation_hours,
           p.late_cancel_fee_type, p.late_cancel_fee_value;
$$;

-- ------------------------------------------------------------
-- Availability engine (docs/03)
-- ------------------------------------------------------------
create function private.available_slots(
  p_location_id uuid,
  p_service_id uuid,
  p_date_from date,
  p_date_to date,
  p_staff_id uuid default null,
  p_ignore_appointment uuid default null,
  p_online_only boolean default true
)
returns table (slot_start timestamptz, staff_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with loc as (
    select l.id, l.timezone, l.min_notice_minutes, l.max_advance_days,
           l.slot_step_minutes, l.default_buffer_minutes,
           (now() at time zone l.timezone)::date as today
    from public.locations l
    where l.id = p_location_id
  ),
  svc as (
    select s.duration_minutes,
           coalesce(s.buffer_after_minutes, loc.default_buffer_minutes) as buffer
    from public.services s
    cross join loc
    where s.id = p_service_id
      and s.location_id = loc.id
      and s.active
      and (not p_online_only or s.is_bookable_online)
  ),
  eligible as (
    select st.id as staff_id,
           coalesce(ss.duration_minutes_override, svc.duration_minutes) as duration,
           svc.buffer
    from public.staff st
    join public.staff_services ss on ss.staff_id = st.id and ss.service_id = p_service_id
    cross join svc
    where st.location_id = p_location_id
      and st.active
      and (not p_online_only or st.is_bookable_online)
      and (p_staff_id is null or st.id = p_staff_id)
  ),
  -- At most 31 days per call, never past the booking horizon.
  days as (
    select d::date as day
    from loc,
         -- Plain timestamps (not timestamptz) so the result never depends
         -- on the session time zone.
         generate_series(
           greatest(p_date_from, loc.today)::timestamp,
           least(p_date_to, loc.today + loc.max_advance_days, greatest(p_date_from, loc.today) + 31)::timestamp,
           interval '1 day'
         ) as d
  ),
  candidates as (
    select e.staff_id, e.duration, e.buffer,
           local_start at time zone loc.timezone as slot_start
    from eligible e
    cross join loc
    join public.staff_working_hours wh on wh.staff_id = e.staff_id
    join days on extract(dow from days.day) = wh.weekday
    cross join lateral generate_series(
      days.day + wh.starts_at,
      days.day + wh.ends_at - make_interval(mins => e.duration),
      make_interval(mins => loc.slot_step_minutes)
    ) as local_start
  )
  select c.slot_start, c.staff_id
  from candidates c
  cross join loc
  where c.slot_start >= now() + make_interval(mins => loc.min_notice_minutes)
    and not exists (
      select 1 from public.time_off t
      where t.location_id = p_location_id
        and (t.staff_id is null or t.staff_id = c.staff_id)
        and tstzrange(t.starts_at, t.ends_at)
            && tstzrange(c.slot_start, c.slot_start + make_interval(mins => c.duration))
    )
    and not exists (
      select 1
      from public.appointment_services a
      join public.appointments ap on ap.id = a.appointment_id
      where a.staff_id = c.staff_id
        and a.is_active
        and (ap.status = 'confirmed' or (ap.status = 'pending' and ap.expires_at > now()))
        and (p_ignore_appointment is null or a.appointment_id <> p_ignore_appointment)
        and tstzrange(a.starts_at, a.hold_until)
            && tstzrange(c.slot_start, c.slot_start + make_interval(mins => c.duration + c.buffer))
    )
  order by 1, 2;
$$;

-- Public, anonymous availability for an active location. Returns open
-- start times per professional; never who holds a booked slot.
create function public.get_available_slots(
  p_location_id uuid,
  p_service_id uuid,
  p_date_from date,
  p_date_to date,
  p_staff_id uuid default null
)
returns table (slot_start timestamptz, staff_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slot_start, s.staff_id
  from private.available_slots(p_location_id, p_service_id, p_date_from, p_date_to, p_staff_id, null, true) s
  where private.is_location_public(p_location_id);
$$;

-- ------------------------------------------------------------
-- Client booking flow
-- ------------------------------------------------------------
create function public.book_appointment(
  p_location_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid default null,
  p_accept_policy boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_loc public.locations%rowtype;
  v_service public.services%rowtype;
  v_policy public.cancellation_policies%rowtype;
  v_local_day date;
  v_staff uuid;
  v_duration int;
  v_price int;
  v_buffer int;
  v_client uuid;
  v_needs_card boolean;
  v_appointment uuid;
  v_status public.appointment_status;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not coalesce(p_accept_policy, false) then
    raise exception 'policy_not_accepted';
  end if;

  select * into v_loc from public.locations where id = p_location_id and status = 'active';
  if not found then
    raise exception 'location_unavailable';
  end if;

  perform private.expire_pending_appointments(p_location_id);

  -- Choose the professional among those free at exactly this instant.
  v_local_day := (p_starts_at at time zone v_loc.timezone)::date;
  select s.staff_id into v_staff
  from private.available_slots(p_location_id, p_service_id, v_local_day, v_local_day, p_staff_id, null, true) s
  join public.staff st on st.id = s.staff_id
  where s.slot_start = p_starts_at
  order by
    case when v_loc.auto_assign_strategy = 'least_busy' then (
      select coalesce(sum(a.duration_minutes), 0)
      from public.appointment_services a
      where a.staff_id = s.staff_id
        and a.is_active
        and (a.starts_at at time zone v_loc.timezone)::date = v_local_day
    ) else 0 end,
    st.sort_order,
    st.id
  limit 1;

  if v_staff is null then
    raise exception 'slot_unavailable';
  end if;

  select * into v_service from public.services where id = p_service_id;
  select coalesce(ss.duration_minutes_override, v_service.duration_minutes),
         coalesce(ss.price_cents_override, v_service.price_cents)
    into v_duration, v_price
  from public.staff_services ss
  where ss.staff_id = v_staff and ss.service_id = p_service_id;
  v_buffer := coalesce(v_service.buffer_after_minutes, v_loc.default_buffer_minutes);

  v_client := private.ensure_location_client(p_location_id, v_user);
  if exists (select 1 from public.location_clients where id = v_client and is_blocked) then
    raise exception 'client_blocked';
  end if;

  select * into v_policy from public.cancellation_policies
  where location_id = p_location_id order by version desc limit 1;

  -- A card is needed only when fees can actually be charged and the
  -- client has no card saved at this location yet.
  v_needs_card := v_loc.require_card
    and v_loc.stripe_charges_enabled
    and (v_policy.late_cancel_fee_type <> 'none' or v_policy.no_show_fee_type <> 'none')
    and not exists (select 1 from public.client_payment_methods where location_client_id = v_client);
  v_status := case when v_needs_card then 'pending' else 'confirmed' end;

  insert into public.appointments (
    location_id, location_client_id, status, source, created_by_user_id,
    cancellation_policy_id, policy_accepted_at, policy_accepted_ip, notes_from_client, expires_at
  ) values (
    p_location_id, v_client, v_status, 'online', v_user,
    v_policy.id, now(), private.request_ip(), nullif(trim(p_notes), ''),
    case when v_needs_card then now() + interval '10 minutes' end
  )
  returning id into v_appointment;

  begin
    insert into public.appointment_services (
      appointment_id, location_id, service_id, staff_id,
      starts_at, ends_at, hold_until, duration_minutes, price_cents, service_name
    ) values (
      v_appointment, p_location_id, p_service_id, v_staff,
      p_starts_at,
      p_starts_at + make_interval(mins => v_duration),
      p_starts_at + make_interval(mins => v_duration + v_buffer),
      v_duration, v_price, v_service.name
    );
  exception when exclusion_violation then
    -- Someone took the slot between the availability check and the insert.
    raise exception 'slot_unavailable';
  end;

  perform private.audit(p_location_id, 'appointment.booked', 'appointment', v_appointment,
    jsonb_build_object('staff_id', v_staff, 'service_id', p_service_id, 'starts_at', p_starts_at,
                       'status', v_status, 'policy_id', v_policy.id));

  return jsonb_build_object(
    'appointment_id', v_appointment,
    'status', v_status,
    'staff_id', v_staff,
    'expires_at', case when v_needs_card then now() + interval '10 minutes' end
  );
end;
$$;

-- Called by the Stripe webhook (service_role) once the card is saved.
create function public.confirm_pending_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location uuid;
begin
  update public.appointments
  set status = 'confirmed', expires_at = null
  where id = p_appointment_id and status = 'pending' and expires_at > now()
  returning location_id into v_location;

  if v_location is null then
    raise exception 'appointment_not_pending';
  end if;

  perform private.audit(v_location, 'appointment.confirmed', 'appointment', p_appointment_id);
end;
$$;

create function public.get_cancellation_quote(p_appointment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_quote record;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found or not (
    private.is_location_member(v_appt.location_id) or private.is_location_client(v_appt.location_client_id)
  ) then
    raise exception 'appointment_not_found';
  end if;

  select * into v_quote from private.cancellation_quote(p_appointment_id);
  return jsonb_build_object(
    'status', v_appt.status,
    'starts_at', v_quote.starts_at,
    'free_until', v_quote.free_until,
    'fee_cents', v_quote.fee_cents,
    'currency', (select currency from public.locations where id = v_appt.location_id)
  );
end;
$$;

create function public.cancel_appointment(p_appointment_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_by public.cancelled_by;
  v_quote record;
  v_fee uuid;
  v_fee_cents int := 0;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment_not_found';
  end if;

  if private.can_manage_appointment(p_appointment_id, v_appt.location_id) then
    v_by := 'business';
  elsif private.is_location_client(v_appt.location_client_id) then
    v_by := 'client';
  else
    raise exception 'appointment_not_found';
  end if;

  if v_appt.status not in ('pending', 'confirmed') then
    raise exception 'appointment_not_cancellable';
  end if;

  select * into v_quote from private.cancellation_quote(p_appointment_id);

  if v_by = 'business' then
    -- The business never charges the client for its own cancellation, but
    -- must tell them why.
    if nullif(trim(p_reason), '') is null then
      raise exception 'reason_required';
    end if;
  else
    if now() >= v_quote.starts_at then
      raise exception 'appointment_started';
    end if;
    v_fee_cents := v_quote.fee_cents;
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_by,
      cancellation_reason = nullif(trim(p_reason), ''), expires_at = null
  where id = p_appointment_id;

  if v_fee_cents > 0 then
    insert into public.booking_fees (
      appointment_id, location_id, location_client_id, kind, amount_cents, currency, created_by_user_id
    )
    select v_appt.id, v_appt.location_id, v_appt.location_client_id, 'late_cancel',
           v_fee_cents, l.currency, auth.uid()
    from public.locations l where l.id = v_appt.location_id
    returning id into v_fee;
  end if;

  perform private.audit(v_appt.location_id, 'appointment.cancelled', 'appointment', v_appt.id,
    jsonb_build_object('by', v_by, 'fee_cents', v_fee_cents, 'fee_id', v_fee));

  return jsonb_build_object('status', 'cancelled', 'cancelled_by', v_by,
                            'fee_cents', v_fee_cents, 'fee_id', v_fee);
end;
$$;

create function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamptz,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_line public.appointment_services%rowtype;
  v_loc public.locations%rowtype;
  v_is_business boolean;
  v_quote record;
  v_local_day date;
  v_staff uuid;
  v_buffer int;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'appointment_not_found';
  end if;

  v_is_business := private.can_manage_appointment(p_appointment_id, v_appt.location_id);
  if not v_is_business and not private.is_location_client(v_appt.location_client_id) then
    raise exception 'appointment_not_found';
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'appointment_not_reschedulable';
  end if;
  if (select count(*) from public.appointment_services where appointment_id = p_appointment_id) <> 1 then
    raise exception 'multi_service_reschedule_unsupported';
  end if;

  select * into v_line from public.appointment_services where appointment_id = p_appointment_id;
  select * into v_loc from public.locations where id = v_appt.location_id;

  if v_is_business then
    -- Staff may move a booking anywhere the professional is free; only the
    -- no-double-booking constraint applies.
    v_staff := coalesce(p_staff_id, v_line.staff_id);
    if not exists (
      select 1 from public.staff
      where id = v_staff and location_id = v_appt.location_id and active
    ) then
      raise exception 'staff_unavailable';
    end if;
  else
    select * into v_quote from private.cancellation_quote(p_appointment_id);
    if now() >= v_quote.free_until then
      -- Inside the paid window the client must contact the business.
      raise exception 'reschedule_window_closed';
    end if;

    v_local_day := (p_new_starts_at at time zone v_loc.timezone)::date;
    select s.staff_id into v_staff
    from private.available_slots(v_appt.location_id, v_line.service_id, v_local_day, v_local_day,
                                 p_staff_id, p_appointment_id, true) s
    where s.slot_start = p_new_starts_at
    order by (s.staff_id = v_line.staff_id) desc, s.staff_id
    limit 1;
    if v_staff is null then
      raise exception 'slot_unavailable';
    end if;
  end if;

  v_buffer := (extract(epoch from v_line.hold_until - v_line.ends_at) / 60)::int;

  begin
    update public.appointment_services
    set staff_id = v_staff,
        starts_at = p_new_starts_at,
        ends_at = p_new_starts_at + make_interval(mins => v_line.duration_minutes),
        hold_until = p_new_starts_at + make_interval(mins => v_line.duration_minutes + v_buffer)
    where id = v_line.id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  perform private.audit(v_appt.location_id, 'appointment.rescheduled', 'appointment', v_appt.id,
    jsonb_build_object('from', v_line.starts_at, 'to', p_new_starts_at,
                       'staff_id', v_staff, 'by', case when v_is_business then 'business' else 'client' end));

  return jsonb_build_object('appointment_id', v_appt.id, 'starts_at', p_new_starts_at, 'staff_id', v_staff);
end;
$$;

-- ------------------------------------------------------------
-- Business-side actions
-- ------------------------------------------------------------
create function public.create_staff_appointment(
  p_location_id uuid,
  p_location_client_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc public.locations%rowtype;
  v_service public.services%rowtype;
  v_policy uuid;
  v_appointment uuid;
  v_duration int;
  v_price int;
  v_buffer int;
begin
  if not (
    private.has_location_role(p_location_id, '{manager,reception}')
    or (private.is_own_staff(p_staff_id)
        and private.has_location_role(p_location_id, '{professional}'))
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  select * into v_service from public.services
  where id = p_service_id and location_id = p_location_id and active;
  if not found then
    raise exception 'service_unavailable';
  end if;
  if not exists (
    select 1 from public.staff where id = p_staff_id and location_id = p_location_id and active
  ) then
    raise exception 'staff_unavailable';
  end if;
  if not exists (
    select 1 from public.location_clients
    where id = p_location_client_id and location_id = p_location_id
  ) then
    raise exception 'client_not_found';
  end if;

  select coalesce(ss.duration_minutes_override, v_service.duration_minutes),
         coalesce(ss.price_cents_override, v_service.price_cents)
    into v_duration, v_price
  from (select 1) as one
  left join public.staff_services ss on ss.staff_id = p_staff_id and ss.service_id = p_service_id;
  v_buffer := coalesce(v_service.buffer_after_minutes, v_loc.default_buffer_minutes);

  select id into v_policy from public.cancellation_policies
  where location_id = p_location_id order by version desc limit 1;

  -- policy_accepted_at stays null: no fee can be charged until the client
  -- accepts the policy themselves.
  insert into public.appointments (
    location_id, location_client_id, status, source, created_by_user_id, cancellation_policy_id
  ) values (
    p_location_id, p_location_client_id, 'confirmed', 'staff', auth.uid(), v_policy
  )
  returning id into v_appointment;

  if nullif(trim(p_notes), '') is not null then
    insert into public.appointment_notes (appointment_id, location_id, body)
    values (v_appointment, p_location_id, trim(p_notes));
  end if;

  begin
    insert into public.appointment_services (
      appointment_id, location_id, service_id, staff_id,
      starts_at, ends_at, hold_until, duration_minutes, price_cents, service_name
    ) values (
      v_appointment, p_location_id, p_service_id, p_staff_id,
      p_starts_at,
      p_starts_at + make_interval(mins => v_duration),
      p_starts_at + make_interval(mins => v_duration + v_buffer),
      v_duration, v_price, v_service.name
    );
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  perform private.audit(p_location_id, 'appointment.created_by_staff', 'appointment', v_appointment,
    jsonb_build_object('staff_id', p_staff_id, 'starts_at', p_starts_at));

  return v_appointment;
end;
$$;

create function public.mark_appointment_completed(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_starts_at timestamptz;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found or not private.can_manage_appointment(p_appointment_id, v_appt.location_id) then
    raise exception 'appointment_not_found';
  end if;

  select min(starts_at) into v_starts_at from public.appointment_services where appointment_id = p_appointment_id;
  if now() < v_starts_at then
    raise exception 'appointment_not_started';
  end if;

  update public.appointments set status = 'completed' where id = p_appointment_id;

  -- Reverting a no-show marked by mistake: the no-show fee must go away.
  if v_appt.status = 'no_show' then
    update public.booking_fees
    set status = case when status in ('pending', 'failed') then 'waived'::public.fee_status else status end,
        refund_requested_at = case when status = 'succeeded' then now() else refund_requested_at end,
        resolved_by_user_id = auth.uid()
    where appointment_id = p_appointment_id and kind = 'no_show';
  end if;

  perform private.audit(v_appt.location_id, 'appointment.completed', 'appointment', p_appointment_id,
    jsonb_build_object('previous_status', v_appt.status));
end;
$$;

create function public.mark_no_show(p_appointment_id uuid, p_charge_fee boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_loc public.locations%rowtype;
  v_policy public.cancellation_policies%rowtype;
  v_starts_at timestamptz;
  v_price int;
  v_fee_cents int := 0;
  v_fee uuid;
begin
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found or not private.can_manage_appointment(p_appointment_id, v_appt.location_id) then
    raise exception 'appointment_not_found';
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'appointment_not_confirmed';
  end if;

  select * into v_loc from public.locations where id = v_appt.location_id;
  select min(starts_at), sum(price_cents)::int into v_starts_at, v_price
  from public.appointment_services where appointment_id = p_appointment_id;

  if now() < v_starts_at + make_interval(mins => v_loc.no_show_grace_minutes) then
    raise exception 'too_early_for_no_show';
  end if;

  update public.appointments set status = 'no_show' where id = p_appointment_id;

  -- Staff explicitly chooses whether to charge (docs/03), and only if the
  -- client accepted the policy.
  if p_charge_fee and v_appt.policy_accepted_at is not null then
    select * into v_policy from public.cancellation_policies where id = v_appt.cancellation_policy_id;
    v_fee_cents := private.fee_cents(v_policy.no_show_fee_type, v_policy.no_show_fee_value, v_price);
  end if;

  if v_fee_cents > 0 then
    insert into public.booking_fees (
      appointment_id, location_id, location_client_id, kind, amount_cents, currency, created_by_user_id
    ) values (
      v_appt.id, v_appt.location_id, v_appt.location_client_id, 'no_show', v_fee_cents, v_loc.currency, auth.uid()
    )
    returning id into v_fee;
  end if;

  perform private.audit(v_appt.location_id, 'appointment.no_show', 'appointment', v_appt.id,
    jsonb_build_object('charge_requested', p_charge_fee, 'fee_cents', v_fee_cents, 'fee_id', v_fee));

  return jsonb_build_object('status', 'no_show', 'fee_cents', v_fee_cents, 'fee_id', v_fee);
end;
$$;

create function public.waive_fee(p_fee_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee public.booking_fees%rowtype;
  v_result text;
begin
  select * into v_fee from public.booking_fees where id = p_fee_id for update;
  if not found or not private.has_location_role(v_fee.location_id, '{manager,reception}') then
    raise exception 'fee_not_found';
  end if;

  if v_fee.status in ('pending', 'failed') then
    update public.booking_fees
    set status = 'waived', resolved_by_user_id = auth.uid()
    where id = p_fee_id;
    v_result := 'waived';
  elsif v_fee.status = 'succeeded' then
    -- Already charged: the payments worker issues the Stripe refund.
    update public.booking_fees
    set refund_requested_at = coalesce(refund_requested_at, now()), resolved_by_user_id = auth.uid()
    where id = p_fee_id;
    v_result := 'refund_requested';
  else
    raise exception 'fee_already_resolved';
  end if;

  perform private.audit(v_fee.location_id, 'fee.' || v_result, 'booking_fee', p_fee_id,
    jsonb_build_object('amount_cents', v_fee.amount_cents));
  return v_result;
end;
$$;

create function public.publish_cancellation_policy(
  p_location_id uuid,
  p_free_cancellation_hours int,
  p_late_cancel_fee_type public.fee_type,
  p_late_cancel_fee_value int,
  p_no_show_fee_type public.fee_type,
  p_no_show_fee_value int,
  p_policy_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy uuid;
begin
  if not private.has_location_role(p_location_id, '{manager}') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- Serialize versioning per location.
  perform 1 from public.locations where id = p_location_id for update;

  insert into public.cancellation_policies (
    location_id, version, free_cancellation_hours,
    late_cancel_fee_type, late_cancel_fee_value, no_show_fee_type, no_show_fee_value,
    policy_text, created_by
  )
  select p_location_id, coalesce(max(version), 0) + 1, p_free_cancellation_hours,
         p_late_cancel_fee_type, p_late_cancel_fee_value, p_no_show_fee_type, p_no_show_fee_value,
         nullif(trim(p_policy_text), ''), auth.uid()
  from public.cancellation_policies where location_id = p_location_id
  returning id into v_policy;

  perform private.audit(p_location_id, 'policy.published', 'cancellation_policy', v_policy);
  return v_policy;
end;
$$;

-- ============================================================
-- Row Level Security and grants
-- ============================================================
alter table public.cancellation_policies enable row level security;
alter table public.location_clients enable row level security;
alter table public.client_payment_methods enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_notes enable row level security;
alter table public.appointment_services enable row level security;
alter table public.booking_fees enable row level security;
alter table public.audit_log enable row level security;

revoke all on
  public.cancellation_policies, public.location_clients, public.client_payment_methods,
  public.appointments, public.appointment_notes, public.appointment_services,
  public.booking_fees, public.audit_log
from anon, authenticated;

-- Policies are public for active locations: clients read them before booking.
create policy "read" on public.cancellation_policies
  for select to anon, authenticated
  using (private.is_location_public(location_id) or private.is_location_member(location_id));
grant select on public.cancellation_policies to anon, authenticated;

-- CRM: staff only. Clients reach their data through appointments.
create policy "members read" on public.location_clients
  for select to authenticated using (private.is_location_member(location_id));
create policy "members insert" on public.location_clients
  for insert to authenticated with check (private.is_location_member(location_id));
create policy "members update" on public.location_clients
  for update to authenticated
  using (private.is_location_member(location_id))
  with check (private.is_location_member(location_id));
grant select on public.location_clients to authenticated;
grant insert (location_id, first_name, last_name, phone, email, notes, allergies)
  on public.location_clients to authenticated;
grant update (first_name, last_name, phone, email, notes, allergies, is_blocked, blocked_reason)
  on public.location_clients to authenticated;

create policy "read" on public.client_payment_methods
  for select to authenticated
  using (private.is_location_member(location_id) or private.is_location_client(location_client_id));
grant select on public.client_payment_methods to authenticated;

create policy "read" on public.appointments
  for select to authenticated
  using (private.is_location_member(location_id) or private.is_location_client(location_client_id));
grant select on public.appointments to authenticated;

create policy "read" on public.appointment_services
  for select to authenticated
  using (private.is_location_member(location_id) or private.is_appointment_client(appointment_id));
grant select on public.appointment_services to authenticated;

create policy "members read" on public.appointment_notes
  for select to authenticated using (private.is_location_member(location_id));
create policy "members insert" on public.appointment_notes
  for insert to authenticated with check (private.is_location_member(location_id));
create policy "members update" on public.appointment_notes
  for update to authenticated
  using (private.is_location_member(location_id))
  with check (private.is_location_member(location_id));
create policy "members delete" on public.appointment_notes
  for delete to authenticated using (private.is_location_member(location_id));
grant select, delete on public.appointment_notes to authenticated;
grant insert (appointment_id, location_id, body) on public.appointment_notes to authenticated;
grant update (body) on public.appointment_notes to authenticated;

create policy "read" on public.booking_fees
  for select to authenticated
  using (private.is_location_member(location_id) or private.is_location_client(location_client_id));
grant select on public.booking_fees to authenticated;

create policy "managers read" on public.audit_log
  for select to authenticated
  using (location_id is not null and private.has_location_role(location_id, '{manager}'));
grant select on public.audit_log to authenticated;

-- Function privileges: helpers used by policies need API-role EXECUTE;
-- RPCs are granted one by one.
grant execute on function
  private.is_location_client(uuid),
  private.is_appointment_client(uuid)
to anon, authenticated;

grant execute on function
  public.get_available_slots(uuid, uuid, date, date, uuid)
to anon, authenticated;

grant execute on function
  public.book_appointment(uuid, uuid, timestamptz, uuid, boolean, text),
  public.get_cancellation_quote(uuid),
  public.cancel_appointment(uuid, text),
  public.reschedule_appointment(uuid, timestamptz, uuid),
  public.create_staff_appointment(uuid, uuid, uuid, uuid, timestamptz, text),
  public.mark_appointment_completed(uuid),
  public.mark_no_show(uuid, boolean),
  public.waive_fee(uuid),
  public.publish_cancellation_policy(uuid, int, public.fee_type, int, public.fee_type, int, text)
to authenticated;

revoke execute on function public.confirm_pending_appointment(uuid) from anon, authenticated;
grant execute on function public.confirm_pending_appointment(uuid) to service_role;
