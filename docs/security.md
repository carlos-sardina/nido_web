# Nido security model

This document describes Row Level Security for the Nido domain model.

The domain model in [database.md](./database.md) is the source of truth. RLS implements authorization on that model. The live application must not be the authorization authority. Google OAuth is not a pending 9.4 item; see [future.md](./future.md). Personal-visibility RLS is specified in [phase-9.4.md](./phase-9.4.md) and is not applied yet.

Implementation:

- Schema: `supabase/migrations/20260816000000_nido_foundation_schema.sql`
- RLS: `supabase/migrations/20260817000000_nido_rls.sql`
- Runtime tests: `supabase/tests/rls_security_matrix.sql`
- Static coverage check: `supabase/tests/validate_rls_coverage.mjs`

---

## 1. Authentication assumption

Authorization uses Supabase Auth with email and password. Google OAuth is not enabled.

- `auth.uid()` is the authenticated user id.
- `profiles.id` is the same UUID as `auth.users.id`.
- Policies apply to the `authenticated` role.
- `anon` has no table privileges.
- `service_role` has full table privileges and bypasses RLS. The application does not use a service-role client. Invitation accept, leave, and owner transfer use narrowly scoped RPCs (`accept_invitation`, `leave_household`, `transfer_household_ownership`).

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
- savings_balances
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
| `goal_is_active(goal_id)` | Goal exists and `status = active` |

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

Leave and invitation accept are application RPCs (`leave_household`, `accept_invitation`). Owner transfer is `transfer_household_ownership`. They set `left_at` or `role`; they do not delete membership. There is no service-role client. There is still no client UPDATE policy on `household_members`.

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

Applies to `incomes`, `recurring_incomes`, `recurring_expenses`, `budgets`, `savings_balances`, and `goals`.

**`recurring_incomes` / `recurring_expenses` UPDATE is tighter** (Phase 9.1.5): the writer must be an **active** member and `created_by = auth.uid()`. INSERT also requires `member_id = auth.uid()` (income) or `payer_id = auth.uid()` (expense). Pause/reactivate is `is_active`. Physical DELETE remains denied. `recurring_expense_splits` writes follow `can_mutate_recurring_expense`.

**Las recurrencias son plantillas.** Materialize inserts a real `incomes` / `expenses` row. Templates never participate in financial totals.

**`expenses` UPDATE is tighter** (Phase 9.1.2B): the writer must be an **active** member, `created_by = auth.uid()`, and the row must not already be soft-deleted. Other members may SELECT. See the expenses table below.

**`expenses` INSERT locks payer identity** (Phase 9.2.4): `created_by = auth.uid()` and `payer_id = auth.uid()`. The registrar is the payer in v1. Shared splits may still include other active members. UPDATE WITH CHECK also keeps `payer_id = auth.uid()` so PostgREST cannot reattribute payment. `create_expense` remains `SECURITY INVOKER`.

**`incomes` UPDATE is tighter** (Phase 9.1.3C): the writer must be an **active** member, `created_by = auth.uid()`, `member_id` remains `auth.uid()`, and the row must not already be soft-deleted. INSERT also requires `member_id = auth.uid()`. Other members may SELECT. Physical DELETE remains denied.

**`budgets` UPDATE is tighter** (Phase 9.1.4): the writer must be an **active** member, `created_by = auth.uid()`, and the row must not already be soft-deleted. INSERT still allows any active member with `created_by = auth.uid()`. Create RPC always writes `member_id` NULL (Nido-level). Other members may SELECT. Physical DELETE remains denied. Spent is never stored.

**`goals` UPDATE is tighter** (Phase 9.1.3A): the writer must be an **active** member, `created_by = auth.uid()`, and the row must not already be archived. Other members may SELECT. Archive uses `status = archived`. Physical DELETE remains denied.

