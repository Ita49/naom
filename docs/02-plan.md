# Plan: Association Dues & Remittance Tracking App

**Status:** Draft for review
**Date:** 2026-07-17
**Depends on:** `01-research.md` (domain model §4, stack §9, resolved questions §10)

---

## 1. Architecture Overview

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   Next.js App (PWA)      │  RLS   │           Supabase            │
│   - App Router           │◄──────►│  - Postgres (schema below)    │
│   - Tailwind + shadcn/ui │        │  - Auth (magic link / OTP)    │
│   - Service worker       │        │  - Storage (receipt images)   │
│   - Web Push             │        │  - Row-Level Security         │
└───────────┬──────────────┘        └──────────────────────────────┘
            │
            ▼
      Vercel hosting
```

- All data access goes through Supabase's client SDK from Next.js server components/route handlers — no separate backend service.
- **Row-Level Security is the actual access-control boundary**, not app-layer checks alone: a member's Postgres session can only ever `SELECT` their own `payments`/`allocations` rows; admins get a separate policy granting full read/write. This matters because the data is financial.
- Receipt images go to Supabase Storage in a private bucket; signed URLs are generated on demand, never public.

## 2. Data Model

Building directly on `01-research.md` §4 (Member / Period / Payment / Allocation).

```sql
-- People
members (
  id uuid pk,
  auth_user_id uuid references auth.users, -- null until they accept an invite
  full_name text,
  phone text,
  email text,
  status text check in ('active','inactive'),
  joined_at date,
  created_at timestamptz
)

admins (
  id uuid pk,
  auth_user_id uuid references auth.users,
  full_name text,
  role text default 'admin'  -- single role for MVP per resolved Q3
)

-- Dues configuration (fixed amount, but modeled as time-effective per resolved Q2)
dues_config (
  id uuid pk,
  amount numeric,
  effective_from date,       -- allows a future increase without a migration
  created_at timestamptz
)

-- Contribution periods (one row per calendar month, generated ahead or lazily)
contribution_periods (
  id uuid pk,
  period_month date,          -- normalized to first-of-month, e.g. 2026-07-01
  dues_amount numeric,        -- snapshot of dues_config at period creation
  unique(period_month)
)

-- A single act of paying money
payments (
  id uuid pk,
  member_id uuid references members,
  amount numeric,
  paid_at date,                -- date member says they paid
  receipt_url text,            -- storage path, nullable for backfilled/cash entries
  note text,                   -- e.g. "covers May-July"
  source text check in ('member_submitted','admin_backfill','admin_manual'),
  status text check in ('pending','verified','rejected'),
  submitted_at timestamptz,
  verified_by uuid references admins,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz
)

-- Resolves multi-month / partial payment ambiguity (research §4)
payment_allocations (
  id uuid pk,
  payment_id uuid references payments,
  member_id uuid references members,     -- denormalized for query simplicity
  period_id uuid references contribution_periods,
  amount numeric,                        -- portion of the payment applied to this period
  created_at timestamptz
)

-- Notification log (also doubles as an audit trail of what was sent)
notifications (
  id uuid pk,
  member_id uuid references members,
  type text check in ('due_reminder','payment_verified','payment_rejected','overdue_nudge'),
  channel text check in ('web_push','email'),
  sent_at timestamptz,
  payload jsonb
)
```

**Derived, not stored:** a member's status for a period (`unpaid`/`partial`/`paid`) is computed as `sum(payment_allocations.amount where member+period) vs contribution_periods.dues_amount`. A Postgres view (`member_period_status`) or a computed query handles this — never write it as a mutable column, or it will drift from the allocations that are the actual source of truth.

**Backfill path (resolved Q4):** a `payments` row with `source = 'admin_backfill'`, `status = 'verified'` directly (skips the pending-review step since the admin is asserting it, not a member submitting unverified proof), `receipt_url` nullable. Admin UI allows entering a lump sum and either auto-allocating oldest-unpaid-first or manually choosing periods — same allocation mechanism as normal payments, just a different entry path and default status.

## 3. Screens

### Member-facing
1. **Login** — phone/email + magic link or OTP.
2. **Dashboard (Home)** — current month status badge (Paid/Partial/Unpaid), arrears summary if any, "Submit a payment" CTA, recent activity (last 3 payments).
3. **Submit Payment** — amount, date paid, receipt photo (camera or gallery, client-side compressed before upload), optional note.
4. **Payment History** — full list, filterable by period, each with status and (if rejected) the reason.

### Admin-facing
5. **Admin Dashboard** — this month's collection % and ₦ total, members in arrears (count + list preview), pending-verification queue count, recent activity feed.
6. **Verification Queue** — list of `pending` payments, tap to view receipt image full-size, approve (with editable period allocation, defaulted to oldest-unpaid-first) or reject (reason required, notifies member).
7. **Member Roster** — searchable/filterable table (status this month, total arrears), tap into a member for full history.
8. **Member Detail (admin view)** — full payment/allocation history, manual actions: record a payment on the member's behalf, backfill historical arrears, edit member info, deactivate.
9. **Settings** — dues amount (with effective date), admin list.

## 4. Design System (placeholder, pending logo)

Direction from resolved Q5: Nigerian Army Mess colors — dignified, disciplined, "modern but classic."

| Token | Placeholder value | Use |
|---|---|---|
| Primary | Deep maroon/burgundy (`#5C0A1E`-ish) | Primary actions, headers, active states |
| Accent | Brass/gold (`#B8860B`-ish) | Highlights, badges (e.g. "Paid"), focus rings |
| Supporting | Dark army green (`#2F3B26`-ish) | Secondary elements, alternate status color |
| Neutrals | Off-white/cream background, near-black text | Base UI, high legibility |
| Status colors | Green = paid, amber = partial, maroon/red = unpaid/overdue | Keep semantic status colors distinct from the brand maroon to avoid ambiguity — likely a separate red for "overdue" vs. the brand maroon |

