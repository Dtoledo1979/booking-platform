@AGENTS.md

# Project notes

- Product spec lives in `docs/01..05` (Spanish). Read the relevant doc before
  changing data model, booking, cancellation or payment logic.
- The brand name is provisional: use `brand` from `src/config/brand.ts`, never
  hardcode the product name.
- Money is integer cents + currency; times are `timestamptz`, displayed in the
  location's timezone (not the browser's).
- Writes to appointments, fees, payment methods, subscriptions and memberships
  go through server code (Edge Functions / security definer RPCs), never
  directly from the browser.
- Database changes are Supabase CLI migrations in `supabase/migrations`.
- Database tests are pgTAP files in `supabase/tests/database`. No Docker on
  this machine: run them against the linked dev project with
  `npm run test:db` (each file rolls back). Run `supabase db advisors --linked`
  after every migration.