| Operation | Policy |
| --- | --- |
| SELECT | Historical member of `household_id` |
| INSERT | Active member, `created_by = auth.uid()`, subject (`member_id` / `payer_id`) is an active member of the same household when present, and `category_id` belongs to that household when present. **`incomes` / `recurring_incomes` INSERT** also requires `member_id = auth.uid()`. **`expenses` / `recurring_expenses` INSERT** also requires `payer_id = auth.uid()`. |
| UPDATE | Active member of the row’s household. Category must remain in that household. **`goals` UPDATE** also requires `created_by = auth.uid()` and `status <> archived`. **`incomes` UPDATE** also requires `created_by = auth.uid()`, `member_id = auth.uid()`, and `deleted_at IS NULL` (WITH CHECK allows setting `deleted_at`). **`expenses` UPDATE** also requires `created_by = auth.uid()`, `payer_id = auth.uid()`, and `deleted_at IS NULL` (WITH CHECK allows setting `deleted_at`). **`budgets` UPDATE** also requires `created_by = auth.uid()` and `deleted_at IS NULL` (WITH CHECK allows setting `deleted_at`). **`recurring_incomes` / `recurring_expenses` UPDATE** also requires `created_by = auth.uid()` and keeps `member_id` / `payer_id` as `auth.uid()` |
| DELETE | None. Soft-delete / deactivate / archive instead |

UPDATE does not require the **subject** (`member_id` / `payer_id`) to still be active. Remaining members can correct or soft-delete rows that belong to people who have left. Integrity triggers still reject key changes that attach a new departed member.

A writer cannot move a row to another household. They cannot be an active member of two households, and UPDATE `WITH CHECK` requires active membership in `NEW.household_id`.

Personal budgets (`member_id IS NOT NULL`) require that member to be active on INSERT. Household budgets (`member_id IS NULL`) can be created by any active member. Phase 9.1.4 create RPC only writes Nido-level rows. Onboarding (9.4.2) may INSERT a personal budget with `member_id = auth.uid()` from the same INVOKER transaction. Personal-visibility RLS is still 9.4.3.

**`savings_balances`:** SELECT is historical membership (same as today’s personal expenses). INSERT requires active membership, `created_by = auth.uid()`, and `member_id` NULL or `auth.uid()`. UPDATE is creator + active member. Physical DELETE is not granted. Personal-visibility filtering is 9.4.3.

Budgets do not restrict spending. Soft-delete uses `deleted_at` (migration `20260821230000`). `create_budget` / `update_budget` / `soft_delete_budget` are `SECURITY INVOKER`.

### Child tables

Applies to `expense_splits`, `recurring_expense_splits`, and `goal_contributions`.

**`expense_splits` writes** (Phase 9.1.2B) require `can_mutate_expense(expense_id)`: active membership, `created_by = auth.uid()`, and `deleted_at IS NULL` on the parent. SELECT stays historical-member.

**`goal_contributions` INSERT** (Phase 9.1.3B) requires active membership in the parent goal’s household, `created_by = auth.uid()`, `member_id = auth.uid()`, and `goal_is_active(goal_id)`. SELECT stays historical-member.

**`goal_contributions` UPDATE** (Phase 9.1.3D) requires the writer to be an **active** member of the parent goal’s household, `created_by = auth.uid()`, `deleted_at IS NULL`, and `goal_is_active(goal_id)`. `WITH CHECK` allows setting `deleted_at` (soft-delete) and keeps `created_by` / `member_id` as `auth.uid()`. Physical DELETE is revoked for `authenticated`; the remaining DELETE policy is creator-only so a restored GRANT cannot let another member hard-delete. Product delete is `soft_delete_goal_contribution`.

| Operation | Policy |
| --- | --- |
| SELECT | Historical member of the parent household |
| INSERT | Parent-household write rule. Split `member_id` must be an active member of that household. **`goal_contributions` INSERT** also requires `member_id = auth.uid()` and an active parent goal |
| UPDATE | Parent-household write rule. **`goal_contributions` UPDATE** is creator + active member + not deleted + parent goal active |
| DELETE | Parent-household write rule. **`goal_contributions` DELETE** is creator-only; privilege is revoked for `authenticated` |

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
| Accept invitation | `accept_invitation` RPC | No client UPDATE policy |
| Leave | `leave_household` RPC | No client UPDATE/DELETE on `household_members` |
| Transfer owner | `transfer_household_ownership` RPC | No client UPDATE on `household_members`. Caller becomes `member`; target becomes `owner` |
| Guarantee at least one owner | `leave_household` rejects the last owner; transfer requires an active member target | Not an RLS invariant |

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

