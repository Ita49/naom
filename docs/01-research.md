# Research: Association Dues & Remittance Tracking App

**Status:** Draft for review
**Date:** 2026-07-17
**Author:** Ita (with Claude Code)

---

## 1. Problem Statement

The association currently tracks monthly member remittances manually over WhatsApp: members pay (bank transfer / mobile money) and share a receipt screenshot in a chat. Someone then has to mentally (or in a spreadsheet) reconcile who paid, how much, for which month(s), and who is behind.

This breaks down as membership grows because:

- **No single source of truth.** Payment history is scattered across chat scrollback and screenshots — nothing queryable.
- **Multi-month payments are ambiguous.** A member who pays for 3 months at once looks identical in the chat to one who paid for 1 month, unless they say so explicitly (and are believed).
- **No visibility into arrears.** There's no easy way to answer "who hasn't paid for June?" without manually scanning weeks of messages.
- **Manual reconciliation doesn't scale.** Whoever does this today (treasurer/exco) is doing unpaid, error-prone clerical work that gets heavier every month.
- **No proactive reminders.** Members who forget to pay aren't nudged until someone notices, which is often after the fact.

## 2. Goals

- Give every member a clear, always-up-to-date view of **their own payment status** (paid months, owed months, upcoming due date).
- Give the treasurer/admin an **at-a-glance dashboard**: total collected, collection rate, members in arrears, recent activity.
- Support **flexible payment patterns**: single-month, multi-month advance payments, partial payments, backdated settlement of arrears.
- Preserve the **receipt-based trust model** the association already uses (member submits proof, admin confirms) rather than forcing a payment gateway integration on day one.
- Send **notifications**: payment reminders before/at due date, confirmation when a payment is verified, and arrears nudges.
- Be **mobile-first**, since members will interact with this primarily on their phones, and feel **modern but classic** — trustworthy and legible (this is money/record-keeping, not a consumer social app), not sterile-corporate.

### Non-goals (for now)

- Replacing WhatsApp as the association's general communication channel.
- Handling disbursements/expenditure tracking (this is about *inbound* dues, not the association's spending) — worth flagging as a plausible Phase 2/3.
- In-app payment processing (card/bank debit) — explicitly deferred; see §7.

## 3. Users & Roles


| Role                                                   | Description                                    | Key needs                                                                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member**                                             | Regular association member paying monthly dues | See own status/history, submit a receipt, get reminders                                                                                                                          |
| **Treasurer/Admin**                                    | Verifies receipts, manages member records      | Dashboard of who's paid/owed, verify/reject submissions, adjust records for edge cases (e.g. cash payments, corrections)                                                         |
| **Exco/Super Admin** (optional, may = Admin initially) | Oversight role                                 | Reports/exports, manage admins, configure dues amount & cycle                                                                                                                    |
| **Bar Attendant** (Phase 2, see §5)                    | Staff at the mess bar                          | Restricted, write-only-ish access to log a drink served against a member's name — should *not* see dues/payment data; a distinct permission scope from Admin, not a rename of it |


For an MVP, Admin and Super Admin can be the same role; splitting them is a cheap Phase 2 addition once the permission model exists.

## 4. Core Domain Concepts

Getting this right matters more than any UI decision — it's what makes "who has and hasn't paid" answerable without ambiguity.

- **Member** — a person with a membership record, join date, status (active/inactive), contact info.
- **Contribution Period** — a billing unit, almost always a calendar month (e.g. `2026-07`). Dues amount could theoretically vary by period (e.g. annual increase), so this shouldn't be hardcoded.
- **Payment / Remittance** — a single act of paying money. Has an amount, a payer, a receipt (image/proof), a submission timestamp, and a verification status (`pending` / `verified` / `rejected`).
- **Allocation** — the part that resolves the "pays for multiple months at once" problem: **a Payment is not itself tied to one period.** Instead, a verified Payment's amount is *allocated* across one or more Contribution Periods for that member (e.g. ₦15,000 payment → ₦5,000 to May, ₦5,000 to June, ₦5,000 to July). This also cleanly handles partial payments (an allocation smaller than the period's dues leaves that period "partially paid") and admin corrections.
- **Member Period Status** (derived, not stored as truth) — for a given member+period, computed as `unpaid` / `partial` / `paid` / `overpaid-carried-forward` from the sum of allocations against the dues amount for that period. Deriving this instead of hand-setting it avoids the two ever disagreeing.

