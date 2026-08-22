# Financial data layer (Phase 9.1.3B)

Supabase is the source of truth for household financial data. The dashboard does not mix mock constants with live rows. If a Nido has no incomes, expenses, budgets, or goals, the UI shows empty states.

Phase 9.1.1 was **read-only**. Phase 9.1.2A added category catalog + **Registrar un gasto**. Phase 9.1.2B closes the expense module. Phase 9.1.3A connects **Metas**. Phase 9.1.3B connects **Registrar una aportación**:

- contributions reuse `goal_contributions`
- any active member may contribute to an active goal of the same Nido
- `create_goal_contribution` RPC; `member_id` and `created_by` are `auth.uid()`
- progress remains `SUM(goal_contributions.amount) / target_amount` (never stored)
- over-target contributions are allowed; visual progress stays capped at 100%
- `status = completed` is not persisted; “alcanzada” is derived

Ingresos, presupuestos, and recurrencias are still not implemented. Actividad remains prototype UI on the same snapshot.

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

## Categories

Categories are **household-scoped**. There is no global catalog table.

`categories.is_default` marks rows seeded when the Nido is created. User-created categories (later) stay `false`. Archive with `archived_at`; do not hard-delete a category used by expenses (`category_id ON DELETE RESTRICT`).

Default expense names live in `public.default_expense_category_catalog()` and `src/lib/nido/financial/categories.ts`. They follow the existing product list in `EXP_CATS` (`src/lib/constants.ts`), with truncated UI labels expanded (`Entretenim.` → `Entretenimiento`, `Otra` → `Otros`):

Vivienda, Despensa, Restaurantes, Transporte, Mascotas, Servicios, Limpieza, Entretenimiento, Salud, Educación, Trabajo, Otros.

`create_household` inserts those rows in the same transaction as the household and owner membership. Existing households are backfilled by migration `20260821000000_nido_categories_and_create_expense.sql`. Reopening the expense form does not insert again. Names are unique per household and type while `archived_at IS NULL`.

The form only lists **active expense** categories of the active Nido. If none exist, it shows **No hay categorías disponibles.** and does not create rows.

---

## Period: “este mes”

`src/lib/nido/financial/dates.ts`

- Timezone: `America/Mexico_City`
- Range: first calendar day through last calendar day, inclusive
- Shape: `{ start, end }` as `YYYY-MM-DD`
- `todayIso()` is the calendar day in that timezone, not UTC

`incomes.occurred_at`, `expenses.occurred_at`, `goal_contributions.contributed_at`, and budget dates are Postgres `date` columns. They are compared as calendar dates, not as UTC timestamps.

`created_at` is `timestamptz` and is only used for same-day relative labels (“Hace 2h”).

There is no product rule that rejects future expense dates. The form defaults to today and accepts a valid past calendar date.

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

Household dashboard spent uses `expenses.amount` (the Nido’s outflow). A member’s share uses `expense_splits`. Personal vs shared is `expenses.scope`. Recurring vs one-off is `recurring_id`. `recurring_expenses` templates are never added to period spent.

Nido-level budgets (`member_id IS NULL`) overlapping the current month feed “Presupuesto del mes”. `budgets.amount` is a planning target, not a spending cap.

---

## Registrar un gasto

Home `+` → **Registrar un gasto** → form → `createExpense()` → `create_expense` RPC → `useDashboard().refresh()`.

### Model

| Field | Representation |
| --- | --- |
| Amount | `expenses.amount` `numeric(12,2)`, must be `> 0` |
| Description | trimmed text, required in this phase, max 80 |
| Category | `category_id` of an active expense category in the same household |
| Date | `occurred_at` calendar date |
| Payer / created_by | `auth.uid()` (v1 does not let the UI pick another payer) |
| Personal | `scope = personal`, `distribution_method = fixed`, exactly one split at 100% for the payer |
| Shared | `scope = shared`, `distribution_method = equal`, two or more active members, amounts sum to the expense |

The canonical split value is **amount**. Percentage is stored so the rows sum to 100. Equal splits assign leftover cents to the first participants.

Participants of a shared expense are exactly the selected members. The whole Nido is not implied. Inactive members and members of another household are rejected.

