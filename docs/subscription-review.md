# Subscription Plan Card: Gap Analysis + Simplification

## Context

Reported bug: on a Premium Monthly subscription, clicking "Standard Annual" shows
"Activating..." on **both** Premium Monthly and Premium Annual cards. More broadly,
the subscription UI has several compounding logic gaps that make it hard to reason
about.

---

## Root Cause of the Reported Bug

`isActivatingPlan` (ProfileSheet.tsx ~line 1049) does not filter by billing cycle:

```ts
const isActivatingPlan =
    subscription?.planSnapshot?.slug === plan.slug &&
    (subscription?.status === 'CREATED' || subscription?.status === 'AUTHENTICATED');
```

There is **one card per plan**, not one per plan+cycle. The billing cycle toggle only
changes the price label. So when status=CREATED with plan=Premium, **both** the
Monthly and Annual views of the Premium card satisfy this check → both show
"Activating..." regardless of which billing cycle the user is looking at.

The status=CREATED also creates a dead end: the user cannot switch to a different plan:
- `subscribe` → 409 (CREATED is blocked, canReplace=false)
- `change-plan` → 400 (requires ACTIVE/PAST_DUE)
- `cancel` → 400 (requires ACTIVE/PAST_DUE)

---

## Gap Analysis

### Gap 1 — `isActivatingPlan` ignores billing cycle (the reported bug)
Both Premium Monthly and Premium Annual show "Activating..." when a Premium CREATED
subscription exists, because there is no billingCycle check.
**Fix:** add `subscription?.billingCycle === billingCycle` to the check.

### Gap 2 — "Activating..." is the wrong label for CREATED
CREATED = "Razorpay checkout opened, no payment yet". Nothing is activating from the
system's side — the user needs to complete payment. AUTHENTICATED is closer to
"activating" (payment captured, first charge pending).
**Fix:** CREATED → "Awaiting payment". AUTHENTICATED → "Activating...".

### Gap 3 — CREATED/AUTHENTICATED state is a dead end for switching
A user who opened a Razorpay checkout but wants to pick a different plan before paying
has no path forward. They can't subscribe (409), can't change-plan (wrong status),
can't cancel (wrong status).
**Fix (backend):** CREATED and AUTHENTICATED should be auto-replaceable in the
subscribe route — the user hasn't been charged yet, so replacing is equivalent to
abandoning an unpaid cart.

```ts
// apps/api/src/routes/subscriptions.ts — canReplace check
const canReplace =
    existingCheck.cancelAtPeriodEnd ||
    replaceExisting ||
    existingCheck.status === 'CREATED' ||
    existingCheck.status === 'AUTHENTICATED';
```

**Fix (frontend):** CREATED/AUTHENTICATED already routes to `handleSwitchPlan` via
the existing `else` branch in onClick. No frontend routing change needed.

### Gap 4 — Current plan card goes dark when billing cycle toggle differs from subscription
User is on Premium Monthly, switches toggle to Annual → no plan card shows "Current"
because `isCurrentPlan` requires `subscription.billingCycle === billingCycle`.
The user sees all plans with "Switch" buttons and no highlight — looks like they
have no active subscription.
**Fix:** Remove the billingCycle match from `isCurrentPlan`. Show the current plan
highlighted regardless of toggle. Add a small "Monthly" / "Annual" badge inside the
highlighted card so the user knows which cycle they're actually on.

```ts
const isCurrentPlan =
    subscription?.planSnapshot?.slug === plan.slug &&
    (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE');
```

If `isCurrentPlan && subscription?.billingCycle !== billingCycle`, show a small
"Switch to [billingCycle] billing" sub-button inside the highlighted card rather than
a full Switch button — billing-cycle-only change as an in-place action.

### Gap 5 — Pending downgrade is invisible in the plan cards
After a downgrade is scheduled via `change-plan`, `subscription.pendingPlanSnapshot`
is set in the DB and returned by the API, but no plan card reflects this. The user
sees the old plan highlighted and the new plan with a "Switch" button — no indication
the switch is already scheduled.
**Fix:** Add `isPendingPlan` check:

```ts
const isPendingPlan =
    !!subscription?.pendingPlanSnapshot &&
    subscription.pendingPlanSnapshot.slug === plan.slug;
```

Show "Starts [currentPeriodEnd date]" label on the pending plan card instead of a
Switch button. Render in a subtle tint (e.g. `border-slate-300 bg-slate-50`).

### Gap 6 — "Switch" covers wildly different outcomes with no hint to the user
Upgrade applies immediately; downgrade schedules at cycle end; UPI forces
cancel+resubscribe. All labelled "Switch". After the downgrade fix above (Gap 5),
the user at least sees the scheduled plan, so this gap is partially addressed without
adding label complexity.

---

## Are We Deviating from Known Patterns?

**Yes, in two structural ways:**

1. **We expose Razorpay's internal state machine to the UI.** CREATED and AUTHENTICATED
   are Razorpay lifecycle states. Stripe hides these behind a single "processing"
   abstraction. Users never see "CREATED" — they see "your subscription is being set up."
   We should treat CREATED/AUTHENTICATED as a single internal "pending payment" state
   and not let them block UI actions.

