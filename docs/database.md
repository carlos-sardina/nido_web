# Nido database foundation

This document describes the long-term domain model for Nido. It is the source of truth for the schema in `supabase/migrations/20260816000000_nido_foundation_schema.sql`.

The current frontend is a disposable visual prototype. It is not authoritative for this model. The UI will be adapted to this schema later.

The foundation migration establishes schema only. Row Level Security is a separate migration. See [docs/security.md](./security.md). This phase does not connect a Supabase project, implement authentication UI, or expose API routes.

---

## 1. Domain overview

Nido is a household / shared-finance product.

A **Nido** is a household or group (`households`). It is not limited to two people. It may contain one person, two people, or many people.

A user belongs to **at most one active Nido** at a time. People can leave and later join another Nido. Historical financial records remain intact after someone leaves and stay associated with the person (`profiles.id`) and the original Nido (`household_id`).

Nido manages:

- incomes (one-time and recurring templates)
- expenses (personal and shared, one model)
- budgets (Nido-level and personal)
- goals (Nido-level, with member contributions)
- recurring income rules
- recurring expense rules

Financial facts are stored as source transactions. Running totals, balances, budget spent amounts, and goal progress are **derived**, never persisted as authoritative columns or tables.

Money uses `numeric(12,2)`. Float and double are not used for monetary values.

Currency is out of scope for this version. Each deployment assumes one household currency. Multi-currency may be introduced in a future version; there is no `currency` column today.

---

## 2. Entity relationship explanation

```
auth.users 1──1 profiles
                 │
                 ├── creates ── households
                 ├── belongs via ── household_members
                 ├── sends ── household_invitations
                 ├── earns ── incomes / recurring_incomes
                 ├── pays ── expenses / recurring_expenses
                 ├── participates in ── expense_splits / recurring_expense_splits
                 ├── owns optional ── budgets (personal)
                 └── contributes to ── goal_contributions

households 1──* household_members
households 1──* household_invitations
households 1──* categories
households 1──* incomes
households 1──* recurring_incomes
households 1──* expenses
households 1──* recurring_expenses
households 1──* budgets
households 1──* goals

categories 1──* incomes / recurring_incomes / expenses / recurring_expenses / budgets

recurring_incomes 1──* incomes          (optional origin of a confirmed income)
recurring_expenses 1──* expenses        (optional origin of a confirmed expense)
recurring_expenses 1──* recurring_expense_splits
expenses 1──* expense_splits
goals 1──* goal_contributions
```

`profiles.id` is the same UUID as `auth.users.id`. Application tables never recreate `auth.users`.

`member_id` and `payer_id` reference `profiles.id` (the person), not `household_members.id`. Membership is the join between a person and a Nido. Financial rows keep pointing at the person so history survives leave / rejoin.

**Active vs historical membership**

- **Active membership** = a `household_members` row with `left_at IS NULL`. Required to *create* new financial/planning rows (integrity triggers) and to *create* records in a Nido (RLS / application).
- **Historical membership** = a `household_members` row with `left_at IS NOT NULL`. Those people remain the owners of past incomes, expenses, splits, budgets, goals, and contributions. Queries and reports must include them.
- Integrity triggers require active membership only on INSERT, or on UPDATE that changes household/person keys. Soft-delete and non-key edits on existing rows still work after someone leaves.

See [docs/erd.md](./erd.md) for the Mermaid diagram.

---

## 3. Table-by-table specification

### 3.1 `profiles`

Application identity for a Supabase user.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | References `auth.users.id`. ON DELETE CASCADE. |
| `display_name` | `text` NOT NULL | |
| `avatar_url` | `text` nullable | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Maintained by trigger. |

A row is created automatically when a row is inserted into `auth.users`.

Financial FKs to `profiles.id` are `ON DELETE RESTRICT`, so an auth user with financial history cannot be deleted until those rows are handled.

### 3.2 `households`