- Household create + first owner row in one transaction (`create_household`)
- Onboarding finalize + income + split + savings + initial budgets in one transaction (`create_household_with_onboarding_income`; INVOKER; no client household_id or identity)
- Leave / invite accept (`leave_household`, `accept_invitation`)
- Owner transfer (`transfer_household_ownership`; atomic demote + promote)
- At-least-one-owner invariant (enforced on leave and transfer; not an RLS trigger)
- Expense + all splits in one transaction, including sum and personal-expense cardinality (`create_expense`, `update_expense`). For new shared expenses, `create_expense` (SECURITY INVOKER) reads `households.default_split_method` and does not accept a client method.
- Household name (`update_household_name`) and split preference (`update_household_default_split_method`) write only those columns. No client `household_id`.
- Category create / rename / archive (`create_category`, `rename_category`, `archive_category`). No hard delete. No client `household_id`.
- Recurring generate / edit / skip / confirm
- Soft-delete via `deleted_at` (`soft_delete_expense`, `soft_delete_goal_contribution`), deactivate via `is_active`, archive via `archived_at` / goal `status`
- Do not use archived categories on new transactions
- Do not hard-delete households, expenses, goals, or contributions in normal operation
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
| Carlos | A | active owner | transfer to Diana | allow |
| Diana | A | active member | transfer to Carlos | deny |
| Luis | A | never member | transfer into A | deny |
| none | - | none | transfer | deny |
| Carlos | A | active owner | transfer to self / historical / other Nido | deny |
| Carlos | A | last owner | leave without transfer | deny |
| Carlos | A | member after transfer | leave | allow |
| Luis | A | never member | SELECT household | deny |
| none | - | none | `create_household_with_onboarding_income` | deny |
| new user | new | none | `create_household_with_onboarding_income` with valid amount | allow (one income) |
| new user | new | none | invalid amount | deny (no household) |
| new user | new | none | `capacity` split | deny (no household) |
| new user | new | none | valid savings + estimates | allow (stock + budgets; no expenses) |
| same user | own | owner | second call | allow (same household; no second income, savings, budget, or category) |
| Carlos | B | active | second Nido / inject income or savings into A | no new household; A unchanged |
| historical member | old | left | `create_household_with_onboarding_income` | allow new Nido; old household unchanged |
| other member | other | active elsewhere | INSERT `savings_balances` for another member | deny |
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

### Recurring templates (Phase 9.1.5)

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active, creator | create / edit / pause / materialize | allow |
| Diana | A | active, not creator | edit / pause / materialize Carlos template | deny |
| Luis | A | never member | SELECT / create / materialize | deny |
| Carlos | A | left | SELECT | allow |
| Carlos | A | left | edit / materialize | deny |
| none | - | none | create / materialize | deny |

Same period + same `recurring_id` cannot insert two live movements.

### Incomes and recurring incomes

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT | allow |
| Carlos | A | active | INSERT income | allow |
| Carlos | A | active, creator | UPDATE / soft-delete income | allow |
| Carlos | A | active | INSERT with `created_by` = Diana | deny |
| Carlos | A | active | INSERT with `member_id` = Diana | deny |
| Diana | A | active, not creator | UPDATE / soft-delete Carlos income | deny |
| Carlos | A | left | SELECT historical | allow |
| Carlos | A | left | INSERT/UPDATE | deny |
| Luis | A | never member | SELECT/INSERT | deny |
| Carlos | B | active | SELECT/INSERT in B | allow |

### Expenses and splits

