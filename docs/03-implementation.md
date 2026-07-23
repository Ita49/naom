# Implementation Plan: Association Dues & Remittance Tracking App

**Status:** Draft for execution
**Date:** 2026-07-17
**Depends on:** `01-research.md`, `02-plan.md`

This document turns `02-plan.md`'s milestones into concrete, ordered build tasks. It's written to be executed milestone-by-milestone with Claude Code — each milestone ends in something demoable, and should be committed before moving to the next.

---

## 0. Prerequisites (do before M0)

- [x] Create a Supabase project (free tier is sufficient for ~120 members). — project `naom` (ref `qiugmfjepbfkldwdjsno`), region `eu-central-1`.
- [x] Create a Vercel account and connect it to the repo (GitHub recommended so pushes auto-deploy). — repo `github.com/Ita49/naom`, Vercel project `itagodwin-4463s-projects/naom`.
- [x] Decide on a project/repo name (e.g. `naom-dues` — adjust if the association has a different short name than the folder suggests). — `naom`.
- [x] Have the Supabase project URL + anon key + service role key ready (Settings → API). — in `.env.local` (gitignored) and mirrored into Vercel's Production/Preview/Development env vars.

---

## M0 — Project Setup ✅ Complete (2026-07-18)

**Goal:** empty-but-real app deployed and reachable on a phone.