A Nido.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` NOT NULL | Must be non-blank. |
| `created_by` | `uuid` FK → `profiles.id` | ON DELETE RESTRICT. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Creating a household does **not** automatically insert the owner membership. Application logic must insert `household_members` for `created_by` with `role = owner` in the same transaction.

A Nido should have at least one owner. `leave_household` rejects the last active owner. `transfer_household_ownership` atomically demotes the caller and promotes an active member of the same Nido. There is no owner-count trigger. `households.created_by` is not the current owner.

### 3.3 `household_members`

Membership history.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | ON DELETE CASCADE. |
| `user_id` | `uuid` FK → `profiles.id` | ON DELETE RESTRICT. |
| `role` | `household_role` | `owner` or `member`. |
| `joined_at` | `timestamptz` | |
| `left_at` | `timestamptz` nullable | `NULL` = active. |
| `created_at` | `timestamptz` | |

Leave is an update (`left_at = now()`), not a delete. A user may have many historical memberships and at most one active membership.

Owner transfer is an update of `role` on two active rows in one transaction. It does not insert, delete, or set `left_at`.

Leaving does **not** delete incomes, expenses, expense splits, budgets, goals, or goal contributions. Those rows keep `member_id` / `payer_id` pointing at `profiles.id` and `household_id` pointing at the original Nido.

Rejoining the same Nido creates a **new** membership row.

### 3.4 `household_invitations`

Invite-by-email or token / QR.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `invited_by` | `uuid` FK → `profiles.id` | |
| `email` | `text` nullable | Null is allowed for token/QR invites. |
| `token` | `text` UNIQUE NOT NULL | |
| `expires_at` | `timestamptz` NOT NULL | |
| `accepted_at` | `timestamptz` nullable | |
| `created_at` | `timestamptz` | |

Accepting an invitation is application work: validate token and expiry, enforce one-active-Nido, insert `household_members`, set `accepted_at`. See [nido.md](./nido.md) for the Phase 8 RPCs and service layer.

### 3.5 `categories`

Household-scoped classification for income and expense.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `name` | `text` NOT NULL | |
| `icon` | `text` nullable | |
| `type` | `category_type` | `income` or `expense`. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `archived_at` | `timestamptz` nullable | Archive instead of delete. |
| `is_default` | `boolean` | Default `false`. True for catalog rows seeded at household creation. |

Active category names are unique per household and type. Archived names may be reused.

Using an archived category on a **new** transaction is allowed at the database level and is rejected by `create_expense` and the application.

Default expense categories are inserted by `create_household` from `default_expense_category_catalog()`. There is no global categories table.

### 3.6 `recurring_incomes`

Income templates / rules. They are not transactions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `member_id` | `uuid` FK → `profiles.id` | Income belongs to one member. |
| `category_id` | `uuid` FK → `categories.id` | Must be an income category in the same Nido. |
| `amount` | `numeric(12,2)` | `>= 0`. |
| `description` | `text` nullable | |
| `frequency` | `recurrence_frequency` | |
| `day_of_month` | `smallint` nullable | `1–31` when set. |
| `start_date` | `date` | |
| `end_date` | `date` nullable | |
| `next_occurrence` | `date` | Scheduling cursor only. |
| `is_active` | `boolean` | Default `true`. Soft-deactivate / archive. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Do not insert an `incomes` row until an occurrence is confirmed.

Do not hard-delete a rule in normal operation. Set `is_active = false`. Hard-delete sets `incomes.recurring_id` to NULL and loses the template link.

When a member leaves, the application should deactivate that member’s recurring incomes in the Nido they left.

Active recurring incomes of participating members are the default basis for `income_based` expense distribution. One-time incomes do not change that default. A member may have more than one active recurring income; the basis is the sum.

### 3.7 `incomes`

Confirmed income transactions. Always belong to one member.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `member_id` | `uuid` FK → `profiles.id` | |
| `category_id` | `uuid` FK → `categories.id` | Income category in the same Nido. |
| `amount` | `numeric(12,2)` | `>= 0`. |
| `description` | `text` nullable | |
| `occurred_at` | `date` | |
| `recurring_id` | `uuid` nullable FK → `recurring_incomes.id` | ON DELETE SET NULL. Same household and member. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` nullable | Soft delete. |

One-time income has `recurring_id = NULL`.

Phase 9.1.3C product writes (`create_income` / `update_income` / `soft_delete_income`) set `member_id = created_by = auth.uid()`. The client cannot attribute an income to another member. Soft-delete via `deleted_at`; do not physically delete income rows during normal operation.

Phase 9.2.2 writes at most one onboarding income through `create_household_with_onboarding_income`. That function reuses `create_income`. The category is the household **Sueldo** row. `occurred_at` is today in `America/Mexico_City`. There is no extra “onboarding” column.

### 3.8 `recurring_expenses`

Expense templates / rules. They are not transactions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `category_id` | `uuid` FK → `categories.id` | Expense category in the same Nido. |
| `amount` | `numeric(12,2)` | `>= 0`. |
| `description` | `text` nullable | |
| `payer_id` | `uuid` FK → `profiles.id` | Default payer. Independent from participants. |
| `scope` | `expense_scope` | |
| `distribution_method` | `distribution_method` | |
| `frequency` | `recurrence_frequency` | |
| `start_date` | `date` | |
| `end_date` | `date` nullable | |
| `next_occurrence` | `date` | Scheduling cursor only. |
| `is_active` | `boolean` | Soft-deactivate / archive. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

