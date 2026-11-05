# Instrument tracking rollout / تشغيل تتبع الأدوات

This is an additive change based on main a51781dc8a389628663946f558f7670ce6c75fd0.

## Safe rollout

1. Run `npm ci`, `npm test`, `npm run build` in an isolated checkout. New database integration tests use ephemeral PGlite, synthetic identities and synthetic clinical criteria; no production database is used by tests.
2. Inspect the real schema, table counts, RLS and existing data before migration. Obtain a managed backup/export through the owner's authorised provider path. Never reset the database or rerun 001_sterilog.sql.
3. Apply only `supabase/migrations/20261105124919_instrument_tracking.sql`, in its transaction. It adds tracking tables, RLS, guarded RPC, clinical approval and invalidation triggers. It retains existing accounts/cycles. Device codes 05 and 06 are added inactive/unassigned if absent. It does NOT assume how existing devices are distributed or invent device models/programs.
4. Deploy UI/server together after migration; auto deploy was OFF on the existing Render service. Confirm health, login, both branch permissions, mobile and iPad. Physical QR camera scanning requires HTTPS and browser support; manual code lookup remains available. Browser printing supports optional QR and readable identifiers; actual printer/label sterilization compatibility is not validated.
5. Before clinical operation, administrator records clinics, doctors, boxes and nurse links. For each clinical task record the real approved training reference and expiry. A technical admin has no automatic approval permission. Existing reviewer/branch_admin membership is ALSO required for the legacy cycle decision endpoint.
6. Coverage requires exclusive duty for the full specified interval and qualification for every assigned task. `all` zone is only allowed for coverage with sequential work across areas. Assistance specifies one area and valid task list. Software records exclusive duty and blocks sending/collection during it; it cannot verify external staffing schedules.
7. Verify a supervised real handover with named staff; never label synthetic results as real. Prepare four actual devices for Buraydah and two for Unayzah without moving a device with history.

## Workflow

Clinic nurse confirms a shipment immediately. CSSD separately matches counts (sent/received/damaged), explaining exceptions. CSSD allocates received undamaged contents into packages with unique short codes; no cycle/device is fabricated. Each stage is recorded by its actor. Create a normal cycle draft, link packages, transcribe physical label identifiers, confirm labelling and record start. Linking aggregates package contents/count into the cycle. Enter actual final readings/report in existing cycle form, submit, independent authorised reviewer decides. Dispatch confirms ready only against the approved CURRENT cycle/version. Sending nurse collects individual ready packages; remaining packages and item quantities stay visible. Box return is a separate action permitting reuse with a fresh shipment number.

Holds/recalls block collection. Cycle revision or failed decision invalidates linked packages. An adverse BI result also holds/recalls packages. Reprocessing records the previous attempt snapshot, requires physical return of recalled packages, increments attempt and restarts stages without inventing a cycle. Cycle-wide recall is available. Handovers list unfinished packages and require recipient acknowledgement.

## Rollback

Redeploy the previous frontend/server commit to hide the new unit. Retain tracking tables and events. Do not drop tables, delete identities, or reverse device links. The clinical approval trigger intentionally remains fail-closed; restore legacy clinical behaviour only through an explicitly reviewed migration, never by disabling RLS or deleting evidence. Before any live migration preserve database backup/export according to provider capabilities; local tests are not a production backup.

## Limits

- No physical device control, printer protocol integration or patient linking.
- Camera support depends on native BarcodeDetector/browser; unsupported devices retain manual lookup.
- No claim of full browser/mobile E2E validation until actually performed in target environment.
- Training evidence and staffing are recorded declarations that require organisational review.
- Outstanding historical cycles remain; no retroactive packaging assumptions are generated.
