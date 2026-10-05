-- ============================================================
-- Team management: invite links, linking a login to a staff profile,
-- listing and removing members.
--
-- Invites are shareable links (no email provider yet). Only a SHA-256
-- hash of the token is stored, links expire after 14 days, and only the
-- invited email address can accept.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.memberships
  add column staff_id uuid,
  add column invite_token_hash text unique,
  add column invite_expires_at timestamptz,
  add column invited_by uuid references auth.users (id) on delete set null,
  -- A professional's login is tied to their bookable profile at the same location.
  add constraint memberships_staff_fk foreign key (staff_id, location_id)
    references public.staff (id, location_id) on delete set null (staff_id);

-- /invite/{token} is a top-level route, so it can't be a location slug.
create or replace function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'about', 'account', 'admin', 'api', 'app', 'auth', 'blog', 'book', 'booking', 'bookings',
    'business', 'contact', 'dashboard', 'design', 'for-business', 'help', 'invite', 'join', 'login',
    'logout', 'my-bookings', 'onboarding', 'pricing', 'privacy', 'settings', 'signup', 'static',
    'styleguide', 'support', 'team', 'terms', 'www'
  ]);
$$;

-- Owners may invite any staff role; managers only reception and professionals.
create function private.can_invite(p_location uuid, p_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role = 'owner' then false
    when p_role = 'manager' then private.is_org_owner((select organization_id from public.locations where id = p_location))
    else private.has_location_role(p_location, '{manager}')
  end;
$$;

create function public.create_invite(
  p_location_id uuid,
  p_email text,
  p_role public.member_role,
  p_staff_id uuid default null
)
returns text -- the raw token, shown once to build the link
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_token text;
begin
  if not private.can_invite(p_location_id, p_role) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email';
  end if;
  if p_role = 'professional' and p_staff_id is null then
    raise exception 'staff_required';
  end if;
  if p_staff_id is not null and not exists (
    select 1 from public.staff where id = p_staff_id and location_id = p_location_id and user_id is null
  ) then
    raise exception 'staff_unavailable';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.location_id = p_location_id and m.role = p_role and lower(u.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  -- Re-inviting replaces the previous link.
  delete from public.memberships
  where location_id = p_location_id and user_id is null and role = p_role and lower(invited_email) = v_email;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.memberships (
    organization_id, invited_email, role, location_id, staff_id,
    invite_token_hash, invite_expires_at, invited_by
  )
  select l.organization_id, v_email, p_role, l.id, p_staff_id,
         encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '14 days', auth.uid()
  from public.locations l where l.id = p_location_id;

  perform private.audit(p_location_id, 'member.invited', 'membership', null,
    jsonb_build_object('email', v_email, 'role', p_role, 'staff_id', p_staff_id));
  return v_token;
end;
$$;

-- What the invite page shows before signing in. Knowing the token is the
-- authorization, so this is callable anonymously.
create function public.get_invite(p_token text)
returns table (organization_name text, location_name text, role public.member_role, invited_email text, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, l.name, m.role, m.invited_email, m.invite_expires_at < now()
  from public.memberships m
  join public.locations l on l.id = m.location_id
  join public.organizations o on o.id = m.organization_id
  where m.user_id is null
    and m.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create function public.accept_invite(p_token text)
returns uuid -- location id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.memberships%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite from public.memberships
  where user_id is null and invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if v_invite.invite_expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if lower(v_invite.invited_email) <> v_email then
    raise exception 'invite_email_mismatch';
  end if;

  if exists (
    select 1 from public.memberships
    where user_id = v_user and role = v_invite.role and location_id = v_invite.location_id
  ) then
    delete from public.memberships where id = v_invite.id; -- already a member: just consume the link
  else
    update public.memberships
    set user_id = v_user, accepted_at = now(), invite_token_hash = null, invite_expires_at = null
    where id = v_invite.id;
  end if;

  if v_invite.staff_id is not null then
    update public.staff set user_id = v_user where id = v_invite.staff_id and user_id is null;
  end if;

  perform private.audit(v_invite.location_id, 'member.joined', 'membership', v_invite.id,
    jsonb_build_object('role', v_invite.role));
  return v_invite.location_id;
end;
$$;

-- Team list for owners and managers, with names and emails (which live in
-- auth.users and user_profiles, not readable through the API).
create function public.location_members(p_location_id uuid)
returns table (
  membership_id uuid,
  role public.member_role,
  status text, -- 'active' | 'invited' | 'expired'
  name text,
  email text,
  staff_id uuid,
  invite_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.role,
         case when m.user_id is not null then 'active'
              when m.invite_expires_at < now() then 'expired'
              else 'invited' end,
         nullif(trim(concat_ws(' ', up.first_name, up.last_name)), ''),
         coalesce(u.email, m.invited_email),
         m.staff_id,
         m.invite_expires_at
  from public.memberships m
  left join auth.users u on u.id = m.user_id
  left join public.user_profiles up on up.user_id = m.user_id
  where private.has_location_role(p_location_id, '{manager}')
    and (m.location_id = p_location_id
         or (m.role = 'owner' and m.organization_id = (select organization_id from public.locations where id = p_location_id)))
  order by (m.role = 'owner') desc, m.role, m.created_at;
$$;

create function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships%rowtype;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if not found or v_m.role = 'owner' or not private.can_invite(v_m.location_id, v_m.role) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.memberships where id = p_membership_id;
  -- Their bookable profile stays (appointments reference it) but loses the login.
  if v_m.user_id is not null then
    update public.staff set user_id = null where location_id = v_m.location_id and user_id = v_m.user_id;
  end if;

  perform private.audit(v_m.location_id, 'member.removed', 'membership', p_membership_id,
    jsonb_build_object('role', v_m.role, 'email', v_m.invited_email));
end;
$$;

grant execute on function private.can_invite(uuid, public.member_role) to authenticated;
grant execute on function
  public.create_invite(uuid, text, public.member_role, uuid),
  public.accept_invite(text),
  public.location_members(uuid),
  public.remove_member(uuid)
to authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;

-- invite_token_hash must never be readable through the API.
revoke select on public.memberships from authenticated;
grant select (id, organization_id, user_id, invited_email, role, location_id, accepted_at, created_at, staff_id)
  on public.memberships to authenticated;