There is no occurrence-queue table. `next_occurrence` is sufficient for generate / edit / skip / confirm. See [section 8](#8-recurrence-behavior).

For `income_based` rules, shares are **recalculated from current active recurring incomes** when each occurrence is generated. Amounts and percentages on `recurring_expense_splits` are not a frozen historical allocation.

If a listed participant or the payer is no longer an active member of the Nido, the upcoming occurrence **requires review**. Do not auto-redistribute. See [section 8](#8-recurrence-behavior).

### 3.9 `recurring_expense_splits`

Default participants and planned shares for a recurring expense rule.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `recurring_expense_id` | `uuid` FK → `recurring_expenses.id` | |
| `member_id` | `uuid` FK → `profiles.id` | Unique per rule. |
| `amount` | `numeric(12,2)` | Planned share. `>= 0`. Not authoritative for `equal` or `income_based`. |
| `percentage` | `numeric(7,4)` nullable | `0–100` when set. Not authoritative for `equal` or `income_based`. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

The payer is not required to be a participant.

When a participant leaves the Nido, **do not delete or rewrite this row automatically**. The leftover participant is the signal that the next occurrence needs review.

### 3.10 `expenses`

Confirmed expense transactions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `category_id` | `uuid` FK → `categories.id` | Expense category in the same Nido. |
| `amount` | `numeric(12,2)` | `>= 0`. |
| `description` | `text` nullable | |
| `occurred_at` | `date` | |
| `payer_id` | `uuid` FK → `profiles.id` | Who paid. May differ from participants. |
| `scope` | `expense_scope` | `personal` or `shared`. |
| `distribution_method` | `distribution_method` | How participants' shares were computed. |
| `recurring_id` | `uuid` nullable FK → `recurring_expenses.id` | ON DELETE SET NULL. Same household. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` nullable | Soft delete. |

Personal and shared expenses use this same table. There is no separate personal-expense model.

A shared expense does not automatically include every Nido member. Participants are exactly the rows in `expense_splits`.

The payer does not have to appear in `expense_splits`.

Example: expense `$1,000`, payer = Carlos, participants = Diana 50% and Luis 50%. Carlos paid `$1,000`; Diana owes `$500`; Luis owes `$500`.

Once confirmed, `expense_splits` are final historical data unless the expense itself is explicitly edited. They are not recalculated when income later changes.

Do not physically delete expense rows during normal operation. Set `deleted_at`.

### 3.11 `expense_splits`

Who participates in an expense and how much they owe. This is the **final allocation**.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `expense_id` | `uuid` FK → `expenses.id` | |
| `member_id` | `uuid` FK → `profiles.id` | Unique per expense. |
| `amount` | `numeric(12,2)` | Owed amount. `>= 0`. |
| `percentage` | `numeric(7,4)` nullable | `0–100` when set. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

For a confirmed expense:

- `SUM(expense_splits.amount)` **must** equal `expenses.amount`
- For `percentage` (and stored `income_based` percentages): `SUM(expense_splits.percentage)` **must** equal `100`
- For `equal` and `fixed`: the monetary amounts must sum exactly to the expense amount (assign remainder cents in the application)

Those cross-row sums are enforced in a **single application/service transaction** that creates the expense and all splits together. There is no database trigger that would block incremental inserts. See [section 6](#6-integrity-constraints).

A personal expense must have exactly one split for the responsible person at `100%` / the full amount. That is an application transaction rule. A count trigger would make incremental inserts fail, so it is not implemented in PostgreSQL.

### 3.12 `budgets`

Planning targets. They do not restrict spending.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `member_id` | `uuid` nullable FK → `profiles.id` | `NULL` = Nido budget; set = personal. |
| `category_id` | `uuid` FK → `categories.id` | Same Nido. Intended to be an expense category. |
| `amount` | `numeric(12,2)` | Target. `>= 0` at the table; create/update RPC requires `> 0`. |
| `period` | `budget_period` | Currently `monthly` only. |
| `start_date` | `date` | First calendar day of the month for monthly budgets. |
| `end_date` | `date` | Last calendar day of the month for monthly budgets. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` nullable | Soft-delete. NULL means the budget is live. Added in `20260821230000`. |

There is no `current_spent` column. Spent is derived from expenses in the period.

Spending beyond a budget is valid. The database must not reject an expense because it exceeds a budget.

At most one **live** budget exists per `(household_id, category_id, member_id, start_date)`, treating `NULL` `member_id` as a real key (`UNIQUE NULLS NOT DISTINCT` where `deleted_at IS NULL`). Soft-delete frees that slot.

Physical DELETE is not granted. Do not hard-delete a budget; set `deleted_at`.

### 3.13 `goals`

Nido-level objectives.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `household_id` | `uuid` FK → `households.id` | |
| `name` | `text` NOT NULL | |
| `description` | `text` nullable | |
| `goal_type` | `goal_type` | `saving` or `purchase`. |
| `target_amount` | `numeric(12,2)` | `> 0`. |
| `target_date` | `date` nullable | |
| `status` | `goal_status` | `active`, `completed`, `archived`. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

There is no `current_amount` column. Progress is `SUM(goal_contributions.amount) WHERE deleted_at IS NULL`.

Do not hard-delete a goal that has contributions. Use `status = archived`.

### 3.14 `goal_contributions`

Member contributions toward a goal. Multiple contributions per member are allowed.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `goal_id` | `uuid` FK → `goals.id` | |
| `member_id` | `uuid` FK → `profiles.id` | Must be an active member of the goal's Nido at insert time. |
| `amount` | `numeric(12,2)` | `>= 0` at the table; create RPC requires `> 0`. |
| `contributed_at` | `date` | |
| `created_by` | `uuid` FK → `profiles.id` | Same person as `member_id` on create. |
| `created_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` nullable | Soft-delete. NULL means the contribution is active. |

`member_id` is who the contribution is attributed to. `created_by` is who wrote the row. Phase 9.1.3B sets both to `auth.uid()`.

Leaving a Nido does not delete contribution rows. Do not physically delete contributions; set `deleted_at`. Only the creator with an active membership may update or soft-delete a live contribution on an **active** goal. Over-target sums are allowed. Do not persist `goals.status = completed` from a contribution. Deleted rows do not participate in progress, totals, or activity.

---

## 4. Enums

| Enum | Values | Used by |
| --- | --- | --- |
| `household_role` | `owner`, `member` | `household_members.role` |
| `category_type` | `income`, `expense` | `categories.type` |
| `recurrence_frequency` | `weekly`, `biweekly`, `monthly`, `yearly` | `recurring_incomes.frequency`, `recurring_expenses.frequency` |
| `expense_scope` | `personal`, `shared` | `expenses.scope`, `recurring_expenses.scope` |
| `distribution_method` | `equal`, `percentage`, `fixed`, `income_based` | `expenses.distribution_method`, `recurring_expenses.distribution_method` |
| `budget_period` | `monthly` | `budgets.period` |
| `goal_type` | `saving`, `purchase` | `goals.goal_type` |
| `goal_status` | `active`, `completed`, `archived` | `goals.status` |

Additional frequencies or budget periods can be added later with `ALTER TYPE ... ADD VALUE` without redesigning tables.

---

## 5. Finalized business rules

1. A user may belong to only one **active** Nido at a time.
2. A Nido may have one person, two people, or many people.
3. Members can leave. Leave sets `household_members.left_at`. The membership row is kept.
4. Leaving must not delete historical incomes, expenses, expense splits, budgets, goals, or goal contributions.
5. After leaving, a member may join a different Nido (or later rejoin the same one as a new membership row).
6. Historical financial records stay associated with the person (`profiles.id`) and the original Nido (`household_id`). Records from Nido A and Nido B must not mix.
7. Expenses are `personal` or `shared`. Both use `expenses` + `expense_splits`.
8. A payer is stored on the expense. Participants are stored as `expense_splits`. The payer does not have to be a participant.
9. A personal expense has `scope = personal` and exactly one participant (the responsible person) at 100% of the amount.
10. Distribution methods: `equal`, `percentage`, `fixed`, `income_based`. Distribution allocates the expense among participants. The payer is independent of distribution.
11. Member balance is derived: amount paid − amount owed. There is no balances table.
12. For a confirmed expense, split amounts must sum to `expenses.amount`. Percentage splits must sum to 100%. Equal and fixed amounts must sum exactly to the expense (remainder cents assigned in the application).
13. Create an expense and all of its splits in one database transaction / service operation. Do not use a row-level trigger that blocks incremental split inserts.
14. Income belongs to one member. It may be one-time (`recurring_id` NULL) or produced from a recurring rule (`incomes.recurring_id`).
15. Recurring incomes and recurring expenses are templates. They are not financial transactions. Do not insert `incomes` / `expenses` until an occurrence is confirmed.
16. Income-based distribution uses the **active recurring income** of the **participating** members only. One-time income does not affect the default percentage.
17. A participant with no active recurring income receives **0%** in an income-based split.
18. If **all** participating members have zero active recurring income, `income_based` is **invalid**. The application must require another distribution method.
19. For income-based **recurring** expenses, percentages are recalculated from **current** active recurring incomes when each occurrence is generated. The rule must not freeze the original percentage.
20. Once an expense is confirmed, its `expense_splits` are final unless that expense is explicitly edited. Historical expenses are not recalculated when income changes.
21. If a recurring expense still lists a participant (or payer) who has left the Nido, do **not** auto-redistribute. The upcoming occurrence requires review; the user edits participants/distribution, then confirms.
22. Recurrence uses `next_occurrence` only. Generate, edit, skip, and confirm are application/service operations. There is no occurrence-queue table.
23. Budgets may be Nido-level (`member_id IS NULL`) or personal (`member_id IS NOT NULL`). They are planning targets, not spending restrictions.
24. Budget spent and goal progress are derived. Do not store `current_spent` or `current_amount`.
25. Goals belong to the Nido. Types: `saving`, `purchase`. Multiple members may contribute.
26. Incomes, expenses, and goal contributions are soft-deleted with `deleted_at`. Recurring rules are deactivated with `is_active = false`. Categories are archived with `archived_at`.
27. A Nido should have at least one owner. Transfer / last-owner protection is `transfer_household_ownership` + `leave_household`, not a table trigger.
28. `created_by` for new financial records should be an active member of that Nido. Enforced by RLS / application, not by a foundation trigger.
29. Currency is a single implicit household currency in this version.

---

## 6. Integrity constraints

### Primary keys

Every table uses a `uuid` primary key. `profiles.id` is the auth user id. All other tables default to `gen_random_uuid()`.

### Foreign keys

| From | To | On delete |
| --- | --- | --- |
| `profiles.id` | `auth.users.id` | CASCADE |
| `households.created_by` | `profiles.id` | RESTRICT |
| `household_members.household_id` | `households.id` | CASCADE |
| `household_members.user_id` | `profiles.id` | RESTRICT |
| `household_invitations.household_id` | `households.id` | CASCADE |
| `household_invitations.invited_by` | `profiles.id` | RESTRICT |
| `categories.household_id` | `households.id` | CASCADE |
| `categories.created_by` | `profiles.id` | RESTRICT |
| `*.member_id` / `*.payer_id` / `*.created_by` | `profiles.id` | RESTRICT |
| Financial / planning `household_id` | `households.id` | CASCADE |
| `*.category_id` | `categories.id` | RESTRICT |
| `incomes.recurring_id` | `recurring_incomes.id` | SET NULL |
| `expenses.recurring_id` | `recurring_expenses.id` | SET NULL |
| `expense_splits.expense_id` | `expenses.id` | CASCADE |
| `recurring_expense_splits.recurring_expense_id` | `recurring_expenses.id` | CASCADE |
| `goal_contributions.goal_id` | `goals.id` | CASCADE |

**CASCADE and history**

- Leaving a member does **not** cascade. Financial FKs point at `profiles`, not at `household_members`.
- `ON DELETE RESTRICT` on people and categories protects history: a profile or in-use category cannot be removed.
- `ON DELETE CASCADE` from a **household** deletes that Nido’s owned rows. That is full Nido removal, not the leave path. Normal application operation must not hard-delete a household that has financial history.
- `expense_splits` cascade from an expense only if the expense is physically deleted. Normal operation soft-deletes the expense and keeps the splits.
- Hard-deleting a recurring rule SET NULLs `recurring_id` on existing transactions. Deactivate the rule instead.

`category_id ON DELETE RESTRICT` can block a household hard-delete if PostgreSQL tries to remove categories before incomes/expenses in the same statement. That is acceptable: household hard-delete is not a supported product operation.

### Unique constraints and partial unique indexes

| Constraint | Purpose |
| --- | --- |
| `household_members_one_active_membership_idx` on `(user_id) WHERE left_at IS NULL` | One active Nido per user. Historical memberships remain allowed. |
| `household_members_active_household_user_idx` on `(household_id, user_id) WHERE left_at IS NULL` | Fast active-membership lookup (triggers, later RLS). |
| `household_invitations.token` UNIQUE | Invite tokens are globally unique. |
| `household_invitations_pending_email_idx` on `(household_id, lower(email)) WHERE email IS NOT NULL AND accepted_at IS NULL` | One pending email invite per Nido. |
| `categories_active_name_type_idx` on `(household_id, lower(name), type) WHERE archived_at IS NULL` | No duplicate active category names of the same type. |
| `expense_splits (expense_id, member_id)` | No duplicate participant on an expense. |
| `recurring_expense_splits (recurring_expense_id, member_id)` | No duplicate participant on a recurring expense. |
| `budgets_unique_live_scope` on `(household_id, category_id, member_id, start_date)` NULLS NOT DISTINCT `WHERE deleted_at IS NULL` | One live budget per scope / category / period start. |

`UNIQUE(user_id)` is intentionally **not** used on `household_members`.

### Check constraints

- Monetary amounts `>= 0`.
- `goals.target_amount > 0`.
- Split percentages `NULL` or between `0` and `100`.
- `day_of_month` `NULL` or `1–31`.
- `end_date >= start_date` where both exist.
- `left_at >= joined_at` when set.
- Non-blank names for households, categories, and goals.

### Trigger-enforced same-Nido rules

On INSERT, or on UPDATE that changes the relevant keys:

| Record | Rule |
| --- | --- |
| `incomes`, `recurring_incomes` | `member_id` is an **active** member of `household_id`. Category is an `income` category in that Nido. |
| `incomes` | If `recurring_id` is set, that rule belongs to the same household **and** the same member. |
| `expenses`, `recurring_expenses` | `payer_id` is an **active** member of `household_id`. Category is an `expense` category in that Nido. |
| `expenses` | If `recurring_id` is set, that rule belongs to the same household. Payer/participants on the confirmed expense may differ from the template (user edited before confirm). |
| `expense_splits` | `member_id` is an **active** member of the parent expense's Nido. |
| `recurring_expense_splits` | `member_id` is an **active** member of the parent rule's Nido. |
| `budgets` | If `member_id` is set, that person is an active member. Category is an `expense` category in the Nido. |
| `goal_contributions` | `member_id` is an active member of the goal's Nido. |

These checks use **current active membership**. They do not reconstruct membership as of `occurred_at`.

They do **not** apply to SELECT. Historical rows remain queryable after `left_at` is set.

They do **not** re-run when only non-key fields change (`deleted_at`, amounts, dates, `next_occurrence`). Existing history can be soft-deleted or metadata-edited after the payer or participant has left.

Consequence: you cannot *attach a new* payer/participant key to a left member. That is intentional for new records (prevents writing into a Nido the person has left, and prevents mixing Nido A history into Nido B). Historical corrections that would add a departed member as a new split/payer are an application/admin exception, not a normal path.

`created_by` is **not** checked by these triggers. See [section 15](#15-created_by).

### Cross-row sums not enforced in the database

The following are **required business rules** but are **not** implemented as triggers:

- `SUM(expense_splits.amount) = expenses.amount`
- When percentages are used, `SUM(expense_splits.percentage) = 100`
- The same two rules for `recurring_expense_splits` relative to `recurring_expenses.amount` when the method is `percentage` or `fixed`
- A personal expense has exactly one split at 100%

A row-level trigger would reject valid partial inserts (first split of several). A statement-level trigger still fights natural write order and makes corrections harder.

**Required enforcement:** insert or replace an expense and its splits in a single application transaction. After writing the splits, assert the sums (and the personal-expense cardinality) before commit. The same pattern applies to recurring expense rules when the stored planned shares are authoritative (`percentage`, `fixed`). A later phase may add a deferred constraint trigger if application bugs make that necessary.

---

## 7. Derived calculations

Do not persist these values.

### Expense balances

For a member inside a Nido, using non-deleted expenses:

```
member_paid = SUM(expenses.amount)
              WHERE payer_id = member
                AND household_id = nido
                AND deleted_at IS NULL

member_owed = SUM(expense_splits.amount)
              WHERE member_id = member
                AND expense is in that nido
                AND expense.deleted_at IS NULL

member_balance = member_paid - member_owed
```

Example: Carlos pays `$1,000`, Diana owes `$500`, Luis owes `$500`.

- Carlos: paid `1000`, owed `0` → balance `+1000`
- Diana: paid `0`, owed `500` → balance `-500`
- Luis: paid `0`, owed `500` → balance `-500`

If Carlos also participates (equal split with Diana on `$1,000` that Carlos paid):

- Carlos: paid `1000`, owed `500` → balance `+500`
- Diana: paid `0`, owed `500` → balance `-500`

Positive balance means others owe that person. Negative means that person owes others.

Pairwise settlement between A and B can be derived from the same source rows. No settlement ledger is stored in this phase.

### Goal progress

```
current_amount = SUM(goal_contributions.amount) WHERE goal_id = goal AND deleted_at IS NULL
```

### Budget spent

```
spent = SUM(expenses.amount)
        WHERE household_id = budget.household_id
          AND category_id = budget.category_id
          AND occurred_at BETWEEN budget.start_date AND budget.end_date
          AND deleted_at IS NULL
          AND (
            budget.member_id IS NULL
            OR (
              -- personal budget: spend attributed to that member
              -- attribution rule is application-defined; default is payer_id
              payer_id = budget.member_id
            )
          )
```

Personal-budget attribution (payer vs participant vs creator) is left to application logic. The database does not store `current_spent`. Over-budget spending is valid.

### Income-based shares

See [section 11](#11-income-based-distribution-behavior).

---

## 8. Recurrence behavior

Recurring rows are templates, not transactions.

```
Recurring rule
    → upcoming occurrence (derived from next_occurrence)
    → calculate distribution (recalculate income_based from current incomes)
    → user may edit, skip, or (if required) review
    → confirm
    → actual incomes / expenses (+ splits)
```

`next_occurrence` is the only scheduling cursor. There is no occurrence-queue table in this version.

That cursor is sufficient for:

| Action | Application work |
| --- | --- |
| Generate | Read due rules (`is_active` and `next_occurrence <= today`). Build a draft from the rule. |
| Edit | Change amount, payer, participants, distribution, or date on the draft before confirm. |
| Skip | Advance `next_occurrence` without inserting a transaction. |
| Confirm | Insert `incomes` or `expenses` (+ `expense_splits`) with `recurring_id` set, then advance `next_occurrence`. |
| Requires review | Do not confirm. See below. |

### When an occurrence requires review

Derive this at generation time. Do not store a review flag and do not auto-rewrite the rule.

An upcoming occurrence **requires review** when any of the following is true:

1. The payer is not an **active** member of the rule’s household.
2. Any `recurring_expense_splits.member_id` is not an **active** member of the rule’s household.
3. `distribution_method = income_based` and every participating member has zero active recurring income (the method is invalid).

Do **not** automatically remove the departed participant or redistribute their share. The user must edit participants/distribution, then confirm.

Integrity triggers will also reject a confirm that still uses a departed payer or participant (`assert_active_household_member`). That is a backstop, not a substitute for the review UI.

### Income-based recurring expenses

Recalculate shares from **current** active recurring incomes of the **current draft participants** at generation time.

January: Carlos `$40k`, Diana `$20k` → 66.67% / 33.33%.  
Carlos later earns `$60k`. March occurrence → 75% / 25%.

Do not persist January’s percentages on the rule as the March allocation.

After confirm, the March `expense_splits` are historical. A later income change does not rewrite them.

### Other recurrence rules

- Creating or updating a recurring rule does not insert a transaction.
- Confirming is `materialize_recurring_income` / `materialize_recurring_expense`: insert `incomes` / `expenses` (+ splits) with `recurring_id` set, then advance `next_occurrence`. The first materialization is an explicit user action when `next_occurrence <=` today in `America/Mexico_City`. Saving the template does not create historical or future movements.
- Idempotency is a unique partial index on `(recurring_id, occurred_at)` where the movement is live, plus `SELECT … FOR UPDATE` in the RPC. The same rule and date return the existing movement.
- Deactivate a rule with `is_active = false`. Do not hard-delete it in normal operation.
- When a member leaves, deactivate their `recurring_incomes` in that Nido. Leave `recurring_expense_splits` in place so the next expense occurrence can require review.
- `frequency` values are `weekly`, `biweekly`, `monthly`, and `yearly`. `day_of_month` exists on recurring incomes as an optional monthly hint. Recurring expenses rely on `next_occurrence` plus `frequency` for now.
- Occurrence generation, timezone handling, and month-end clamping are application concerns.

---

## 9. Historical member behavior

- Leave = `UPDATE household_members SET left_at = now()`.
- Do not delete membership rows as part of leaving.
- Financial rows keep `member_id` / `payer_id` pointing at `profiles.id` and `household_id` pointing at the original Nido.
- Soft-deleted incomes and expenses remain in the database.
- After leave, the unique partial index allows the user to join another Nido.
- Rejoining the same Nido creates a **new** `household_members` row.
- New financial records after join belong to the **new** Nido. They must not reuse the old `household_id`.
- Integrity triggers require active membership only when creating rows or changing person/household keys.
- Reports and RLS reads must include historical members who appear on transactions even if `left_at` is set.
- Do not filter historical transactions with `left_at IS NULL`. That would hide valid history.

---

## 10. Budget behavior

- Nido budget: `member_id IS NULL`.
- Personal budget: `member_id` is that member.
- Budgets do not block expenses. Over-budget spending is valid.
- Spent amounts are queried from expenses, not stored on the budget.
- The only period in this foundation is `monthly`.
- A later UI may warn when spent exceeds `amount`. That is presentation, not a constraint.

---

## 11. Income-based distribution behavior

When `distribution_method = income_based`, default shares use **active recurring income** of the **participating** members only.

Example:

| Member | Active recurring income |
| --- | ---: |
| Carlos | 40,000 |
| Diana | 20,000 |
| Luis | 20,000 |
| Total | 80,000 |

Default shares:

| Member | Share |
| --- | ---: |
| Carlos | 50% |
| Diana | 25% |
| Luis | 25% |

### Participant with no recurring income

That participant’s share is **0%**.

| Member | Active recurring income | Share |
| --- | ---: | ---: |
| Carlos | 40,000 | 66.666…% |
| Diana | 20,000 | 33.333…% |
| Luis | 0 | 0% |

### All participants at zero

If every participating member has zero active recurring income, `income_based` is **invalid**. The application must require `equal`, `percentage`, or `fixed`.

### Basis rules

- Basis for a participant = `SUM(recurring_incomes.amount)` where `is_active = true`, `member_id` is that participant, and `household_id` is the expense’s Nido.
- Treat a rule with `end_date < today` as inactive in the application even if `is_active` was left true.
- One-time `incomes` do **not** change the default percentage.
- Inactive recurring incomes are excluded.
- Members who are not participants are excluded, even if they have recurring income.
- A member may have multiple active recurring incomes; they are summed.
- Apply the computed percentages, then assign remainder cents so `SUM(expense_splits.amount) = expenses.amount`.
- Store the computed `amount` and `percentage` on the confirmed `expense_splits`. Those rows are historical.

### Recurring vs confirmed

- **Template:** do not treat `recurring_expense_splits.amount` / `percentage` as frozen income-based shares.
- **Generation:** recompute from current active recurring incomes.
- **Confirmed expense:** never recompute automatically when income later changes.

---

## 12. Personal expenses

Personal and shared expenses share `expenses` + `expense_splits`. There is no personal-expense table.

A personal expense must have:

- `scope = personal`
- exactly one `expense_splits` row
- that row belongs to the person responsible for the expense
- `amount` = `expenses.amount` and `percentage` = `100`

The payer may still differ from that participant (someone else paid on their behalf).

The application/service layer must enforce the single-split rule inside the same transaction that writes the expense. PostgreSQL does not count child rows with a safe CHECK constraint, and a trigger would block incremental inserts.

---

## 13. Soft delete and archive

| Kind | Mechanism | Normal operation |
| --- | --- | --- |
| `incomes`, `expenses`, `goal_contributions` | `deleted_at` | Set `deleted_at`. Do not `DELETE`. |
| Recurring rules | `is_active = false` | Deactivate. Do not `DELETE` (that SET NULLs `recurring_id`). |
| `categories` | `archived_at` | Archive. Do not `DELETE` while referenced. |
| `goals` | `status = archived` | Archive. Do not `DELETE` when contributions exist. |
| `household_members` | `left_at` | Leave. Do not `DELETE`. |

`is_active` is the recurring-rule archive/stop strategy. Pause and “remove from the list” are the same state in this version. A separate `archived_at` on rules was not added.

---

## 14. Currency

This version assumes one implicit currency for the household / deployment.

There is no `currency` column and no FX tables.

A future version may add multi-currency. Do not encode currency-specific constraints now.

---

## 15. `created_by`

`created_by` records who wrote the row. It references `profiles.id`.

For **new** financial and planning records, the creator should be an **active** member of that household. An unrelated profile must not create records in another Nido.

This is **not** enforced by a foundation trigger:

- System or later admin writes may need to set `created_by` without going through the same path.
- RLS is the right layer to require `auth.uid()` to be an active member on INSERT.

The application/service layer should set `created_by` to the acting user and refuse writes when that user is not an active member.

Integrity triggers still require the **subject** of the row (`member_id`, `payer_id`, split participant) to be an active member on insert. That is separate from `created_by`.

---

## 16. Database-enforced vs application-enforced

### PostgreSQL enforces

- Primary keys, foreign keys, and the delete behaviors in [section 6](#6-integrity-constraints)
- One active membership per user
- Unique participants per expense / recurring expense
- Unique active category names per household and type
- Unique pending email invite per household
- Unique budget per household / category / member / start date
- Non-negative money; positive goal targets; percentage range; date order; non-blank names
- Same-Nido + **active** membership for new financial/planning subjects
- Category type matches income vs expense on those transactions
- `recurring_id` belongs to the same household (and same member for income)
- `updated_at` maintenance
- Automatic `profiles` row on `auth.users` insert

### Application / service must enforce (in a transaction)

- Household create + owner `household_members` row together
- At least one owner; owner transfer (`transfer_household_ownership`)
- Invitation accept: expiry, one-active-Nido conflict, membership insert
- Expense + all splits in one transaction; sum(amount) = expense amount
- Percentage / income_based stored percentages sum to 100
- Equal / fixed amounts sum exactly to the expense (remainder cents)
- Personal expense: exactly one split at 100%
- Income-based: 0% when a participant has no active recurring income
- Income-based: reject when all participants are at zero; require another method
- Recalculate income-based shares at each recurring generation
- Do not rewrite confirmed `expense_splits` when income changes
- Recurring generate / edit / skip / confirm against `next_occurrence`
- Require review when a recurring participant or payer has left, or income_based is invalid; do not auto-redistribute
- Deactivate a member’s recurring incomes when they leave
- Soft-delete incomes/expenses/goal contributions; deactivate recurring rules; archive categories/goals
- Do not hard-delete households, expenses, or goals in normal operation
- `created_by` is the acting active member
- Do not use archived categories on new transactions
- Ignore ended recurring incomes (`end_date < today`) in the income-based basis
- Budget overspend is allowed (do not block expenses)
- Currency is implicit

---

## 17. RLS

RLS is implemented in `supabase/migrations/20260817000000_nido_rls.sql`. The authorization model, helpers, policies, and test matrix are documented in [docs/security.md](./security.md).

Summary:

- **Read** uses historical membership (any `household_members` row for `auth.uid()`).
- **Write** requires active membership (`left_at IS NULL`).
- `created_by` on INSERT must equal `auth.uid()`.
- Child tables inherit household scope through parent-lookup helpers. `household_id` is not denormalized onto `expense_splits`, `recurring_expense_splits`, or `goal_contributions`.
- Membership leave, invitation accept, and owner transfer are RPCs under the authenticated session (`leave_household`, `accept_invitation`, `transfer_household_ownership`). Clients cannot arbitrarily update `household_members`.

The one-active-Nido unique index remains the database backstop.

---

## 18. Decisions intentionally deferred

These remain out of scope. Historical bullets that listed auth, frontend integration, owner-transfer RPCs, the income catalog, or contribution soft-delete as “not implemented” are obsolete as of Phase 9.2.3. Those exist in code and on `nido_dev`.

Still deferred:

1. **Occurrence queue** — `next_occurrence` is sufficient.
2. **Advanced recurrence** — extra frequencies, skip, notifications, timezones beyond `America/Mexico_City`.
3. **Split-sum table triggers** — `create_expense` enforces the sum in one transaction. A row-level trigger that would block incremental inserts is still deferred.
4. **Pairwise settlements / payments** between members.
5. **Refunds or negative amounts.**
6. **Personal-budget spend attribution** and personal-budget UI.
7. **Invitation email / QR product** beyond the current owner insert + `accept_invitation` RPC.
8. **Owner-count trigger** — last-owner leave is enforced in `leave_household`, not by a table trigger.
9. **Audit log** of edits.
10. **Hard-delete prevention triggers** — physical `DELETE` is revoked on movement tables; application uses `deleted_at` / `is_active` / `archived_at` / goal `status`.
11. **Using archived categories on new transactions** — allowed at the database CHECK level; mutation RPCs reject them.
12. **Goal-to-category linkage.**
13. **Multi-currency.**
14. **Notifications, activity-feed persistence, and insights.**
15. **Stored `requires_review` flag** — derived at materialize time instead.
16. **Separate pause vs archive on recurring rules** — `is_active` covers both for now.
17. **Category CRUD UI.**

---

## Migration notes

- Schema: `supabase/migrations/20260816000000_nido_foundation_schema.sql`
- RLS: `supabase/migrations/20260817000000_nido_rls.sql`
- Household lifecycle RPCs: `supabase/migrations/20260818000000_nido_household_lifecycle.sql`
- Owner transfer RPC: `supabase/migrations/20260822000000_nido_owner_transfer.sql`
- Categories catalog + `create_expense`: `supabase/migrations/20260821000000_nido_categories_and_create_expense.sql`
- Income catalog + `create_income` / `update_income` / `soft_delete_income`: `supabase/migrations/20260821220000_nido_income_mutations.sql`
- Onboarding income persist: `supabase/migrations/20260822300000_nido_onboarding_financial.sql` (`create_household_with_onboarding_income`)
- Security model: [docs/security.md](./security.md)
- Application clients: [docs/supabase.md](./supabase.md)
- These migrations are applied on the linked hosted project. See [docs/supabase.md](./supabase.md).
- Do not put seed data in the foundation migration. If seed SQL is added later, keep it in a clearly labeled separate file.
