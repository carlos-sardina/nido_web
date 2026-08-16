# Nido security model

This document describes Row Level Security for the Nido domain model.

The domain model in [database.md](./database.md) is the source of truth. RLS implements authorization on that model. It does not follow the current prototype UI.

Implementation:

- Schema: `supabase/migrations/20260816000000_nido_foundation_schema.sql`
- RLS: `supabase/migrations/20260817000000_nido_rls.sql`
- Runtime tests: `supabase/tests/rls_security_matrix.sql`
- Static coverage check: `supabase/tests/validate_rls_coverage.mjs`

---

## 1. Authentication assumption

Authorization uses Supabase Auth.

- `auth.uid()` is the authenticated user id.
- `profiles.id` is the same UUID as `auth.users.id`.
- Policies apply to the `authenticated` role.
- `anon` has no table privileges.
- `service_role` has full table privileges and bypasses RLS. Invitation accept, leave, join, and owner transfer use `service_role` (or a later SECURITY DEFINER RPC), not client policies.

Unauthenticated requests see no application rows.

Do not rely on frontend filtering. Do not trust client-supplied `household_id` or `created_by`.

---

## 2. Active vs historical membership

A user belongs to at most one **active** Nido at a time. They may have many historical memberships.

| Kind | `household_members` predicate | Access |
| --- | --- | --- |
| Active | `user_id = auth.uid() AND left_at IS NULL` | Read and write in that household |
| Historical | `user_id = auth.uid()` (any `left_at`) | Read that household’s data; no writes |
| Never a member | no row | No access |

Example:

```
Carlos
  Nido A   joined_at = Jan 2026   left_at = Aug 2026    historical
  Nido B   joined_at = Aug 2026   left_at = NULL        active
```

Carlos can read Nido A history and can read/write Nido B. He cannot create or modify Nido A data.

Leaving updates `left_at`. It does not delete the membership row and does not delete financial history.

---

## 3. Read vs write

**Read** uses historical membership. A user who has ever belonged to a household can read:

- the household
- its memberships
- categories
- incomes and recurring incomes
- expenses, splits, recurring expenses, and recurring splits
- budgets
- goals and contributions
- profiles of people who have shared that household

**Write** uses active membership. After `left_at` is set, INSERT/UPDATE/DELETE on that household’s financial and planning data is denied.

`created_by` on INSERT must equal `auth.uid()`.

Child tables without `household_id` inherit the parent household:

| Child | Parent lookup |
| --- | --- |
| `expense_splits` | `household_id_for_expense(expense_id)` |
| `recurring_expense_splits` | `household_id_for_recurring_expense(recurring_expense_id)` |
| `goal_contributions` | `household_id_for_goal(goal_id)` |

`household_id` is not denormalized onto those tables.

---

## 4. Helper functions

Helpers live in `public` and are granted to `authenticated` and `service_role`. `PUBLIC` execute is revoked.

| Function | Meaning |
| --- | --- |
| `is_household_member(household_id)` | Current user has any membership in that household |
| `is_active_household_member(household_id)` | Current user has `left_at IS NULL` in that household |
| `is_household_owner(household_id)` | Current user is an active owner |
| `is_active_member_of(household_id, user_id)` | That person is an active member of that household |
| `shares_household_with(user_id)` | Current user and that person have ever shared a household |
| `is_household_created_by_current_user(household_id)` | Current user created the household |
| `household_has_no_members(household_id)` | Household has no membership rows yet |
| `category_belongs_to_household(category_id, household_id)` | Category is scoped to that household |
| `household_id_for_expense(expense_id)` | Parent household for an expense |
| `household_id_for_recurring_expense(id)` | Parent household for a recurring expense |
| `household_id_for_goal(goal_id)` | Parent household for a goal |

### Why SECURITY DEFINER

These helpers are `SECURITY DEFINER` with `SET search_path = public`.

They are required because:

1. Policies on `household_members` must read `household_members`. An invoker function would recurse.
2. The household creator must insert the first owner row before they are a member. A membership-gated `households` SELECT would hide the new household from an invoker check.
3. Child-table policies must resolve the parent household without re-entering parent RLS.

