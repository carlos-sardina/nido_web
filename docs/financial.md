# Financial data layer (Phase 9.1.2A)

Supabase is the source of truth for household financial data. The dashboard does not mix mock constants with live rows. If a Nido has no incomes, expenses, budgets, or goals, the UI shows empty states.

Phase 9.1.1 was **read-only**. Phase 9.1.2A adds:

- a household expense category catalog
- **Registrar un gasto** from the Home `+` sheet
- an atomic `create_expense` RPC

Metas and aportaciones are still not implemented.

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

After success the form closes and Home refreshes the live snapshot. Totals, activity, and health come from the financial layer, not from a local mock patch.

---

## Queries and mutations

| Module | Role |
| --- | --- |
| `queries/dashboard.ts` | `fetchDashboardSnapshot(householdId)` |
| `queries/categories.ts` | `fetchActiveExpenseCategories(householdId)` |
| `expenses.ts` | `createExpense(...)` → `create_expense` |
| `financial/` | dates, money, splits, validation, dashboard view model |
| `use-dashboard.ts` | Home hook; refresh after a successful gasto |

Visual components do not query Supabase tables directly.

---

## Empty data

No records → empty copy, not prototype numbers.

Onboarding income/expenses are still not persisted. A newly created Nido has default **categories** and otherwise empty financial tables until the user registers a gasto.

---

## RLS

SELECT policies require historical membership (`is_household_member`). INSERT/UPDATE remain active-member + `created_by = auth.uid()` where that column exists. Physical DELETE is denied on incomes/expenses/goals.

9.1.2A does **not** add or duplicate policies. `create_expense` is `SECURITY INVOKER`. Authorization is still:

`auth.uid()` → active membership → household allowed → category in that household → split members active in that household.

No `service_role` client. Historical members can still SELECT old rows and cannot create a new expense.

SQL coverage for `create_expense` lives in `supabase/tests/rls_security_matrix.sql` (`X01`–`X07`). Those tests are not run by the default unit-test command.

---

## Ownership

- Dashboard and gasto creation: active household from `useMyNido` only
- A user without an active Nido never reaches MainApp
- Historical membership can still SELECT old rows (by design) but the dashboard and the form do not use them
