# Implementation status

Implemented: React + Vite frontend, Express API, Supabase schema/RLS/Storage policies, audited database commands, staff account function (`manage-staff`), instrument tracking, administrator controls, Arabic/English responsive interface, automated tests.

## Live environment

- Render service `taqeem` (free, Singapore) serves the frontend and API. Auto deploy is OFF: deploy manually after merging to `main`.
- Supabase project `ltzfqpuoyrktfrxgbklf` (free). Migrations are applied manually in the SQL Editor, in order:
  1. `001_sterilog.sql` — applied.
  2. `20261105124919_instrument_tracking.sql` — applied.
  3. `20261106090000_staff_admin_controls.sql` — apply before using account deactivation, branch removal or program retirement. It only adds the `public.admin_ops` function; it changes no existing data.

## Clinical approval requirement (since instrument tracking)

Any cycle decision (approve, hold, reject) needs, in that branch: reviewer or branch_admin membership, AND an active, unexpired `approve` tracking qualification. A system administrator also needs branch membership to decide cycles.

## Verified

- Automated tests (PGlite database, HTTP, domain, account function) and production build.
- Render deploy of the tracking merge is live; tracking tables exist and are not readable anonymously.

## Not yet verified in the live environment

- Owner sign-in, staff creation and per-branch isolation with real accounts.
- A full supervised cycle and instrument handover with named staff.
- Camera QR scanning on target phones/iPads and label printing.

No claim of clinical or regulatory approval is made; the facility must review programs, criteria and manufacturer instructions.