They only **read** membership or parent keys. They do not write. They do not grant access by themselves; policies still require the caller to satisfy membership predicates that use `auth.uid()`.

Existing foundation integrity functions (`assert_active_household_member` and related triggers) were already `SECURITY DEFINER` for the same recursion reason. This migration does not change them.

`SECURITY INVOKER` is not used for membership checks because those checks query `household_members` from inside RLS.

---

## 5. Table-by-table policy model

RLS is enabled on every application table. `anon` and `PUBLIC` have no privileges. Physical `DELETE` is granted to `authenticated` only where a DELETE policy exists.

### `profiles`

| Operation | Policy |
| --- | --- |
| SELECT | Caller shares (or shared) a household with that profile, including self |
| UPDATE | `id = auth.uid()` |
| INSERT | None. `handle_new_user()` inserts the row as `SECURITY DEFINER` |
| DELETE | None |

Profiles are not globally readable.

### `households`

| Operation | Policy |
| --- | --- |
| SELECT | Historical member, or `created_by = auth.uid()` (so the creator can see a household before the owner row exists) |
| INSERT | `created_by = auth.uid()` |
| UPDATE | Active member |
| DELETE | Active owner only |

RLS does not guarantee that a household always has an owner. Creating a household and inserting the owner membership must happen in the same application transaction. The unique index still prevents a second active membership.

### `household_members`

| Operation | Policy |
| --- | --- |
| SELECT | Historical member of that household |
| INSERT | First owner only: `user_id = auth.uid()`, `role = owner`, `left_at IS NULL`, caller created the household, and the household has no members yet |
| UPDATE | None |
| DELETE | None |

Clients cannot change `user_id`, `household_id`, `role`, `joined_at`, or `left_at` on existing rows.

Leave, join, invitation accept, role change, and owner transfer are application/service operations using `service_role`. Leaving must set `left_at`, not delete the row.

The first-owner INSERT is the only client write. A historical creator cannot re-insert themselves as owner after members already exist.

### `household_invitations`

| Operation | Policy |
| --- | --- |
| SELECT | Active owner |
| INSERT | Active owner and `invited_by = auth.uid()` |
| UPDATE | None. Acceptance is a service operation |
| DELETE | Active owner |

Ordinary members and historical members cannot read invitation tokens. Unrelated users cannot read them.

### `categories`

| Operation | Policy |
| --- | --- |
| SELECT | Historical member |
| INSERT | Active member and `created_by = auth.uid()` |
| UPDATE | Active member (archive is an UPDATE of `archived_at`) |
| DELETE | None |

Using an archived category on a new transaction remains an application rule.

### Financial and planning tables with `household_id`

Applies to `incomes`, `recurring_incomes`, `expenses`, `recurring_expenses`, `budgets`, and `goals`.

| Operation | Policy |
| --- | --- |
| SELECT | Historical member of `household_id` |
| INSERT | Active member, `created_by = auth.uid()`, subject (`member_id` / `payer_id`) is an active member of the same household when present, and `category_id` belongs to that household when present |
| UPDATE | Active member of the row’s household. Category must remain in that household |
| DELETE | None. Soft-delete / deactivate / archive instead |

UPDATE does not require the **subject** (`member_id` / `payer_id`) to still be active. Remaining members can correct or soft-delete rows that belong to people who have left. Integrity triggers still reject key changes that attach a new departed member.

A writer cannot move a row to another household. They cannot be an active member of two households, and UPDATE `WITH CHECK` requires active membership in `NEW.household_id`.

Personal budgets (`member_id IS NOT NULL`) require that member to be active on INSERT. Household budgets (`member_id IS NULL`) can be created by any active member.

Budgets do not restrict spending.

### Child tables

Applies to `expense_splits`, `recurring_expense_splits`, and `goal_contributions`.

| Operation | Policy |
| --- | --- |
| SELECT | Historical member of the parent household |
| INSERT | Active member of the parent household. Split/contribution `member_id` must be an active member of that household. `goal_contributions.created_by` must be `auth.uid()` |
| UPDATE | Active member of the parent household |
| DELETE | Active member of the parent household |