| Actor | Household | Membership | Operation | Expected |
| --- | --- | --- | --- | --- |
| Carlos | A | active | SELECT expense | allow |
| Carlos | A | active | INSERT expense (own `payer_id`) | allow |
| Carlos | A | active | INSERT expense with Diana / other-household `payer_id` | deny |
| Carlos | A | active, creator | UPDATE / soft-delete expense | allow |
| Diana | A | active, not creator | UPDATE / soft-delete Carlos expense | deny |
| Carlos | A | active | SELECT/INSERT/UPDATE/DELETE split of own expense | allow |
| Diana | A | active, not creator | INSERT/UPDATE/DELETE split of Carlos expense | deny |
| Carlos | A | active | INSERT expense into B | deny |
| Carlos | A | active | INSERT split with Luis as participant | deny |
| Carlos | A | active | INSERT expense with fake `created_by` | deny |
| Carlos | A | left | SELECT historical expense/split | allow |
| Carlos | A | left | INSERT/UPDATE expense | deny |
| Luis | A | never member | SELECT expense/split | deny |
| Luis | A | never member | INSERT/UPDATE expense | deny |
| Carlos | B | active | INSERT expense in B | allow |
| Carlos | A | left, now in B | SELECT A history | allow |
| Carlos | A | left, now in B | WRITE A | deny |
| Carlos | A | active | UPDATE already soft-deleted expense | deny |

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
| Carlos | A | active | SELECT/INSERT goal | allow |
| Carlos | A | active | UPDATE/archive own goal | allow |
| Carlos | A | active | INSERT goal with fake `created_by` | deny |
| Diana | A | active | SELECT Carlos’s goal | allow |
| Diana | A | active | UPDATE/archive Carlos’s goal | deny |
| Diana | A | active | INSERT own goal | allow |
| Carlos | A | left | SELECT historical goal/contribution | allow |
| Carlos | A | left | INSERT/UPDATE/archive goal | deny |
| Luis | A | never member | SELECT/INSERT | deny |
| Carlos | A | active | INSERT contribution on own or another member’s active goal | allow |
| Diana | A | active | INSERT contribution on Carlos’s goal | allow |
| Carlos | A | active | INSERT contribution on archived goal | deny |
| Carlos | A | active | INSERT contribution attributed to Diana (`member_id`) | deny |
| Carlos | A | left | INSERT contribution | deny |
| Luis | A | never member | INSERT contribution on A | deny |
| Carlos | A | active | UPDATE/soft-delete own contribution | allow |
| Diana | A | active | UPDATE/soft-delete Carlos’s contribution | deny |
| Luis | A/B | never member | UPDATE/soft-delete contribution on A | deny |
| Carlos | A | active | UPDATE/soft-delete after `deleted_at` | deny |
| Carlos | A | active | UPDATE/soft-delete contribution on archived goal | deny |
| Carlos | B | never member | UPDATE/soft-delete contribution whose goal is another Nido | deny |
| none | - | none | UPDATE/soft-delete contribution unauthenticated | deny |
| Carlos | A | left | UPDATE/soft-delete own contribution | deny |

---

## 11. Tests

### What can be run in this repository now

The static check that **was executed** and passed:

```bash
node supabase/tests/validate_rls_coverage.mjs
```

Result: RLS coverage validation passed for 14 tables at the 9.3/9.4.1 baseline. After 9.4.2 the same static script reports **15 tables** (adds `savings_balances`). The script confirmed RLS is enabled, expected policies exist, helpers exist, `SECURITY DEFINER` functions set `search_path`, and no policy uses `USING (true)`. It does **not** prove runtime authorization.

### Behavioral matrix against the linked project

`supabase/tests/rls_security_matrix.sql` was re-executed against linked `nido_dev` in the Phase 9.3.1 closure audit (239 assertions, 0 failed), including the previous 207 cases plus invitation product `J01`–`J30` (lookup, accept, cancel/DELETE). The script ends in `ROLLBACK` and does not persist seeded users. Existing **Departamento** and **Nido Smoke 924** rows were unchanged after the run.

Phase 9.3.2 did not add a migration, RPC, or RLS policy. Join writes `profiles.display_name` with the existing `profiles_update_self` policy (`id = auth.uid()`) and still accepts through `accept_invitation`. The matrix was not re-run; coverage remains 14 tables.