Typography: a clean, highly legible sans-serif for UI/numbers (tabular figures for amounts), with restraint elsewhere — avoid decorative/serif flourishes that would undercut mobile legibility. Component library: shadcn/ui, themed to the above tokens rather than default Tailwind slate/blue.

**Action item:** swap placeholder hex values for exact ones once the logo is shared; treat this table as the single place that changes.

## 5. Notifications

- **MVP (web push):** due-date reminder (configurable, e.g. 3 days before month-end for anyone not yet `paid`), payment-verified confirmation, payment-rejected notice with reason.
- Requires the member to have installed the PWA and granted notification permission — onboarding should prompt for this right after first login, with a clear one-line explanation of why.
- **Phase 2 (per research §7):** WhatsApp Cloud API reminders — highest-value addition given existing user behavior, deferred out of MVP scope but the `notifications` table's `channel` enum already anticipates it.

## 6. Milestones

Sequenced so each milestone leaves a demoable, working slice — not a big-bang integration at the end.

| Milestone | Scope | Depends on |
|---|---|---|
| **M0 — Project setup** | Next.js + Tailwind + shadcn scaffold, Supabase project, PWA manifest/service worker skeleton, deploy pipeline to Vercel | — |
| **M1 — Data & auth** | Full schema (§2) migrated, RLS policies for member vs. admin, magic-link auth wired, admin/member roles bootstrapped (developer + treasurer seeded as admins) | M0 |
| **M2 — Member submit flow** | Submit Payment screen, receipt upload to Storage, Payment History screen | M1 |
| **M3 — Admin verify flow** | Verification Queue, approve/reject with allocation editing | M1, M2 |
| **M4 — Dashboards** | Member Dashboard, Admin Dashboard, Member Roster, Member Detail | M2, M3 |
| **M5 — Backfill tool** | Admin-only historical arrears/payment entry (resolved Q4) | M3 |
| **M6 — Notifications** | Web push for the three MVP notification types, permission-prompt onboarding | M2, M3 |
| **M7 — Polish & install** | PWA installability pass (icons, splash, offline fallback), design-token pass once logo/colors are final, empty states, error states | All above |

## 6a. Future Extension (Phase 2, not scheduled): Bar Consumption Tracking

Per `01-research.md` §5, deliberately out of scope for M0–M7 — noted here only so the eventual schema/role addition isn't a surprise later. Not a commitment to build, and none of the below should be pulled forward into an earlier milestone.

- **New role — Bar Attendant.** Can write drink-served entries against a member; cannot read `payments`/`payment_allocations`/dues data. This means the RLS model from M1 will need a third role (today it's just member vs. admin), so §2's `admins.role` check-constraint (currently a single `'admin'` value) is the likely extension point rather than a brand-new table — worth keeping in mind, not acting on now.
- **New table (sketch, not final):**
  ```sql
  bar_orders (
    id uuid pk,
    member_id uuid references members,
    brand text,
    quantity numeric,          -- unit TBD (bottles/shots/ml) — resolve when this is scoped
    served_at timestamptz,
    served_by uuid references admins,  -- or a new bar_attendants table if the role splits fully
    created_at timestamptz
  )
  ```
- Powers a per-member consumption history view and a lighthearted leaderboard/trivia view ("who's had the most") — social/fun feature, not a financial record, so it likely doesn't need the same auditability rigor as `payments`.
- Genuinely independent of the Payment/Allocation/Period model (§2) — no schema coupling expected beyond sharing `members`.

## 7. Risks / Watch-items

- **iOS web push** requires the PWA to be added to home screen first; onboarding copy needs to explicitly walk members through "Add to Home Screen" or reminders silently won't reach iPhone users.
- **Allocation editing UX** (M3) is the trickiest screen in the app — defaulting to oldest-unpaid-first and only requiring the admin to intervene for genuine ambiguity keeps it usable.
- **Two-admin model** (developer + treasurer) means no admin-audit-log requirement for MVP, but `verified_by`/`verified_at` are captured from day one so this costs nothing to add later.

## 8. Next Step

Produce `03-implementation.md` — concrete, ordered build tasks against M0–M7, file/module-level detail, ready to execute with Claude Code.