### Atomicity

PostgREST cannot wrap two inserts in a transaction. `public.create_expense(...)` inserts `expenses` and all `expense_splits` in one Postgres function. Invalid splits abort before commit. There is no orphan expense.

`SECURITY INVOKER`: existing RLS still applies. `created_by` is `auth.uid()`. A client-supplied `household_id` is not enough; the caller must be an **active** member.

### Validations

Client and RPC both reject:

- missing session
- no active membership / historical Nido / other household
- amount ≤ 0, NaN, Infinity, malformed, too large
- empty / whitespace description
- category missing, archived, wrong type, or other household
- invalid calendar date
- splits that do not sum, have duplicates, non-positive amounts, or inactive members

Messages are Spanish `NidoError` copy. Raw Supabase / Postgres text is never shown.

### Double submit

The save button is disabled with **Guardando…** (`aria-busy`) while the request is in flight. A second tap does not call the RPC.

After success the form closes and Home/Gastos refresh the live snapshot. Totals, activity, and health come from the financial layer, not from a local mock patch.

---

## Authorization (product contract)

Only the **creator** of an expense may edit or soft-delete it. Other members of the Nido may read it. This applies to personal and shared expenses.

Authority:

`auth.uid()` → active household membership → `expense.household_id` → `expense.created_by = auth.uid()`

The UI hides Editar/Eliminar for non-creators. That is not sufficient. RLS and RPCs reject a mutation that supplies another UUID.

| Actor | SELECT | UPDATE / soft-delete |
| --- | --- | --- |
| Active member, creator | yes | yes, if `deleted_at` is null |
| Active member, not creator | yes | no |
| Historical member | yes (existing SELECT policy) | no |
| Other household | no | no |

---

## Edit

Gastos → row → detail → **Editar** (creator only) reuses `ExpenseFlow`. Same validations as create. Changing personal↔shared, participants, category, or amount **replaces** `expense_splits` in one transaction (`update_expense`). There are no orphan splits: old rows are deleted, then the canonical set is inserted.

Payer and `created_by` stay the original creator. The client cannot change them.

---

## Soft-delete

There is no physical `DELETE FROM expenses`. `soft_delete_expense` sets `deleted_at`. Splits remain. Dashboard queries, totals, Gastos, and normal activity filter `deleted_at IS NULL`.

Confirmation copy:

- **¿Eliminar este gasto?**
- **Esta acción quitará el gasto de tus totales y actividad.**
- Cancelar (ghost) / Eliminar gasto (`Button` danger)

Already-deleted expenses cannot be edited or deleted again.

---

## Gastos screen

The Gastos tab (`budget` in navigation) lists `model.periodExpenses` from `useDashboard()`. Same month range (`America/Mexico_City`), same snapshot as Home. Empty Nido: **Sin gastos todavía** + **Registrar un gasto** (existing ExpenseFlow).

---

## Metas

The Metas tab lists `model.activeGoals` / `model.goals` from the same `useDashboard()` snapshot. Progress is derived from embedded `goal_contributions`. There is no `current_amount`.

Empty Nido: **Sin metas todavía** + **Crear una meta** (GoalFlow).

Create / edit fields that exist on `goals`:

- name (required)
- target_amount (required, > 0)
- target_date (optional)
- description (optional)
- goal_type (`saving` | `purchase`)

Archive sets `status = archived`. Contributions remain. Home and Metas hide archived rows.

Only the creator with an active membership may edit or archive. Other members may SELECT. Historical members may SELECT but not mutate.

---

## Registrar una aportación

Home `+` → **Registrar una aportación** → active goal → amount → date → `createContribution()` → `create_goal_contribution` RPC → `useDashboard().refresh()`.

This is **not** the same authorization as defining a goal. Any **active** member of the Nido may contribute to an **active** goal of that Nido. Who created the goal does not matter.

Authority:

`auth.uid()` → active household membership → `goals.household_id` (looked up from `goal_id`) → `goals.status = active`

A client-supplied `goal_id` is never enough. The RPC does not take `household_id`, `member_id`, or `created_by`. Both identity columns are `auth.uid()`.