Phase 9.3.3 did not add a migration, table, column, RPC, or RLS policy. The QR is a client encoding of the existing invitation URL (`buildInvitationUrl` → `/join/<token>`). It is not a new authorization path. `lookup_invitation` and `accept_invitation` are unchanged. Web Share sends only that URL. The matrix was not re-run; coverage remains 14 tables.

Phase 9.3.4 did not add a migration, table, column, RPC, or RLS policy. It only removed Hogar prototype financial mocks. The matrix was not re-run; coverage remains 14 tables.

Phase 9.3.5 did not add a migration, table, column, RPC, or RLS policy. Perfil writes `profiles.display_name` with the existing `profiles_update_self` policy (`id = auth.uid()`). It is not `SECURITY DEFINER` and does not use `service_role`. The matrix was not re-run; coverage remains 14 tables.

```bash
npx supabase db query --linked -f supabase/tests/rls_security_matrix.sql
```

It impersonates Carlos, Diana, Luis, and Eva with `auth.uid()` via JWT claims, then asserts SELECT / INSERT / UPDATE outcomes for scenarios A–H, owner restrictions, child-table inheritance, one-active-Nido, post-leave historical read, expense mutation cases `X01`–`X14`, goal mutation cases `Y01`–`Y12`, contribution cases `Z01`–`Z22`, and owner-transfer / leave cases `T01`–`T13` and `T20`–`T30`.

`X08`–`X14` (creator update, non-creator deny, creator soft-delete, non-creator delete deny, other household, historical member, already-deleted) require migration `20260821120000`. `Y01`–`Y12` (create/update/archive goals, non-creator deny, other household, historical member, already-archived) require migration `20260821180000`. `Z01`–`Z11` (create contribution, other member, other household, archived goal, attributed member_id, over-target, missing goal, unauthenticated, after leave) require migration `20260821200000`. `Z12`–`Z22` (creator update/delete, non-creator deny, other household, deleted row, archived goal, other Nido goal, unauthenticated, historical member, member who left) require migration `20260821210000`. `I01`–`I13` require `20260821220000`. `K01`–`K16` (budget create/update/soft-delete, non-creator deny, other household, historical member, deleted row, spent derivation; 1:1 with the requested B01–B16 list) require `20260821230000`. Prefix **K** is used because **B01–B09** already cover Luis / never-member and **P01–P07** already cover child-table SELECT. `T01`–`T13` and `T20`–`T30` (owner transfer, last-owner leave, historical / other-Nido / unauthenticated deny, atomic role swap, privilege change after transfer) require `20260822000000`. `OB01`–`OB11` (onboarding persist: unauthenticated, no membership, invalid amount, double execution, already-active member, historical member, other Nido) require `20260822300000`. `OB12`–`OB28` (savings stock, estimates → budgets, split method, capacity reject, retry, other-Nido deny) require `20260822600000`. They are runtime SQL, not unit mocks.

The script rolls back its own seeded users. It does not empty the linked database: existing **Departamento** and **Nido Smoke 924** rows remain after `ROLLBACK`.

Two harness-only adjustments were required so the script can run on hosted Supabase. They do not change policies:

1. Grant `authenticated` access to the temp result tables. `SET LOCAL ROLE authenticated` cannot write owner-created temp tables otherwise.
2. Treat `UPDATE`/`DELETE` that affect zero rows as deny. PostgreSQL RLS filters those statements silently instead of raising.

To re-run:

```bash
npx supabase db query --linked -f supabase/tests/rls_security_matrix.sql
```

or:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security_matrix.sql
```

`auth.users` column requirements vary by Supabase version. If the seed insert fails, the script fails. That is a real failure, not a skipped pass.

### Recursion

Membership helpers are `SECURITY DEFINER` so `household_members` policies do not recurse. The runtime script includes a smoke test (`R01`) that calls the helpers and selects memberships as an authenticated user. That test also requires the Supabase environment.
