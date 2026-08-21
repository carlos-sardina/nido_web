# Financial data layer (Phase 9.1.1)

Supabase is the source of truth for household financial data. The dashboard does not mix mock constants with live rows. If a Nido has no incomes, expenses, budgets, or goals, the UI shows empty states.

This phase only **reads**. Mutations (registrar gasto, crear meta, aportación) start in 9.1.2.

---

## Relations used

```
Auth user
  → profiles.id
  → household_members (left_at IS NULL)   active Nido
  → households

households
  → incomes / recurring_incomes
  → expenses / recurring_expenses
  → expense_splits (via expenses)
  → budgets
  → goals → goal_contributions
  → categories
```

`member_id` / `payer_id` point at `profiles.id`, not `household_members.id`.

The frontend never decides authorization with a client-supplied household id. `useMyNido()` resolves the **active** membership. Queries pass that `household_id` only to avoid mixing a previous Nido the user can still *read* under historical RLS. RLS remains the authority.

---

## Period: “este mes”

`src/lib/nido/financial/dates.ts`

- Timezone: `America/Mexico_City`
- Range: first calendar day through last calendar day, inclusive
- Shape: `{ start, end }` as `YYYY-MM-DD`

`incomes.occurred_at`, `expenses.occurred_at`, `goal_contributions.contributed_at`, and budget dates are Postgres `date` columns. They are compared as calendar dates, not as UTC timestamps.

`created_at` is `timestamptz` and is only used for same-day relative labels (“Hace 2h”).

---

## Derived values (never stored)

| Value | Formula |
| --- | --- |
| Period income | `SUM(incomes.amount)` where `deleted_at IS NULL` and `occurred_at` in range |
| Period spent | `SUM(expenses.amount)` for the same filter |
| Member owed | `SUM(expense_splits.amount)` for that member on non-deleted expenses |
| Member balance | amount paid − amount owed |
| Goal progress | `SUM(goal_contributions.amount) / goals.target_amount` (0 if target ≤ 0) |
| Budget spent | expenses in the budget’s category and date range |
| Activity | union of expenses, incomes, and goal contributions, newest first |

There is no `balances` table, no `current_amount` on goals, and no `current_spent` on budgets.

### Incomes: do not double-count recurrence

`recurring_incomes` are templates. Confirmed occurrences live in `incomes` (with optional `recurring_id`). Period totals use **confirmed rows only**.

### Expenses: splits

Household dashboard spent uses `expenses.amount` (the Nido’s outflow). A member’s share uses `expense_splits`. Personal vs shared is `expenses.scope`. Recurring vs one-off is `recurring_id`.

Nido-level budgets (`member_id IS NULL`) overlapping the current month feed “Presupuesto del mes”. `budgets.amount` is a planning target, not a spending cap.

---

## Queries

`src/lib/nido/queries/dashboard.ts` → `fetchDashboardSnapshot(householdId)`

Loads, in parallel:

- period + recent expenses (with splits and category)
- period + recent incomes
- active recurring income/expense templates (not added into period totals)
- overlapping budgets
- non-archived goals and their contributions
- recent `goal_contributions`, then filtered to the active household

Visual components do not query Supabase. `useDashboard(householdId, members)` in MainApp builds `DashboardViewModel`.

---

## Empty data

No records → empty copy, not prototype numbers.

Future mutations (9.1.2) will insert into the same tables. Until then, a newly created Nido correctly looks empty: onboarding income/expenses were never persisted.

---

## RLS (read audit)

SELECT policies exist for every financial table and require historical membership (`is_household_member`). Child tables inherit household scope from the parent. No SELECT policy was missing for 9.1.1. No migration was added.

INSERT/UPDATE remain active-member + `created_by = auth.uid()`. Physical DELETE is denied on incomes/expenses/goals (soft-delete / archive). 9.1.2 will use those write policies; it must not use `service_role`.

---

## Ownership

- Dashboard: active household from `useMyNido` only
- A user without an active Nido never reaches MainApp
- Historical membership can still SELECT old rows (by design) but the dashboard does not request them