DELETE on splits is allowed so an edit can replace participants. Aggregate split totals remain an application/service transaction rule. There is no incremental-insert-blocking trigger.

Same-household integrity triggers from the foundation schema remain authoritative.

---

## 6. Owner-only operations

| Operation | Who | Mechanism |
| --- | --- | --- |
| Create invitation | Active owner | RLS INSERT |
| Read invitation / token | Active owner | RLS SELECT |
| Revoke invitation | Active owner | RLS DELETE |
| Delete household | Active owner | RLS DELETE (not a supported product path) |
| Accept invitation | Service | No client UPDATE policy |
| Leave / join | Service | No client UPDATE/DELETE on `household_members` |
| Change role / transfer owner | Service | No client UPDATE on `household_members` |
| Guarantee at least one owner | Service | Not an RLS invariant |

Active non-owner members can update household name and household financial/planning data. They cannot manage memberships or invitations.

---

## 7. Child-table authorization

Child tables do not store `household_id`. Policies call the parent-lookup helpers, then apply the same historical-read / active-write rule.

If the parent row is missing, the helper returns NULL and the membership check fails.

Cross-household splits fail twice:

1. RLS `is_active_member_of(parent_household, member_id)`
2. Foundation integrity trigger `assert_active_household_member`

---

## 8. Application/service-level limitations

RLS does not replace the application transaction rules in [database.md](./database.md).

Still application/service work:

- Household create + first owner row in one transaction
- Leave / join / invite accept / owner transfer
- At-least-one-owner invariant
- Expense + all splits in one transaction, including sum and personal-expense cardinality
- Recurring generate / edit / skip / confirm
- Soft-delete via `deleted_at`, deactivate via `is_active`, archive via `archived_at` / goal `status`
- Do not use archived categories on new transactions
- Do not hard-delete households, expenses, or goals in normal operation
- Income-based distribution and “requires review” derivation
- Rate-limiting household creation

RLS does not hide soft-deleted rows from members. The application filters `deleted_at`.

---

## 9. Critical scenarios

| Scenario | Result |
| --- | --- |
| A. Carlos and Diana in Nido A | Carlos can read and write A |
| B. Luis in Nido B | Luis cannot read or write A |
| C. Carlos leaves A | Carlos can read A history and cannot write A |
| D. Carlos joins B | Carlos can read/write B and can still read A |
| E. Expense inserted into another household | Denied |
| F. Split participant from another household | Denied |
| G. Income member from another household | Denied |
| H. `created_by` set to another user | Denied |

---

## 10. Security test matrix

Expected results for the documented actors. `allow` / `deny` are RLS outcomes. SELECT deny means zero visible rows, not necessarily an exception.

### Households and membership

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT household | allow |
| Carlos | A | active | UPDATE household name | allow |
| Carlos | A | active | DELETE household | allow (owner; not a product path) |
| Diana | A | active member | DELETE household | deny |
| Diana | A | active member | SELECT invitation | deny |
| Diana | A | active member | INSERT invitation | deny |
| Diana | A | active member | UPDATE membership role | deny |
| Carlos | A | active owner | SELECT/INSERT invitation | allow |
| Carlos | A | left | SELECT household | allow |
| Carlos | A | left | UPDATE/INSERT membership | deny |
| Luis | A | never member | SELECT household | deny |
| Luis | A | never member | INSERT anything into A | deny |
| Carlos | B | never member | SELECT household B | deny |
| Carlos | B | active | SELECT household B | allow |

### Profiles

| Actor | Subject | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | Carlos | self | SELECT/UPDATE profile | allow |
| Carlos | Diana | shared A | SELECT profile | allow |
| Carlos | Luis | no shared household | SELECT profile | deny |
| Carlos | Diana | left A | SELECT profile | allow |
| Carlos | Luis | joined B | SELECT profile | allow |
| Luis | Carlos | never shared | SELECT profile | deny |

### Categories

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT/INSERT/UPDATE | allow |
| Carlos | A | left | SELECT | allow |
| Carlos | A | left | INSERT/UPDATE/archive | deny |
| Luis | A | never member | SELECT/INSERT | deny |