| Actor | SELECT | INSERT |
| --- | --- | --- |
| Active member of the goal’s Nido | yes | yes, if the goal is `active` |
| Historical member | yes (existing SELECT policy) | no |
| Other household | no | no |

### Model

Reuse `goal_contributions`. There is no `current_amount`, no materialized balance, and no persisted percentage.

| Field | Representation |
| --- | --- |
| Amount | `goal_contributions.amount` `numeric(12,2)`, must be `> 0` |
| Date | `contributed_at` calendar date, default today in `America/Mexico_City` |
| Goal | `goal_id` of an **active** goal in the active Nido |
| Contributor | `member_id = created_by = auth.uid()` |

Progress stays `SUM(goal_contributions.amount) / goals.target_amount`, derived in the financial view model.

Over-target contributions **are allowed**. The RPC does not reject `existing + new > target_amount`. Visual percent stays capped at 100%. Saved amount is the real sum. The goal is **not** updated to `status = completed`. `goalProgress().completed` is derived (`contributed >= target` or stored `completed`).

### Edit / delete (deferred)

`goal_contributions` has no `deleted_at`. Expenses soft-delete; contributions do not. This phase implements **create + read** only.

Existing UPDATE/DELETE policies still allow any active member to mutate a contribution via PostgREST. There is no UI for those operations. Adding creator-only edit/delete with soft-delete would require a new column and is a pending decision. Do not hard-delete contributions in the product UI.

### Validations

Client and RPC both reject:

- missing session
- no active membership / historical Nido / other household
- amount ≤ 0, NaN, Infinity, malformed, too large
- invalid calendar date
- missing goal, archived goal, goal of another Nido

The form lists only active goals of the current Nido (name, saved amount, target, percent). If none exist: **Todavía no hay metas** + **Crear una meta** (existing GoalFlow).

Double submit: **Guardando…** (`aria-busy`). After success the flow closes like Gastos and Home / Metas / detail / activity refresh from the same snapshot.

---

## Queries and mutations

| Module | Role |
| --- | --- |
| `queries/dashboard.ts` | `fetchDashboardSnapshot(householdId)` |
| `queries/categories.ts` | `fetchActiveExpenseCategories(householdId)` |
| `expenses.ts` | `createExpense` / `updateExpense` / `deleteExpense` |
| `goals.ts` | `createGoal` / `updateGoal` / `archiveGoal` |
| `contributions.ts` | `createContribution` |
| `financial/` | dates, money, splits, validation, dashboard view model |
| `use-dashboard.ts` | shared snapshot; `refresh()` after create/edit/delete/archive |

Visual components do not query Supabase tables directly. Home, Gastos, and Metas do not keep a parallel financial store.

---

## Empty data

No records → empty copy, not prototype numbers.

Onboarding income/expenses are still not persisted. A newly created Nido has default **categories** and otherwise empty financial tables until the user registers a gasto.

---

## RLS

SELECT policies require historical membership (`is_household_member`). INSERT still requires active membership and `created_by = auth.uid()`. Expense **UPDATE** (including soft-delete) and goal **UPDATE** (including archive) require the same plus `created_by = auth.uid()` and a live row (`deleted_at IS NULL` / `status <> archived`). Physical DELETE remains denied on incomes/expenses/goals.

`create_expense`, `update_expense`, `soft_delete_expense`, `create_goal`, `update_goal`, `archive_goal`, and `create_goal_contribution` are `SECURITY INVOKER`. Split INSERT/UPDATE/DELETE follow `can_mutate_expense`. Contribution INSERT requires active membership, `member_id = created_by = auth.uid()`, and `goal_is_active(goal_id)`.

SQL coverage lives in `supabase/tests/rls_security_matrix.sql` (`X01`–`X14`, `Y01`–`Y12`, `Z01`–`Z11`). Those tests are not run by the default unit-test command. Mocked unit tests are not RLS proofs.

---

## Ownership

- Dashboard, gasto, meta, and aportación mutations: active household from `useMyNido` only
- Only the expense creator may update or soft-delete
- Only the goal creator may update or archive
- Any active member may contribute to an active goal of that Nido
- A user without an active Nido never reaches MainApp
- Historical membership can still SELECT old rows (by design) but the dashboard and forms do not use them
