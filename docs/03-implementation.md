# Implementation Plan: Association Dues & Remittance Tracking App

**Status:** Draft for execution
**Date:** 2026-07-17
**Depends on:** `01-research.md`, `02-plan.md`

This document turns `02-plan.md`'s milestones into concrete, ordered build tasks. It's written to be executed milestone-by-milestone with Claude Code — each milestone ends in something demoable, and should be committed before moving to the next.

---

## 0. Prerequisites (do before M0)

- [ ] Create a Supabase project (free tier is sufficient for ~120 members).
- [ ] Create a Vercel account and connect it to the repo (GitHub recommended so pushes auto-deploy).
- [ ] Decide on a project/repo name (e.g. `naom-dues` — adjust if the association has a different short name than the folder suggests).
- [ ] Have the Supabase project URL + anon key + service role key ready (Settings → API).

---

## M0 — Project Setup

**Goal:** empty-but-real app deployed and reachable on a phone.

1. Scaffold: `npx create-next-app@latest` — TypeScript, App Router, Tailwind CSS, `src/` directory, ESLint.
2. Install & init `shadcn/ui`; pull in the base component set we'll need early: `button`, `card`, `badge`, `input`, `form`, `dialog`, `table`, `avatar`, `toast`/`sonner`.
3. Install `@supabase/supabase-js` and `@supabase/ssr` for server/client Supabase clients.
4. Set up env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client). Add `.env.local` to `.gitignore` (verify it's there by default).
5. PWA skeleton: `manifest.json` (name, short_name, icons — placeholder icon until logo arrives, theme_color/background_color using the placeholder palette from plan §4), a minimal service worker (can start with `next-pwa` or a hand-written one — prefer `next-pwa` for speed, it's a well-trodden path).
6. Apply the placeholder design tokens from plan §4 into `tailwind.config.ts` (extend the color palette with named tokens: `primary`, `accent`, `supporting`, plus semantic `status-paid`/`status-partial`/`status-overdue`) — reference tokens by name everywhere, not raw hex, so the eventual logo-driven palette swap is a one-file change.
7. Deploy to Vercel, connect env vars there too. Confirm the empty app loads on a phone and "Add to Home Screen" works.

**Demo check:** app is live at a URL, installable, shows a placeholder home page styled with the brand tokens.

---

## M1 — Data & Auth

**Goal:** schema live in Supabase, RLS enforced, both admins can log in.

1. Write SQL migrations for every table in plan §2 (`members`, `admins`, `dues_config`, `contribution_periods`, `payments`, `payment_allocations`, `notifications`). Use Supabase's migration workflow (`supabase/migrations/*.sql`) rather than hand-editing via the dashboard, so schema is version-controlled.
2. Create the `member_period_status` view (derived status per plan §2 — computed from `payment_allocations` vs `contribution_periods.dues_amount`, never a stored column).
3. Write RLS policies:
   - `members`: a row is readable/writable by the member it belongs to (`auth_user_id = auth.uid()`) or by any row in `admins` matching the current user.
   - `payments`, `payment_allocations`: same pattern — member sees only their own; admins see all.
   - `admins`, `dues_config`, `contribution_periods`: admin-only read/write; members can read `contribution_periods`/`dues_config` (they need to know the amount) but not write.
4. Configure Supabase Auth: enable magic-link (and/or phone OTP if SMS is viable in Nigeria — magic link via email is the simpler MVP default) sign-in.
5. Seed data: insert the developer and treasurer as rows in `admins`, linked to their `auth_user_id` after first login. Insert an initial `dues_config` row and generate `contribution_periods` for the current month forward (a small script or SQL that can be re-run monthly, or a scheduled Supabase Edge Function later — manual for MVP is fine).
6. Build the Login screen (email input → magic link) and a minimal authenticated shell (top bar with the app name, sign-out).
7. Build role-based routing: after login, redirect admins to `/admin`, members to `/dashboard`. A user with no `members` or `admins` row (not yet invited) sees a clear "not registered" state rather than a broken page.

**Demo check:** developer and treasurer can both log in and land on an (empty) admin view; RLS is verified by confirming a member's Supabase session genuinely cannot read another member's `payments` row (test this directly, not just through the UI).

---

## M2 — Member Submit Flow

**Goal:** a member can submit proof of payment.

1. Member Dashboard shell (plan §3.2): current-month status badge (query `member_period_status` for the logged-in member + current period), arrears summary, "Submit a payment" button, last-3-payments preview.
2. Submit Payment screen: amount, date picker (default today), receipt image input (`<input type="file" accept="image/*" capture>` for camera access on mobile), optional note textarea.
3. Client-side image compression before upload (e.g. `browser-image-compression`) — keep uploads small given §6 low-bandwidth requirement.
4. Upload flow: image → Supabase Storage (private bucket, path scoped by member id), then insert a `payments` row with `source = 'member_submitted'`, `status = 'pending'`, `receipt_url` = storage path.
5. Payment History screen: list the member's `payments` joined with their `payment_allocations`/periods, status badge per entry, rejection reason shown if rejected.

**Demo check:** a test member account can submit a payment with a photo and see it appear as "Pending" in their history.

---

## M3 — Admin Verify Flow

**Goal:** admin can review and resolve submissions, including the multi-month allocation case.

1. Verification Queue: list all `payments` where `status = 'pending'`, most recent first, showing member name, amount, date, and a thumbnail.
2. Detail/verify dialog: full-size receipt image, amount, editable allocation UI — default allocation is oldest-unpaid-first (auto-compute which periods this member owes and greedily fill from the payment amount), admin can adjust before confirming.
3. Approve action: transactionally (a Postgres function or a single RPC call, not multiple round-trips prone to partial failure) — insert `payment_allocations` rows per the chosen breakdown, set `payments.status = 'verified'`, `verified_by`, `verified_at`.
4. Reject action: require a reason, set `status = 'rejected'`, `rejection_reason`; no allocations created.
5. Wire the (not-yet-built) notification trigger point here as a stub/TODO — real send happens in M6, but the call site belongs in this transaction.

**Demo check:** a pending submission can be approved with a correct, admin-confirmed period allocation, and rejected with a reason; both outcomes are visible in the member's history from M2.

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
- **Scope discipline:** anything not in M0–M7 (online payment gateway, WhatsApp Cloud API reminders, multi-admin roles/audit log, exports/reports) is explicitly Phase 2 per `01-research.md` §5/§7 — resist pulling it forward mid-build.

## Definition of Done (MVP)

- [ ] All of M0–M7 demo checks pass.
- [ ] Developer + treasurer have both used the real flow once with real (or realistic seeded) data.
- [ ] RLS manually verified — a member account cannot read another member's data.
- [ ] App is installed on at least one real Android and one real iOS phone, confirmed push notifications work on both (noting the iOS install-first caveat from plan §7/§5).
- [ ] Placeholder brand colors are either already swapped for real ones, or there's a clear one-file path to do so once the logo arrives.
