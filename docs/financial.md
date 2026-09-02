# Financial data layer (Phase 9.2.3)

Supabase is the source of truth for household financial data. The dashboard does not mix mock constants with live rows. If a Nido has no incomes, expenses, budgets, or goals, the UI shows empty states.

Phase 9.4 is specified in [phase-9.4.md](./phase-9.4.md). **9.4.1–9.4.9** are implemented. 9.4.10 applied migrations 15–18 to `nido_dev` and executed the live RLS matrix. The phase is **IMPLEMENTADA — VALIDACIÓN OPERATIVA PARCIAL (SMOKE UI PENDIENTE)**. Discarded ideas (Realtime, insights, persistent Activity, recurring budgets, multi-currency, receipts) are [future.md](./future.md), not pending 9.4 work.

Phase 9.2.3 is the QA close of this integration. It does not add tables, columns, or product surfaces. The source of truth is the current code, the applied migrations on `nido_dev`, the RLS matrix, and the unit tests — not earlier “pending” notes in this file.

Phase 9.1.1 was **read-only**. Phase 9.1.2A added category catalog + **Registrar un gasto**. Phase 9.1.2B closes the expense module. Phase 9.1.3A connects **Metas**. Phase 9.1.3B connects **Registrar una aportación**. Phase 9.1.3D closes aportaciones (list in goal detail, edit, soft-delete). Phase 9.1.3C connects **Ingresos**. Phase 9.1.4 connects **Presupuestos**:

- `budgets.amount` is the planning limit
- spent is derived from live `expenses` (same household, `category_id`, calendar month). There is no spending table
- Nido budgets (`member_id` NULL) sum every visible expense in that set, including personal rows the viewer may SELECT (D5)
- personal budgets sum only that owner’s `scope = personal` expenses. Shared expenses do not consume a personal budget
- there is no `current_spent`, remaining, or percentage column. Those are view-model fields
- consumption is **net**: live expenses minus live refunds of those same expenses. A refund inherits category and period from the parent expense (expense month, not refund date). Soft-deleted expenses and their refunds do not count. Net is never negative.
- `recurring_expenses` templates are never added to spent
- any active member may create a Nido-level budget (`member_id` NULL) or their own personal budget (`member_id = auth.uid()` via `p_personal`; never another member’s id)
- personal SELECT follows `profiles.personal_visibility`; Nido / shared rows stay visible to the household
- only the creator may update or soft-delete a live budget
- period is monthly calendar dates in `America/Mexico_City` (`start_date` first day, `end_date` last day)

Phase 9.1.5 connects **Recurrencias**. Owner transfer was already delivered in 9.2. Phase 9.2.1 connects the **Actividad** tab to the same live snapshot. Phase 9.2.2 persists the onboarding monthly income as a real `incomes` row when the Nido is created.

**Las recurrencias son plantillas; los movimientos reales son los únicos que participan en cálculos financieros.** `recurring_incomes` y `recurring_expenses` nunca se suman a ingresos del mes, gastos del mes, presupuestos, salud, actividad ni progreso de metas. Solo las filas de `incomes` / `expenses` materializadas (`recurring_id` apuntando a la plantilla) entran en esos totales.

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
  → expense_refunds → expense_refund_splits
  → budgets
  → savings_balances
  → goals → goal_contributions
  → categories
