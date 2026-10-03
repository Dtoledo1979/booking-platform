-- ============================================================
-- Slug availability for signup.
--
-- The reserved list now lives in one immutable function used by both the
-- table constraint and the availability check, so they can't drift apart.
-- ============================================================
create function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Top-level app routes: location pages live at /{slug}.
  select p_slug = any (array[
    'about', 'account', 'admin', 'api', 'app', 'auth', 'blog', 'book', 'booking', 'bookings',
    'business', 'contact', 'dashboard', 'design', 'for-business', 'help', 'login', 'logout',
    'my-bookings', 'onboarding', 'pricing', 'privacy', 'settings', 'signup', 'static',
    'styleguide', 'support', 'terms', 'www'
  ]);
$$;

alter table public.locations drop constraint locations_slug_reserved;
alter table public.locations add constraint locations_slug_reserved
  check (not private.is_reserved_slug(slug));

-- Signup needs to know whether a slug is free, but other businesses' draft
-- locations are invisible under RLS. This answers yes/no only and never
-- reveals which business holds a slug.
create function public.is_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     and char_length(p_slug) between 3 and 60
     and not private.is_reserved_slug(p_slug)
     and not exists (select 1 from public.locations where slug = p_slug);
$$;

grant execute on function public.is_slug_available(text) to anon, authenticated;