2. **Two separate code paths for plan changes** (changePlan vs. subscribe route) forces
   complex routing logic in the frontend. Standard platforms have one "update
   subscription" call; our split exists because Razorpay's UPI limitation and the
   cancel+resubscribe pattern force it — but we can hide the complexity from frontend
   routing by making the backend smarter about when to auto-replace.

---

## Simplified Alternative — "One mental model, two code paths"

Keep the backend split (forced by Razorpay), but unify the **user-facing model**:

> "You are on a plan. You can switch. If we can change in place, we will. If we have to
>  restart (UPI, cancelled), we'll tell you. Either way: one button, one confirm."

Key principle: **the plan cards reflect what the user cares about, not Razorpay's
internal state.** Three card states only:

| State | Visual | When |
|-------|--------|------|
| Current | Orange highlight + billing badge | ACTIVE/PAST_DUE on this plan |
| Pending | Slate tint + "Starts [date]" | Downgrade scheduled |
| Awaiting payment | Blue tint + "Awaiting payment" or "Activating..." | CREATED (specific cycle only) or AUTHENTICATED |

Everything else shows a Switch/Subscribe button.

---

## Implementation Plan

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/subscriptions.ts` | `canReplace`: include CREATED/AUTHENTICATED as auto-replaceable |
| `apps/web/components/ProfileSheet.tsx` | Fix Gaps 1–5: isCurrentPlan, isActivatingPlan, isPendingPlan, billing-cycle badge, "Switch to [cycle]" sub-button |
| `apps/api/tests/unit/subscriptions.test.ts` | New test: "subscribe replaces CREATED subscription without 409" |
| `apps/web/tests/ProfileSheet.test.tsx` | New tests: current plan shown on wrong-cycle toggle; pending plan shows "Starts"; CREATED routes to subscribe |

### Backend change (`apps/api/src/routes/subscriptions.ts` ~line 163)

```ts
// Before:
const canReplace = existingCheck.cancelAtPeriodEnd || replaceExisting;

// After:
const canReplace =
    existingCheck.cancelAtPeriodEnd ||
    replaceExisting ||
    existingCheck.status === 'CREATED' ||
    existingCheck.status === 'AUTHENTICATED';
```

### Frontend changes (`apps/web/components/ProfileSheet.tsx` ~line 1044)

```ts
// 1. isCurrentPlan — remove billingCycle filter
const isCurrentPlan =
    subscription?.planSnapshot?.slug === plan.slug &&
    (subscription?.status === 'ACTIVE' || subscription?.status === 'PAST_DUE');

// 2. isActivatingPlan — add billingCycle filter
const isActivatingPlan =
    subscription?.planSnapshot?.slug === plan.slug &&
    subscription?.billingCycle === billingCycle &&
    (subscription?.status === 'CREATED' || subscription?.status === 'AUTHENTICATED');

// 3. isPendingPlan — new
const isPendingPlan =
    !!subscription?.pendingPlanSnapshot &&
    subscription.pendingPlanSnapshot.slug === plan.slug;
```

**Plan card render changes:**

- `isCurrentPlan` card: add billing-cycle badge (e.g. `Monthly` or `Annual` pill).
  If `subscription?.billingCycle !== billingCycle`, add a small "Switch to [X] billing"
  text-button inside the card (calls `handleSwitchPlan(plan.slug)` — billing cycle
  change via changePlan).

- `isActivatingPlan` label: status=CREATED → "Awaiting payment"; status=AUTHENTICATED
  → "Activating..." (existing spinner, just relabelled).

- `isPendingPlan` card: replace the Switch button with:
  ```tsx
  <span className="text-xs text-slate-500 font-medium">
      Starts {new Date(subscription!.currentPeriodEnd!).toLocaleDateString()}
  </span>
  ```
  Card border/bg: `border-slate-300 bg-slate-50` tint.

**No change needed to onClick routing** — CREATED/AUTHENTICATED already fall through
to the `else` branch which calls `handleSwitchPlan`. The backend fix makes that call
succeed instead of 409.

---

## Verification

1. `cd apps/api && rtk vitest run tests/unit/subscriptions.test.ts` — new test passes
2. `cd apps/web && rtk vitest run tests/ProfileSheet.test.tsx` — new tests pass
3. Manual (reported bug): subscribe to Premium Monthly → before webhook fires → open
   subscription modal → Monthly view shows "Awaiting payment" on Premium only;
   Annual view shows Premium with "Subscribe" button (no "Activating" bleed)
4. Manual (dead-end fix): in CREATED state, click a different plan → no 409, Razorpay
   checkout opens for the new plan
5. Manual (Gap 4): ACTIVE Premium Monthly → switch toggle to Annual → Premium card
   still shows orange "Current" with "Monthly" badge; other plans show Switch buttons
6. Manual (Gap 5): complete a downgrade via changePlan → pending plan card shows
   "Starts [date]" instead of Switch button