```

`member_id` / `payer_id` point at `profiles.id`, not `household_members.id`.

The frontend never decides authorization with a client-supplied household id. `useMyNido()` resolves the **active** membership. Queries pass that `household_id` only to avoid mixing a previous Nido the user can still *read* under historical RLS. RLS remains the authority.

---

## Categories

Categories are **household-scoped**. There is no global catalog table.

`categories.is_default` marks rows seeded when the Nido is created. User-created categories (later) stay `false`. Archive with `archived_at`; do not hard-delete a category used by expenses (`category_id ON DELETE RESTRICT`).

Default expense names live in `public.default_expense_category_catalog()` and `src/lib/nido/financial/categories.ts`:

🏠 Vivienda, 🛒 Despensa, 🍔 Restaurantes, 🚗 Transporte, 🐶 Mascotas, ⚡ Servicios, 🧹 Limpieza, 🎬 Entretenimiento, ❤️ Salud, 🎓 Educación, 💼 Trabajo, ➕ Otros.

Default income names live in `public.default_income_category_catalog()` and the same TypeScript module:

💰 Sueldo, ✨ Extra.

Income categories are a **fixed catalog**. Members cannot create, rename, or archive them. **Sueldo** is the recurring salary. **Extra** is registered as a one-time `incomes` row each time it happens; it cannot be a `recurring_incomes` template.

`create_household` inserts expense **and** income rows in the same transaction as the household and owner membership. Existing households are backfilled by `20260821000000_nido_categories_and_create_expense.sql` (expenses) and `20260821220000_nido_income_mutations.sql` (incomes). `20260831120000_nido_income_sueldo_extra.sql` archives Freelance / Otros / custom income rows and keeps Sueldo + Extra. Reopening a form does not insert again. Expense names are unique per household and type, including archived rows.

The expense, recurring-expense, and budget forms list **active expense** categories of the active Nido and can create custom expense categories (name + emoji). The income form only lists **Sueldo** and **Extra**. Recurring income only lists **Sueldo**. Income categories are a fixed catalog: members cannot create, rename, or archive them from those forms. If no expense categories exist, those forms show the create fields instead of blocking. If no income categories exist, the form shows **No hay categorías disponibles.** and does not create rows.

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
| Period spent | `SUM(netExpense)` for the same filter |
| Member owed | `SUM(expense_splits.amount)` for that member on non-deleted **shared** expenses, minus that member’s `expense_refund_splits` |
| Member paid | `SUM(netExpense)` of live **shared** expenses where `payer_id` is the member |
| Member balance | paid − owed. Personal expenses do not participate |
| Settlements | Derived from member balances (`deriveSettlements`). Not persisted. Not a payment. |
| Goal progress | `SUM(goal_contributions.amount) WHERE deleted_at IS NULL / goals.target_amount` (0 if target ≤ 0) |
| Months of support | `SUM` of live contributions on **active shared funds** (`goal_type = saving` and `scope = shared`) ÷ period spent. Purchase goals and personal funds are excluded. Null when spend is 0 or there is no shared fund. |
| Budget spent | `calculateBudgetConsumption()` / `budgetSpent()`: `SUM(netExpense)` of live expenses in the same household, `category_id`, and month. Nido: all visible rows (personal + shared). Personal: `scope = personal` and `created_by = budgets.member_id`. `netExpense = amount − SUM(refunds of that expense)` |
| Budget remaining | `budgets.amount − spent` (view model only; may be negative) |
| Budget usage | `spent / budgets.amount * 100` (view model only; unbounded, may exceed 100; null if amount ≤ 0) |
| Activity | union of expenses, incomes, goal contributions, and refunds, newest first |

There is no `balances` table and no `settlements` table. Unanimous month payment confirmations live in `monthly_balance_confirmations`; they do not replace derived settlements and do not rewrite expenses. There is no `current_amount` on goals and no `current_spent` on budgets.

### Monthly balance (Phase 9.4.6)

`calculateMonthlyBalance()` in `src/lib/nido/financial/balance.ts` rebuilds the calendar-month statement from the RLS-filtered snapshot. Period is `America/Mexico_City` via `getMonthRange` (inclusive `YYYY-MM-DD`).

- **Ingresos:** confirmed `incomes` in the month. Recurring templates do not count. `savings_balances` and `budgets` are not income.
- **Gastos / gastos netos:** live **shared** expenses in the month, gross and net of those expenses’ refunds. Personal expenses stay out of settlements even when visible to the Nido.
- **Payer:** `expenses.payer_id`. Splits are `expense_splits.amount` (already stored). Do not recompute percentages.
- **Refunds:** reduce the original expense’s paid and each participant’s owed. They are not a new income. A refund dated in a later month still belongs to the **expense month**. Soft-deleted expenses (and their refunds) are omitted.
- **Settlements:** obligations derived from `balance = paid − owed`. Members can confirm a month as paid (`monthly_balance_confirmations`). The month is paid only when **every current active member** confirms from their own account. Paid months display debt as $0 without rewriting expenses. A later change to that month’s shared expenses (or their splits / refunds) deletes the confirmations.

Home shows a compact card (`Diana te debe $1,500` / `Todo está equilibrado` / `Sin gastos compartidos este mes` / `Deuda pagada`) and a **Meses con deuda** list of unpaid months. Tapping a month opens the Balance overlay on that month. The **Balance** overlay (from Home, not a new tab) has a month selector and a **Pagar** action. Health is unchanged.

### Pull-to-refresh (Phase 9.4.7)

The gesture is attached to each real `overflow-y-auto` scroll root (tabs and the Presupuestos / Balance / Perfil / recurrencias overlays), not to `MainApp`. It only arms at `scrollTop === 0`. Releasing past 72 px calls the existing `refresh()` / loader. `refreshing` does not replace `isLoading`. Existing rows stay on screen until the new snapshot arrives. A second pull while a refresh is in flight is ignored. Derived spent, health, activity, and monthly balance recompute from that same snapshot. There is no Realtime channel and no extra query module.

### Incomes: do not double-count recurrence

`recurring_incomes` are templates. Confirmed occurrences live in `incomes` (with optional `recurring_id`). Period totals use **confirmed rows only**.

### Expenses: splits

Household dashboard spent uses `expenses.amount` (the Nido’s outflow). A member’s share uses `expense_splits`. Personal vs shared is `expenses.scope`. Recurring vs one-off is `recurring_id`. `recurring_expenses` templates are never added to period spent.

Nido-level budgets (`member_id IS NULL`) overlapping the current month feed “Presupuesto del mes” on Home. `budgets.amount` is a planning target, not a spending cap. Personal budgets (`member_id = auth.uid()`) appear under **Presupuestos personales** and do not mix into the Nido monthly total. Recurring budgets will not be implemented ([future.md](./future.md)).

`profiles.personal_visibility` (`nido` \| `private`, default `nido`) is one global setting. It applies to personal expenses, personal budgets, and personal savings. Shared / Nido rows ignore it. RLS is the authority: a peer cannot SELECT another member’s personal rows when that member is `private`. Dashboard, health, and derived Activity only see rows the viewer is allowed to read. Activity stays derived (no activity table).

The canonical helpers are `calculateBudgetConsumption()` and `budgetSpent()` in `src/lib/nido/financial/budgets.ts`. They run on the RLS-filtered dashboard snapshot (period expenses already loaded). There is no consumption RPC and no persisted spent column. `netExpense()` / `refundableRemaining()` live in `refunds.ts`.

Financial health is unchanged: `computeHealth` still uses `budgetTotal` / `budgetUsagePercent` when a Nido-level budget exists. Those inputs now come from live snapshot budgets and **net** spent. The score formula was not modified and is not persisted.

### Refunds (Phase 9.4.5)

A refund is a positive row on `expense_refunds` linked to one live expense. The original `expenses.amount` stays intact. The client sends only `expense_id` and `amount` to `create_expense_refund`. The RPC locks the expense (`FOR UPDATE`), rejects an amount above the remaining refundable, and writes frozen `expense_refund_splits` from the current `expense_splits` (last participant absorbs leftover cents, same as `allocateIncomeBasedSplits`). Scope is inherited; there is no `scope` column. Refunds are immutable. Soft-deleting the expense does not delete refunds and does not turn them into new spend. Only the expense creator with an active membership may create a refund. SELECT follows the parent expense, including `personal_visibility`.

---

## Recurrencias

Gastos → **Recurrencias**, or Ingresos → **Recurrencias**. No new tab. ActionSheet is unchanged.

### Model

A recurrence is a template. `next_occurrence` is the only scheduling cursor. Frequencies are the existing enum: `weekly`, `biweekly`, `monthly`, `yearly`. Pause is `is_active = false`. Soft-delete of the template is that same flag; do not hard-delete.

Creating the template sets `next_occurrence = start_date` and does **not** insert a movement. The first materialization is the user tapping **Registrar este periodo** when that date is due (`<= today` in `America/Mexico_City`). Future dates stay visible and are not created automatically. Historical periods before `start_date` are not generated.

Materialize copies amount, category, description, and (for expenses) scope/splits into `expenses` / `incomes` with `recurring_id` set, then advances `next_occurrence`. Idempotency is a unique live index on `(recurring_id, occurred_at)` plus `FOR UPDATE` in the RPC.

If the payer, a participant, or `income_based` is unsafe, materialize fails closed (`nido.recurrence_requires_review`) and does not write a partial movement.

### Authorization

| Actor | SELECT | CREATE | Edit / pause / materialize |
| --- | --- | --- | --- |
| Active member, creator | yes | yes | yes |
| Active member, not creator | yes | yes (own template) | no |
| Historical member | yes | no | no |
| Other household | no | no | no |

---

## Crear un presupuesto

Home `+` → **Crear un presupuesto**, or Home **Presupuesto del mes** → Presupuestos → crear.

### Model

| Field | Representation |
| --- | --- |
| Limit | `budgets.amount` `numeric(12,2)`, must be `> 0` |
| Category | `category_id` of an active **expense** category in the same household. The form can create a custom category (name + emoji) before saving. |
| Period | monthly only: `start_date` = first calendar day, `end_date` = last calendar day. Create does not pick a month; it activates the current `America/Mexico_City` month immediately. |
| Scope | Nido (`member_id` NULL) or personal (`member_id = auth.uid()` when `p_personal`). The client never sends another member’s id. |
| created_by | `auth.uid()` |

There is no name/description column. Spent, remaining, percent (unbounded), exceeded, and near-limit (80%, presentation only, terracotta attention) are derived in the view model. Remaining may be negative.

### Unique live row

At most one **live** budget exists per `(household_id, category_id, member_id, start_date)` (`NULLS NOT DISTINCT`, partial unique where `deleted_at IS NULL`). Soft-delete frees that slot.

### Validations

Client and RPC both reject:

- missing session
- no active membership / historical Nido / other household
- amount ≤ 0, NaN, Infinity, malformed, too large
- category missing, archived, income type, or other household
- dates that are not a full calendar month

Messages are Spanish `NidoError` copy. Duplicate live category+month maps to `conflict`.

### Double submit

The save button is disabled with **Guardando…** (`aria-busy`) while the request is in flight. After success, Home / Presupuestos / salud refresh from `fetchDashboardSnapshot()` via `dashboard.refresh()`. Activity is unchanged: budget mutations are not activity events.

---

## Registrar un gasto

Home `+` → **Registrar un gasto** → form → `createExpense()` → `create_expense` RPC → `useDashboard().refresh()`.

### Model

| Field | Representation |
| --- | --- |
| Amount | `expenses.amount` `numeric(12,2)`, must be `> 0` |
| Description | trimmed text, required in this phase, max 80 |
| Category | `category_id` of an active expense category in the same household. The form can create a custom category (name + emoji) before saving. |
| Date | `occurred_at` calendar date in the current `America/Mexico_City` month |
| Payer | `expenses.payer_id` of an **active** household member. The form defaults to the writer (titular). Shared expenses may pick another member. `created_by` stays `auth.uid()`. |
| Personal | `scope = personal`, `distribution_method = fixed`, exactly one split at 100% for the payer (the writer) |
| Shared | `scope = shared`. Split method comes from `households.default_split_method`, not from the client. `equal` → `distribution_method = equal` (current equal shares). `proportional` → `distribution_method = income_based` from confirmed `incomes` of the participants in the current `America/Mexico_City` calendar month. All participants with zero income in that month → `nido.invalid_split`. Recurring `income_based` still uses active `recurring_incomes` only. |

The canonical split value is **amount**. Percentage is stored so the rows sum to 100. Equal splits assign leftover cents to the first participants.

**Quién pagó** appears when the expense is shared and the Nido has at least two active members. Default is the writer. The writer can switch it to another active member.

**Quiénes participan** appears only when the expense is shared **and** the Nido has more than two active members. With exactly two members, both participate; the picker is omitted.

Participants of a shared expense with three or more members are exactly the selected members. Inactive members and members of another household are rejected.

### Atomicity

PostgREST cannot wrap two inserts in a transaction. `public.create_expense(...)` inserts `expenses` and all `expense_splits` in one Postgres function. Invalid splits abort before commit. There is no orphan expense.

`SECURITY INVOKER`: existing RLS still applies. `created_by` is `auth.uid()`. `payer_id` may be any active member of the same household. A client-supplied `household_id` is not enough; the caller must be an **active** member.

### Validations

Client and RPC both reject:

- missing session
- no active membership / historical Nido / other household
- amount ≤ 0, NaN, Infinity, malformed, too large
- empty / whitespace description
- category missing, archived, wrong type, or other household
- invalid calendar date
- a date outside the current `America/Mexico_City` month (client)
- splits that do not sum, have duplicates, non-positive amounts, or inactive members

Messages are Spanish `NidoError` copy. Raw Supabase / Postgres text is never shown.

### Double submit

The save button is disabled with **Guardando…** (`aria-busy`) while the request is in flight. A second tap does not call the RPC.

After success the form closes and Home/Gastos refresh the live snapshot. Totals, activity, and health come from the financial layer, not from a local mock patch.

---

## Authorization (product contract)

Only the **creator** of an expense may edit or soft-delete it. Shared expenses are readable by household members. Personal expenses are readable by the owner always, and by other household members only when the owner’s `personal_visibility = nido`.

Authority:

`auth.uid()` → active household membership → `expense.household_id` → `expense.created_by = auth.uid()`

The UI hides Editar/Eliminar for non-creators. That is not sufficient. RLS and RPCs reject a mutation that supplies another UUID.

| Actor | SELECT | UPDATE / soft-delete |
| --- | --- | --- |
| Active member, creator | yes | yes, if `deleted_at` is null |
| Active member, not creator | shared always; personal only if owner is `nido` | no |
| Historical member | shared always; personal if own or owner is `nido` | no |
| Other household | no | no |

---

## Edit

Gastos → row → detail → **Editar** (creator only) reuses `ExpenseFlow`. Same validations as create. Changing personal↔shared, payer, participants, category, or amount **replaces** `expense_splits` in one transaction (`update_expense`). There are no orphan splits: old rows are deleted, then the canonical set is inserted.

`created_by` stays the original creator. The payer may change to another active household member.

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

## Registrar un ingreso

Home `+` → **Registrar un ingreso** → form → `createIncome()` → `create_income` RPC → `useDashboard().refresh()`.

The Ingresos tab lists `model.periodIncomes` from the same snapshot. Home shows `periodIncome` from that list.

### Model

| Field | Representation |
| --- | --- |
| Amount | `incomes.amount` `numeric(12,2)`, must be `> 0` |
| Description | trimmed text, required in this phase, max 80 |
| Category | `category_id` of Sueldo or Extra in the same household. Extra is one-time; recurring templates use Sueldo. |
| Date | `occurred_at` calendar date in the current `America/Mexico_City` month, default today |
| Earner / created_by | `auth.uid()` (v1 does not let the UI pick another member) |
| Recurrence | One-time Extra keeps `recurring_id` NULL. **Sueldo** is treated as recurring: Home copies last month's live Sueldo into the current `America/Mexico_City` month (and any missed months in the last 12) via `copy_forward_month_salaries`. Extra is never copied. A delete of this month's Sueldo stops future copies. Editing the amount updates only this row; later months copy the new amount. Past months are not rewritten. `copied_from_id` points at the previous-month source. Recurring templates still become movements only after `materialize_recurring_*` and are not copy-forward sources. |

There is no payer, split, percentage, or recurrence field on this form. Those are not invented on `incomes`.

### Authorization

`auth.uid()` → active household membership → `incomes.household_id` → `created_by = auth.uid()`.

On create, `p_household_id` is only accepted after `is_active_household_member`. On update/delete, household is looked up from the row. The client cannot send `created_by` or `member_id`.

| Actor | SELECT | CREATE | UPDATE / soft-delete |
| --- | --- | --- | --- |
| Active member, creator | yes | yes (own row) | yes, if `deleted_at` is null |
| Active member, not creator | yes | yes (own row) | no |
| Historical member | yes | no | no |
| Other household | no | no | no |
| Unauthenticated | no | no | no |

`create_income`, `update_income`, and `soft_delete_income` are `SECURITY INVOKER`.

### Soft-delete

There is no physical `DELETE FROM incomes`. `soft_delete_income` sets `deleted_at`. Period income, Ingresos, Home, health, and activity filter `deleted_at IS NULL`.

Confirmation copy:

- **¿Eliminar este ingreso?**
- Extra: **Esta acción quitará el ingreso de tus totales y actividad.**
- Sueldo: **Esta acción quitará el ingreso de tus totales y no se copiará a los meses siguientes.**
- Cancelar (ghost) / Eliminar ingreso (`Button` danger)

Already-deleted incomes cannot be edited or deleted again.

Double submit: **Guardando…** (`aria-busy`). After create, edit, or delete: `dashboard.refresh()`.

---

## Metas y fondos

The Metas tab lists `model.activeGoals` / `model.goals` from the same `useDashboard()` snapshot, grouped as **fondos** (`goal_type = saving`) and **metas** (`goal_type = purchase`). Progress is derived from embedded `goal_contributions`. There is no `current_amount`.

Empty Nido: **Sin metas ni fondos todavía** + **Crear una meta o un fondo** (GoalFlow). Creating another goal also lives on **Registrar una aportación**: **Crear otra meta o fondo** when the list has items. The Home `+` sheet no longer has a dedicated create-goal action.

Create / edit fields that exist on `goals`:

- name (required)
- target_amount (required, > 0)
- target_date (optional)
- description (optional)
- goal_type (`saving` = fondo, `purchase` = meta)
- scope (`shared` | `personal`). Default `shared`. Existing rows stay shared.

A **fondo** is a reserve. A **meta** is a target to reach or buy. Metas never enter months of support. Only **shared funds** do (`saving` + `shared`). Personal funds stay out of that numerator even when named “emergencia”. Home months of support divide those contributions by this month’s aggregated Nido budget (`MonthBudgetView.totalBudget`), not by current spend. Without a Nido budget the figure is omitted.

Personal SELECT follows `profiles.personal_visibility` of `created_by`. Shared rows stay visible to household members. Any active member may contribute to a **shared** goal/fund. Only the creator may contribute to a **personal** one.

Archive sets `status = archived`. Contributions remain. Home and Metas hide archived rows.

Only the creator with an active membership may edit or archive. Historical members may SELECT visible rows but not mutate.

---

## Registrar una aportación

Home `+` → **Registrar una aportación** → active goal → amount → date → `createContribution()` → `create_goal_contribution` RPC → `useDashboard().refresh()`.

This is **not** the same authorization as defining a goal. Any **active** member of the Nido may contribute to an **active shared** goal or fund of that Nido. Who created it does not matter. A **personal** goal or fund accepts contributions only from its creator.

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

Progress stays `SUM(goal_contributions.amount) WHERE deleted_at IS NULL / goals.target_amount`, derived in the financial view model.

Over-target contributions **are allowed**. The RPC does not reject `existing + new > target_amount`. Visual percent stays capped at 100%. Saved amount is the real sum. The goal is **not** updated to `status = completed`. `goalProgress().completed` is derived (`contributed >= target` or stored `completed`).

### Edit / delete

Same pattern as Gastos. `goal_contributions.deleted_at` is the soft-delete column. Physical `DELETE` is revoked for `authenticated`.

Authority:

`auth.uid()` → active household membership → `goals.household_id` (looked up from `goal_id`) → `created_by = auth.uid()` → `deleted_at IS NULL` → `goals.status = active`

A client-supplied `household_id` or `goal_id` is never enough to authorize an update. The RPC takes `p_contribution_id` only (plus amount/date). Household and goal status are resolved from the contribution row.

| Actor | SELECT | INSERT | UPDATE / soft-delete |
| --- | --- | --- | --- |
| Creator, active member, live contribution, active goal | yes | yes | yes |
| Other active member of the same Nido | yes | yes (own row) | no |
| Historical member | yes | no | no |
| Other household | no | no | no |
| Unauthenticated | no | no | no |

An archived goal cannot receive new contributions or mutation of existing ones. A deleted contribution cannot be mutated again.

`update_goal_contribution` and `soft_delete_goal_contribution` are `SECURITY INVOKER`. The frontend is not the authorization authority.

Goal detail lists live contributions ordered by `contributed_at` descending, then `created_at`. The creator sees **Editar** / **Eliminar**. Other members see read-only rows. Delete shows confirmation first. After create, edit, or delete: `dashboard.refresh()`.

### Validations

Client and RPC both reject:

- missing session
- no active membership / historical Nido / other household
- amount ≤ 0, NaN, Infinity, malformed, too large
- invalid calendar date
- missing goal, archived goal, goal of another Nido
- missing contribution, already-deleted contribution, not the creator

The form lists only goals/funds the caller may contribute to (shared, or own personal). If none exist: **Todavía no hay metas ni fondos** + **Crear una meta o un fondo**. If some exist: **Crear otra meta o fondo** under the list. Both open the existing GoalFlow and return to this form after create or cancel.

Edit reuses the same amount and date validations. The goal cannot be changed on edit.

Double submit: **Guardando…** (`aria-busy`). After create, edit, or delete, Home / Metas / detail / activity refresh from the same snapshot.

---

## Queries and mutations

| Module | Role |
| --- | --- |
| `queries/dashboard.ts` | `fetchDashboardSnapshot(householdId)`. For the current month it first calls `copy_forward_month_salaries` so last month's Sueldo is already in `periodIncomes`. |
| `queries/categories.ts` | `fetchActiveExpenseCategories` / `fetchActiveIncomeCategories` |
| `expenses.ts` | `createExpense` / `updateExpense` / `deleteExpense` / `createRefund` |
| `incomes.ts` | `createIncome` / `updateIncome` / `deleteIncome` |
| `copy-month-salaries.ts` | `copyForwardMonthSalariesWithAuth` — rolls Sueldo into the current month when `fetchDashboardSnapshot` loads "este mes" |
| `budgets.ts` | `createBudget` / `updateBudget` / `deleteBudget` |
| `goals.ts` | `createGoal` / `updateGoal` / `archiveGoal` |
| `contributions.ts` | `createContribution` / `updateContribution` / `deleteContribution` |
| `financial/` | dates, money, splits, validation, activity, dashboard view model, monthly balance |
| `recurring-incomes.ts` | `createRecurringIncome` / `updateRecurringIncome` / `setRecurringIncomeActive` / `materializeRecurringIncome` |
| `recurring-expenses.ts` | `createRecurringExpense` / `updateRecurringExpense` / `setRecurringExpenseActive` / `materializeRecurringExpense` |
| `use-dashboard.ts` | shared snapshot; `refresh()` after create/edit/delete/archive/materialize and pull-to-refresh. `isLoading` is the first load; `refreshing` is a later refetch that keeps the current model |
| `use-monthly-balance.ts` | selected calendar month for the Balance overlay; reuses `fetchDashboardSnapshot` |
| `pull-to-refresh.ts` | gesture rules: only at `scrollTop === 0`, 72 px threshold, one in-flight refresh |

Visual components do not query Supabase tables directly. Home, Ingresos, Gastos, Presupuestos, Metas, Actividad, and Balance do not keep a parallel financial store. Balance for a past month reuses `fetchDashboardSnapshot(householdId, range)` and `calculateMonthlyBalance()`.

Pull-to-refresh (9.4.7) lives on each real `overflow-y-auto` scroll root, not on `MainApp`. It calls the existing `refresh()` / loader. It does not add Realtime, polling, or a second snapshot. Derived totals (spent, health, activity, monthly balance) recompute from the new snapshot the same way they do after a mutation.

---

## Actividad (Phase 9.2.1)

The Actividad tab reads `model.activity` from the same `useDashboard()` / `fetchDashboardSnapshot()` snapshot as Home. There is no second financial query and no `FEED` mock.

Events, and only these:

| Type | Source | Copy |
| --- | --- | --- |
| Gasto | live `expenses` | quién pagó, descripción o categoría, monto, fecha, personal/compartido |
| Ingreso | live `incomes` | quién lo registró, descripción o categoría, monto, fecha |
| Aportación | live `goal_contributions` | quién aportó, meta, monto, fecha |
| Devolución | live `expense_refunds` of a live expense | quién la registró, gasto original, monto, fecha. Abre el detalle del gasto |

Budgets and recurrence templates are not activity events. A template appears only after `materialize_recurring_*` writes a real `expenses` / `incomes` row.

Rules:

- Soft-deleted rows (`deleted_at IS NOT NULL`) are excluded in the query and again in `buildActivityItems()`
- Order: `occurred_at` / `contributed_at` descending, then `created_at` descending
- Calendar dates stay in `America/Mexico_City`; no UTC day shift
- Scoped to the active Nido from `useMyNido()`; other-household rows are dropped even if an embed leaks them
- Names come from `profiles` / `household_members`, not from IDs typed in the UI
- After create / edit / soft-delete, `dashboard.refresh()` rebuilds the feed. Building the same snapshot twice does not duplicate rows

The screen reuses `ExpenseDetail`, `IncomeDetail`, and `GoalDetail`. Empty Nido: **Todo tranquilo por aquí.** plus the existing **Registrar un gasto** / **Registrar un ingreso** / **Registrar una aportación** flows. Loading and retry use the same `NidoError` copy as Home.

---

## Onboarding persist (Phase 9.2.2)

The create-Nido draft from Fase 8.9 is reused. Finalize does **not** invent movements.

| Draft field | Screen | Persist? | Table / reason |
| --- | --- | --- | --- |
| `nestType` | ¿Qué tipo de Nido es? | no | Local onboarding UX only. Not a household column. |
| `nestName` | Dale nombre a tu Nido | yes | `households.name` |
| `userName` | ¿Cómo te llamas? | yes | `profiles.display_name` (existing UPDATE) |
| `salary` | Ingreso mensual neto | yes, if `> 0` | `incomes` via `create_income`. Category is the household **Sueldo** row (the screen does not pick a category; this is the catalog name that matches “ingreso mensual neto”). Date is today in `America/Mexico_City`, not UTC. `created_by = member_id = auth.uid()`. Not a `recurring_incomes` template. |
| `savings` / `savingsShared` | ¿Cuánto tienes ahorrado? | yes, if present | `savings_balances` stock. Personal → `member_id = auth.uid()`. Shared → `member_id` NULL. Zero persists. Blank is omitted. Not an income, expense, or goal. |
| selected `expenses` | Gastos mensuales estimados | yes, if selected with amount `> 0` | Initial monthly `budgets` for the current `America/Mexico_City` month. Shared → Nido (`member_id` NULL). Personal → creator. Category is the estimate name (`Renta` stays `Renta`). Never `expenses`. |
| `contrib` | Método de división | yes | `households.default_split_method` (`equal` / `proportional`; SQL default `equal` when omitted). `capacity` is rejected. |

Atomicity: `create_household_with_onboarding_income` writes household, split preference, optional savings, initial budgets (and custom categories), then income in one Postgres function. If any step fails, the household is rolled back. A second call from an already-active member returns that household and does **not** insert another income, savings row, budget, or category. No `onboarding_id` was added: one active membership plus those unique indexes are the idempotency backstop.

Joiners are asked the same monthly-income question on `/join/<token>` (after name, before accept). Persist uses the existing `create_income` path after `accept_invitation`, not the create-Nido RPC. Category, description, and date match onboarding (**Sueldo**, **Ingreso mensual neto**, today in `America/Mexico_City`). Amount `0` writes no row. Income cannot be written before accept because `create_income` requires active membership and `lookup_invitation` does not return `household_id`. If income persist fails after a successful accept, the membership stands; the member can add the row later from Ingresos.

After success the `nido.onboardingDraft` key is cleared. Home reads the same `useDashboard()` / `fetchDashboardSnapshot()` path. There is no onboarding-only dashboard and no mock figures.

---

## Empty data

No records → empty copy, not prototype numbers.

A newly created Nido has default **expense and income categories**. If the user declared a monthly income greater than zero, Home / Ingresos / Actividad show that one `incomes` row (category **Sueldo**, description **Ingreso mensual neto**, `occurred_at` = today in `America/Mexico_City`). Amount `0` writes no income. Selected estimates become current-month budgets (Nido and personal appear on Presupuestos; Home totals stay Nido-level). Savings stock (`savings_balances`) has no Home metric UI. Months of support come from **shared funds** (`goals.goal_type = saving` and `scope = shared`), not from metas or personal funds.

---

## RLS

SELECT policies require historical membership (`is_household_member`). INSERT still requires active membership and `created_by = auth.uid()`. Expense, income, contribution, and budget **UPDATE** (including soft-delete) and goal **UPDATE** (including archive) require the same plus `created_by = auth.uid()` and a live row (`deleted_at IS NULL` / `status <> archived`). Income INSERT also requires `member_id = auth.uid()`. Budget create writes `member_id` NULL (Nido) or `auth.uid()` when `p_personal`. Contribution **UPDATE** also requires parent goal `status = active`. Physical DELETE remains denied on incomes/expenses/goals/budgets and is revoked on `goal_contributions` for `authenticated`.

`create_expense`, `update_expense`, `soft_delete_expense`, `create_expense_refund`, `create_income`, `update_income`, `soft_delete_income`, `create_budget`, `update_budget`, `soft_delete_budget`, `create_goal`, `update_goal`, `archive_goal`, `create_goal_contribution`, `update_goal_contribution`, `soft_delete_goal_contribution`, `create_recurring_income`, `update_recurring_income`, `set_recurring_income_active`, `materialize_recurring_income`, `create_recurring_expense`, `update_recurring_expense`, `set_recurring_expense_active`, `materialize_recurring_expense`, `update_household_name`, `update_household_default_split_method`, `create_category`, `rename_category`, and `archive_category` are `SECURITY INVOKER`. `copy_forward_month_salaries` is `SECURITY DEFINER` so one active member can roll forward every active member's Sueldo; it takes no household_id and uses `auth.uid()` as the only actor identity. Split INSERT/UPDATE/DELETE follow `can_mutate_expense`. Recurring split writes follow `can_mutate_recurring_expense`. Contribution INSERT requires active membership, `member_id = created_by = auth.uid()`, and `goal_is_active(goal_id)`.

SQL coverage lives in `supabase/tests/rls_security_matrix.sql` (`X01`–`X14`, `Y01`–`Y12`, `HS01`–`HS20`, `Z01`–`Z22`, `I01`–`I13`, `K01`–`K16`, `RE01`–`RE16`, `OB01`–`OB28`, `V01`–`V22`, `C01`–`C17`, `BC01`–`BC06`, `RF01`–`RF12`). 9.4.10 executed that matrix against `nido_dev` (317 passed, `ROLLBACK`). Those tests are not run by the default unit-test command. Mocked unit tests are not RLS proofs.

---

## Ownership

- Dashboard, gasto, ingreso, presupuesto, meta, aportación, and recurrencia mutations: active household from `useMyNido` only
- Only the recurrence creator may edit, pause, reactivate, or materialize
- Creating a template does not insert `incomes` / `expenses`. The first movement is an explicit **Registrar este periodo** when `next_occurrence <= today`
- Only the expense creator may update, soft-delete, or create a refund. `update_expense` is rejected while refunds exist. Refunds are immutable.
- Only the income creator may update or soft-delete. Soft-deleting a Sueldo stops copy-forward into later months. The amount of a past month is never changed by a later edit.
- Only the budget creator may update or soft-delete
- Only the goal creator may update or archive
- Any active member may contribute to an active goal of that Nido
- Only the contribution creator may update or soft-delete a live contribution on an active goal
- A user without an active Nido never reaches MainApp
- Historical membership can still SELECT old rows (by design) but the dashboard and forms do not use them