This allocation model is the one piece of domain design worth getting right before writing code — it's what the plan document should lock in first.

## 5. Feature Set

### MVP (Phase 1)

1. **Auth & onboarding** — admin invites members (phone/email + link), simple login (magic link or OTP — low-friction, no password to forget).
2. **Member dashboard** — this month's status, running arrears (if any), payment history list, a "Submit Payment" action.
3. **Submit payment (member)** — amount, date, optional receipt image upload, optional note ("covers May–July").
4. **Verify payment (admin)** — queue of pending submissions, view receipt, approve (with period allocation, editable) or reject (with reason).
5. **Admin dashboard** — this month's collection %, total outstanding, list of members in arrears, recent activity feed.
6. **Member roster** — searchable/filterable list with per-member status, drill into a member's full history.
7. **Notifications** — due-date reminder, payment-verified confirmation, overdue nudge. (Channel decision in §7.)

### Phase 2 (post-MVP, sequence TBD with user)

- Reports/export (CSV/PDF) for exco meetings or audits.
- Bulk actions (mark multiple members' cash payments at once).
- Configurable dues amount per period / per member (e.g. new-member pro-ration).
- WhatsApp-native reminders (see §7) instead of/alongside push.
- Multiple admins with an audit log of who verified what.
- Online payment gateway integration (Paystack/Flutterwave) as an *alternative* to manual receipt upload, not a replacement.

## 6. Non-Functional Requirements

- **Mobile-first**, works well on mid-range Android devices and small screens — this is the primary device class for most members.
- **Low-bandwidth tolerant** — receipt images should be compressed client-side before upload; avoid heavy JS bundles.
- **Installable** — members should be able to add it to their home screen and open it like an app, not hunt for a URL every month.
- **Fast time-to-status** — the single most-repeated user action ("did I pay this month?") should be answerable in under 2 seconds from opening the app.
- **Trustworthy visual design**: "modern but classic" reads as clean typography, calm/confident color use (not flashy), clear numerical hierarchy on the dashboard — closer to a well-designed banking or fintech app than a consumer social app. Avoid neumorphism/gimmicks; favor whitespace, legible tabular numbers, and a restrained palette.
- **Data sensitivity** — this is financial record data. Row-level access control (a member sees only their own records; admins see all) is a hard requirement, not a nice-to-have.
- **Auditability** — payment verification actions should be attributable and not silently overwritable (soft-edit history, not hard deletes).

## 7. Notable Design Decision: Notification Channel

Members already live in WhatsApp — that's *why* the current process exists. Two real options:

1. **In-app / web push notifications** — standard, free, no external approval process, but on iOS requires the PWA to be installed to the home screen first (works well once installed; won't reach a member who never adds it).
2. **WhatsApp Cloud API (Meta) for reminders** — sends reminders into the channel members already check constantly, which likely gets far better engagement than a push notification. Requires a Meta Business/WhatsApp Business API setup and template message approval, and has a per-message cost at scale (though low for template/utility messages, and free within a 24h service window). This is a strong Phase 2 candidate specifically *because* it matches existing user behavior — worth treating as a first-class option even if not in the MVP.

**Recommendation:** ship web push (native to the PWA, zero extra setup) for MVP; treat WhatsApp Cloud API reminders as the highest-value Phase 2 addition, not a someday-maybe — it directly targets the stated pain point (people missing payments because nobody nudged them).

## 8. Prior Art (brief scan)

This problem — tracking recurring contributions in an informal/semi-formal group — is the same shape as:

- **Ajo/Esusu/Chama contribution trackers** common across West/East Africa (informal savings groups) — most are spreadsheet-based or use generic "thrift" apps; few handle the multi-month-advance-payment case well, which is a real differentiator here.
- **Church tithe/offering tracking software** — similar member+period+verification model, usually over-built for this use case (choir/event management bolted on).
- **SACCO/cooperative society software** — closer in spirit but built for regulated financial institutions, heavier than needed.

No dominant lightweight tool targets "small association, WhatsApp-native, receipt-based trust model" specifically — that gap is the product opportunity here, and the multi-month/partial-payment allocation model (§4) is the detail that most generic tools get wrong.

## 9. Framework & Stack Recommendation

Context used for this recommendation: no strong existing language preference (defer to best fit), PWA distribution (not native app stores) is preferred, payment collection stays manual receipt-based for MVP, members are primarily in Nigeria.

### Frontend: **Next.js (App Router) as a PWA**

- Single codebase, mobile-first responsive by default, installable via manifest + service worker (`next-pwa` or hand-rolled).
- No app store review cycle — ship and update instantly, which matters for an association that will want to iterate ("can we also see who paid in cash?") without a store approval delay.
- Huge ecosystem/documentation depth, which matters when most of the implementation will be done *with* Claude Code rather than by a specialist — it's the stack Claude Code will have the most reliable, well-trodden patterns for.
- Pairs naturally with **Tailwind CSS + shadcn/ui** for the "modern but classic" aesthetic — shadcn's components are clean, restrained, and easy to theme rather than looking templated.

### Backend & Database: **Supabase**

- Managed Postgres (relational — the right fit for the Member / Period / Payment / Allocation model in §4, which is inherently relational, not document-shaped).
- Built-in Auth (magic link / OTP — no password friction for non-technical members), Row-Level Security (enforces §6's "member sees only their own data" at the database layer, not just in app code — meaningfully safer for financial data), and Storage (for receipt images).
- Removes the need to stand up and operate a separate backend service for an MVP of this size.

### Notifications

- **Web Push**: native browser API + a small service worker, no separate vendor needed for MVP.
- **Phase 2**: WhatsApp Cloud API for reminders (see §7), Resend or similar for transactional email as a fallback channel.

### Hosting

- **Vercel** for the Next.js app (first-class Next.js support, generous free tier, trivial deploys) + Supabase's own managed hosting for DB/Auth/Storage.

### Why not the alternatives

- **Flutter / React Native (native app)** — better native feel and store presence, but slower to ship, requires app store accounts/review, and store distribution wasn't the stated preference. Worth revisiting only if the association later wants store presence for legitimacy/trust reasons.
- **Firebase instead of Supabase** — Firestore's document model is a worse fit for the relational Payment/Allocation/Period structure in §4, which needs joins and aggregate queries (e.g. "sum allocations per member per period") that are awkward in Firestore and natural in Postgres.
- **Bare React SPA** — loses Next.js's built-in routing/SSR/PWA tooling for no real benefit here.

### Summary


| Layer                        | Choice                                                 |
| ---------------------------- | ------------------------------------------------------ |
| Frontend                     | Next.js (App Router), Tailwind CSS, shadcn/ui          |
| Backend/DB                   | Supabase (Postgres, Auth, Storage, Row-Level Security) |
| Notifications (MVP)          | Web Push                                               |
| Notifications (Phase 2)      | WhatsApp Cloud API, email fallback                     |
| Hosting                      | Vercel + Supabase                                      |
| Payments (Phase 2, optional) | Paystack / Flutterwave                                 |


## 10. Open Questions — Resolved

1. **Scale:** ~100 members today, expected to grow to ~120 within 12 months. Comfortably small — no scale/performance corners need cutting for MVP; default Supabase free/low tiers are sufficient.
2. **Dues structure:** Fixed monthly amount, same for every member. Still model it as a `dues_config` table keyed by effective date (§9 of the plan) rather than a hardcoded constant — cheap to do now, avoids a migration if it ever changes.
3. **Admins:** Two people for now — the developer and the treasurer. Single `admin` role is sufficient for MVP; no need to split `admin`/`super_admin` yet.
4. **Backfill:** Yes — the app must support entering historical arrears/payments predating go-live. This needs an explicit admin-only "backfill" path distinct from the normal receipt-verify flow (no receipt required, clearly flagged as historical). Included in the plan as a first-class feature, not an afterthought.
5. **Branding:** Logo to follow, but the direction is **Nigerian Army Mess colors** — deep maroon/burgundy, gold/brass, dark army green, black/white/cream neutrals. This reads as dignified and disciplined, which fits the "modern but classic" brief well. Used as the placeholder palette in the plan doc; swap for exact values once the logo arrives.

## 11. Success Metrics

- Time for a member to check their own status drops from "ask in the group chat" to a self-service check.
- Admin no longer manually reconciles WhatsApp screenshots against a spreadsheet.
- Reduction in month-over-month late/missed payments (measurable once notifications ship).

## 12. Next Steps

1. Review this document — confirm the domain model (§4) and stack (§9) before anything else, since both are expensive to change later.
2. Answer the open questions in §10.
3. Produce `02-plan.md` — architecture, data schema, screen list, milestone breakdown.
4. Produce `03-implementation.md` — task-level build plan Claude Code will execute against.