### Incomes and recurring incomes

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT | allow |
| Carlos | A | active | INSERT income | allow |
| Carlos | A | active | UPDATE income | allow |
| Carlos | A | active | INSERT with `created_by` = Diana | deny |
| Carlos | A | active | INSERT with `member_id` = Luis | deny |
| Carlos | A | left | SELECT historical | allow |
| Carlos | A | left | INSERT/UPDATE | deny |
| Luis | A | never member | SELECT/INSERT | deny |
| Carlos | B | active | SELECT/INSERT in B | allow |

### Expenses and splits

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT expense | allow |
| Carlos | A | active | INSERT expense | allow |
| Carlos | A | active | UPDATE expense | allow |
| Carlos | A | active | SELECT/INSERT/UPDATE/DELETE split | allow |
| Carlos | A | active | INSERT expense into B | deny |
| Carlos | A | active | INSERT split with Luis as participant | deny |
| Carlos | A | active | INSERT expense with fake `created_by` | deny |
| Carlos | A | left | SELECT historical expense/split | allow |
| Carlos | A | left | INSERT/UPDATE expense | deny |
| Luis | A | never member | SELECT expense/split | deny |
| Luis | A | never member | INSERT expense | deny |
| Carlos | B | active | INSERT expense in B | allow |
| Carlos | A | left, now in B | SELECT A history | allow |
| Carlos | A | left, now in B | WRITE A | deny |

### Recurring expenses and splits

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT/INSERT/UPDATE rule | allow |
| Carlos | A | active | SELECT/INSERT/UPDATE/DELETE split | allow |
| Carlos | A | left | SELECT historical rule/split | allow |
| Carlos | A | left | UPDATE/deactivate rule | deny |
| Luis | A | never member | SELECT/INSERT | deny |

### Budgets

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT/INSERT/UPDATE household budget | allow |
| Carlos | A | active | INSERT personal budget for self | allow |
| Carlos | A | left | SELECT historical | allow |
| Carlos | A | left | INSERT/UPDATE | deny |
| Luis | A | never member | SELECT/INSERT | deny |

### Goals and contributions

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT/INSERT/UPDATE goal | allow |
| Carlos | A | active | INSERT contribution (`created_by = auth.uid()`) | allow |
| Carlos | A | active | INSERT goal with fake `created_by` | deny |
| Carlos | A | left | SELECT historical goal/contribution | allow |
| Carlos | A | left | INSERT/UPDATE goal | deny |
| Luis | A | never member | SELECT/INSERT | deny |

---

## 11. Tests

### What can be run in this repository now

This workspace has no Postgres client, no Docker, and no Supabase CLI.

The check that **was executed** and passed:

```bash
node supabase/tests/validate_rls_coverage.mjs
```

Result: RLS coverage validation passed for 14 tables. The script confirmed RLS is enabled on every foundation table, expected policies exist, helpers exist, `SECURITY DEFINER` functions set `search_path`, and no policy uses `USING (true)`. It does **not** prove runtime authorization.

`npm run build` was also run and succeeded. The frontend was not changed.

### What requires a Supabase database

`supabase/tests/rls_security_matrix.sql` is the behavioral matrix. It impersonates Carlos, Diana, and Luis with `auth.uid()` via JWT claims, then asserts SELECT / INSERT / UPDATE outcomes for scenarios A–H, owner restrictions, child-table inheritance, and post-leave historical read.

It has **not** been executed here. Do not treat it as passing.

To run it:

1. Install the Supabase CLI and start a local database, or use a linked project.
2. Apply both migrations (`supabase db reset` or equivalent).
3. Run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security_matrix.sql
```

The script fails fast if `auth.uid()`, `auth.users`, or role `authenticated` are missing. It rolls back seeded users after the assertions.

`auth.users` column requirements vary by Supabase version. If the seed insert fails, the script fails. That is a real failure, not a skipped pass.

### Recursion

Membership helpers are `SECURITY DEFINER` so `household_members` policies do not recurse. The runtime script includes a smoke test (`R01`) that calls the helpers and selects memberships as an authenticated user. That test also requires the Supabase environment.