1. [x] Scaffold: `npx create-next-app@latest` — TypeScript, App Router, Tailwind CSS, `src/` directory, ESLint.
2. [x] Install & init `shadcn/ui`; pull in the base component set we'll need early: `button`, `card`, `badge`, `input`, `form`, `dialog`, `table`, `avatar`, `toast`/`sonner`. (Shadcn's `form` component is deprecated upstream in favor of `field` — installed `field` + `label` instead, same purpose.)
3. [x] Install `@supabase/supabase-js` and `@supabase/ssr` for server/client Supabase clients. Browser/server/middleware helpers live in `src/lib/supabase/`.
4. [x] Set up env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client). Add `.env.local` to `.gitignore` (verify it's there by default).
5. [x] PWA skeleton: `manifest.json` (name, short_name, icons — placeholder icon until logo arrives, theme_color/background_color using the placeholder palette from plan §4), a minimal service worker. Hand-written instead of `next-pwa`: this scaffold defaults to Turbopack, which `next-pwa`'s webpack plugin doesn't support.
6. [x] Apply the placeholder design tokens from plan §4 (Tailwind v4 uses CSS-based theming, so tokens live in `src/app/globals.css` rather than `tailwind.config.ts` — same effect, named tokens: `primary`, `accent`, `supporting`, `status-paid`/`status-partial`/`status-overdue`) — reference tokens by name everywhere, not raw hex, so the eventual logo-driven palette swap is a one-file change.
7. [x] Deploy to Vercel, connect env vars there too. Confirmed live at https://naom-one.vercel.app — home page, manifest, and service worker all verified reachable (200s) after wiring the env vars (first deploy 500'd on every route because the Vercel project had no env vars configured yet — fixed by adding them via `vercel env add` across Production/Preview/Development and redeploying).

**Demo check:** ✅ app is live at https://naom-one.vercel.app, installable, shows a placeholder home page styled with the brand tokens. Verified programmatically (home/manifest/service worker all 200); user to confirm phone "Add to Home Screen" install directly.

---

## M1 — Data & Auth ✅ Complete (2026-07-18)

**Goal:** schema live in Supabase, RLS enforced, both admins can log in.

1. [x] Write SQL migrations for every table in plan §2 (`members`, `admins`, `dues_config`, `contribution_periods`, `payments`, `payment_allocations`, `notifications`). Use Supabase's migration workflow (`supabase/migrations/*.sql`) rather than hand-editing via the dashboard, so schema is version-controlled.
2. [x] Create the `member_period_status` view (derived status per plan §2 — computed from `payment_allocations` vs `contribution_periods.dues_amount`, never a stored column). Created with `security_invoker = true` — without it, a Postgres view runs as its owner and silently bypasses RLS on the tables it queries.
3. [x] Write RLS policies:
   - `members`: a row is readable/writable by the member it belongs to (`auth_user_id = auth.uid()`) or by any row in `admins` matching the current user.
   - `payments`, `payment_allocations`: same pattern — member sees only their own; admins see all.
   - `admins`, `dues_config`, `contribution_periods`: admin-only read/write; members can read `contribution_periods`/`dues_config` (they need to know the amount) but not write.
   - No delete policy on any table — RLS defaults to deny, giving soft-edit-history-not-hard-deletes (research §6) for free.
4. [x] Configure Supabase Auth: magic-link email sign-in was already enabled by default; updated `site_url`/redirect allow-list to include the production domain (only had `localhost` before).
5. [x] Seed data: developer (`ita.godwin@gmail.com`) and treasurer (`chimaebano@yahoo.co.uk`) seeded as `admins` rows, auto-linked to `auth_user_id` on first login via a `handle_new_user()` trigger on `auth.users` (matches by email — see deviation note below). `dues_config` seeded at ₦5,000/month; 12 `contribution_periods` generated (Jul 2026 – Jun 2027).
6. [x] Build the Login screen (email input → magic link) and a minimal authenticated shell (top bar with the app name, sign-out).
7. [x] Build role-based routing: after login, admins → `/admin`, members → `/dashboard`. A user with no `members`/`admins` row lands on `/not-registered`.

**Deviations from plan §2** (both necessary for the M1 step 5 invite-then-link flow to work at all — the plan's schema had no way to match a first-time login back to a pre-seeded row): `admins` gained an `email` column; `members.email` and `admins.email` both got case-insensitive unique indexes.

**Demo check:** ✅ Both admins seeded; the magic-link verification code path (`/auth/v1/verify` → session) was exercised end-to-end programmatically and confirmed working. RLS was verified directly, not just through the UI — two throwaway test members with real auth sessions were created via the service-role key, and it was confirmed via raw PostgREST calls that member A's session returns *only* member A's `payments` row (list query and a direct id lookup of member B's row both correctly return nothing), and that a member session cannot read the `admins` table at all. Test data was deleted afterward — production seed data (2 admins, 0 members) confirmed clean. Still to do: the developer/treasurer should each click a real magic-link email through the deployed app once, to confirm the actual UI click-through (not just the API) end to end.

---

## M2 — Member Submit Flow ✅ Complete (2026-07-23)

**Goal:** a member can submit proof of payment.

1. [x] Member Dashboard shell (plan §3.2): current-month status badge (query `member_period_status` for the logged-in member + current period), arrears summary, "Submit a payment" button, last-3-payments preview.
2. [x] Submit Payment screen: amount, date picker (default today), receipt image input (`<input type="file" accept="image/*" capture>` for camera access on mobile), optional note textarea. Receipt is optional per research §5 (the admin verify flow in M3, not the upload itself, is the actual trust gate).
3. [x] Client-side image compression before upload (`browser-image-compression`, target ~0.5MB / 1600px) — keeps uploads small given §6 low-bandwidth requirement.
4. [x] Upload flow: image → Supabase Storage (private `receipts` bucket, path scoped by member id folder), then insert a `payments` row with `source = 'member_submitted'`, `status = 'pending'`, `receipt_url` = storage path.
5. [x] Payment History screen: list the member's `payments` joined with their `payment_allocations`/periods, status badge per entry, rejection reason shown if rejected, signed URL to view the receipt.

**Demo check:** ✅ Verified directly against the real backend (not just the UI): a throwaway test member uploaded a receipt to their own storage folder (succeeded), was denied uploading into another member's folder and denied reading another member's receipt (both 403), submitted a payment that landed as `source=member_submitted`/`status=pending`, and was denied when attempting to insert a payment claiming `source=admin_manual` (RLS blocks members from spoofing provenance). Test data deleted afterward — confirmed 0 members/payments/receipt objects remain in production.

---

## M3 — Admin Verify Flow ✅ Complete (2026-07-23)

**Goal:** admin can review and resolve submissions, including the multi-month allocation case.

1. [x] Verification Queue: list all `payments` where `status = 'pending'`, most recent first, showing member name, amount, date, and a thumbnail.
2. [x] Detail/verify dialog: full-size receipt image, amount, editable allocation UI — default allocation is oldest-unpaid-first (`computeDefaultAllocation()` in `src/lib/allocation.ts`, unit tested since the cross-cutting notes below flag it as the highest-risk logic), admin can adjust before confirming.
3. [x] Approve action: a single Postgres function (`approve_payment`), not multiple round-trips — inserts `payment_allocations` rows per the chosen breakdown and sets `payments.status = 'verified'`, `verified_by`, `verified_at` atomically.
4. [x] Reject action (`reject_payment`): requires a reason, sets `status = 'rejected'`, `rejection_reason`; no allocations created.
5. [x] Notification trigger points left as `TODO(M6)` comments at the exact call sites inside both functions.

**Demo check:** ✅ Verified directly against the real backend: approved an ₦8,000 payment, split 5,000/3,000 across two periods, confirmed the exact allocation rows landed and `payments.status/verified_by/verified_at` were set correctly; rejected a payment with a reason and confirmed it stored correctly; confirmed the function itself refuses an empty rejection reason; and confirmed a non-admin member cannot approve even their own payment (blocked by RLS before the function's own admin check even runs — `SELECT ... FOR UPDATE` requires the UPDATE policy to pass, not just SELECT). Test data deleted afterward.

---

## M4 — Dashboards & Roster

**Goal:** the "at a glance" views that are the actual point of this app.

1. Admin Dashboard: this month's collection % and ₦ total (query across all members' current-period allocations vs. `dues_amount × active member count`), count of members in arrears, pending-queue count (links to M3's queue), recent activity feed (latest verified/rejected payments).
2. Member Roster: table of all members — name, current-month status badge, total ₦ in arrears — searchable by name, filterable by status. Use the `member_period_status` view joined across periods to compute "total arrears."
3. Member Detail (admin view): full payment/allocation history for one member, plus manual actions entry points (record-on-behalf, backfill — wired to M5, deactivate member).
4. Sanity-check the Member Dashboard (built in M2) against real multi-admin, multi-member data now that there's more than one test member — this is where allocation edge cases (payment spanning periods with different `dues_amount`, if the config ever changed) tend to surface.

**Demo check:** with ~5–10 seeded test members in varied states (paid, partial, unpaid, in arrears), both dashboards and the roster present an accurate, correctly-computed picture.

---

## M5 — Backfill Tool

**Goal:** historical arrears/payments can be entered without going through the receipt-verify flow.

1. Backfill entry screen (from Member Detail): admin enters an amount and either lets the system auto-allocate oldest-unpaid-first or manually picks periods, same allocation mechanic as M3's approve action — reuse that component/logic rather than re-implementing it.
2. On save: insert a `payments` row with `source = 'admin_backfill'`, `status = 'verified'` directly, `receipt_url = null`, plus its `payment_allocations`.
3. Visually distinguish backfilled entries in history views (e.g. a small "Backfilled" tag) so it's always clear which records came from actual receipts vs. admin assertion.

**Demo check:** admin can back-date a member's arrears for, say, the 3 months before launch, and that member's dashboard/roster status immediately reflects it correctly.

---

## M6 — Notifications

**Goal:** the three MVP web-push notifications fire correctly.

1. Notification permission prompt: shown once, right after a member's first successful login, with a one-line explanation before the browser's native permission dialog (asking cold with no context tends to get denied).
2. Service worker push handler + a `notifications` table write on every send (audit trail, and prevents duplicate sends).
3. **Payment verified / rejected**: trigger from the M3 approve/reject action (the stub point left there) — immediate push to the member.
4. **Due-date reminder**: a scheduled job (Supabase Edge Function on a cron schedule, or a Vercel Cron hitting an API route) that runs a few days before month-end, queries members without a `paid` status for the current period, and pushes a reminder to each — skip anyone already notified this period (check `notifications` log).
5. **Overdue nudge**: similar scheduled job, run early in a new month for anyone still unpaid for the *previous* period.

**Demo check:** approving a test payment triggers a real push notification on a phone with the PWA installed; manually triggering the reminder job sends to an unpaid test member and not to a paid one.

---

## M7 — Polish & Install

**Goal:** ready for the association to actually start using it.

1. PWA install pass: proper icon set (multiple sizes), splash screens, `theme_color`/`background_color` finalized, offline fallback page (at minimum, don't show a broken white screen with no network).
2. **Swap in real brand colors/logo** the moment they're available — this is the one-file change plan §4 was designed for (`tailwind.config.ts` token values + manifest icons).
3. Empty states (new member with no payments yet, admin roster before any members are invited) and error states (upload failure, network failure on submit) — these get hit immediately by real users and are worth real attention, not placeholder "Error" text.
4. Basic input validation throughout (amount > 0, date not in the future, etc.) — client-side for UX, but never trust it as the security boundary; the RLS policies from M1 remain the real boundary.
5. Walk the developer + treasurer through the real flow end-to-end once with the actual association's data before inviting the full ~100 members — this is the point to catch anything the plan missed.

**Demo check:** a non-technical treasurer can, unassisted, verify a real payment and read the dashboard correctly.

---

## Cross-cutting notes

- **Testing approach:** given the small scale (~120 members, 2 admins), full E2E test infrastructure is likely overkill for MVP. Prioritize: (a) unit tests for the allocation logic (oldest-unpaid-first computation, partial-payment math) since it's the trickiest and most bug-prone piece, (b) manual QA per milestone's demo check above, (c) direct RLS verification (M1) since a policy bug is a data-leak, not just a UI bug.
- **Commit discipline:** commit at the end of each milestone, not mid-milestone — keeps the history matching this document's structure and makes it easy to see what shipped when.
- **Scope discipline:** anything not in M0–M7 (online payment gateway, WhatsApp Cloud API reminders, multi-admin roles/audit log, exports/reports, bar consumption tracking + Bar Attendant role — see `02-plan.md` §6a) is explicitly Phase 2 per `01-research.md` §5/§7 — resist pulling it forward mid-build.

## Definition of Done (MVP)

- [ ] All of M0–M7 demo checks pass.
- [ ] Developer + treasurer have both used the real flow once with real (or realistic seeded) data.
- [ ] RLS manually verified — a member account cannot read another member's data.
- [ ] App is installed on at least one real Android and one real iOS phone, confirmed push notifications work on both (noting the iOS install-first caveat from plan §7/§5).
- [ ] Placeholder brand colors are either already swapped for real ones, or there's a clear one-file path to do so once the logo arrives.
