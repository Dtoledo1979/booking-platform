-- Location pages live at /{slug}, so any top-level app route must be
-- reserved. Adds the style guide and routes we expect to need soon.
alter table public.locations drop constraint locations_slug_check1;
alter table public.locations add constraint locations_slug_reserved check (slug <> all (array[
  'about', 'account', 'admin', 'api', 'app', 'auth', 'blog', 'book', 'booking', 'bookings',
  'business', 'contact', 'dashboard', 'design', 'for-business', 'help', 'login', 'logout',
  'my-bookings', 'onboarding', 'pricing', 'privacy', 'settings', 'signup', 'static',
  'styleguide', 'support', 'terms', 'www'
]));
