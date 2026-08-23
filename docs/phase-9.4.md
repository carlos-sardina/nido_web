# Phase 9.4 — Technical contract

Phase 9.4.0 (this document) is **scope, contract, and preparation**. **9.4.1 is implemented** (household name, initials contract, category RPCs + Hogar UI, `households.default_split_method`, `create_expense` uses that preference for new shared expenses). **9.4.2 is implemented** (onboarding persists savings stock, estimates as initial monthly budgets, and `contrib` → `households.default_split_method`). **9.4.3 is implemented** (personal budgets UI + global `profiles.personal_visibility` with RLS). **9.4.4 is implemented** (derived budget consumption; personal vs Nido; live expenses; no persisted spent). **9.4.5 is implemented** (refunds linked to the original expense, frozen refund splits, atomic `create_expense_refund`, net budget consumption). **9.4.6 is implemented** (derived monthly balance + derived settlements; no `balances` / `settlements` tables). **9.4.7 is implemented** (pull-to-refresh on the real tab/overlay scroll roots; reuses `dashboard.refresh()` / existing loaders; no Realtime). **9.4.8 is implemented** (leftover cleanup of proven-unused prototype constants, orphaned components, unused onboarding draft fields, and stale demo copy). **9.4.9 is not** implemented. Smoke UI and the live RLS matrix were not executed in the implementation environment — see [testing.md](./testing.md).

Source of confirmed product decisions: the 9.4.0 brief. Discarded items live in [future.md](./future.md). Do not re-interpret those as pending 9.4 work.

---

## 1. Audit of the current repo

### 1.1 Migrations

Exactly **18** local migrations. Remote (`nido_dev` / `pxfdvhavcddqmhuljxlf`) still has the previous **14** until 9.4.1–9.4.5 are applied. This phase must not run `supabase db push`.

| # | Migration |
| --- | --- |
| 1 | `20260816000000_nido_foundation_schema.sql` |
| 2 | `20260817000000_nido_rls.sql` |
| 3 | `20260818000000_nido_household_lifecycle.sql` |
| 4 | `20260821000000_nido_categories_and_create_expense.sql` |
| 5 | `20260821120000_nido_expense_mutations.sql` |
| 6 | `20260821180000_nido_goal_mutations.sql` |
| 7 | `20260821200000_nido_goal_contribution_mutations.sql` |
| 8 | `20260821210000_nido_goal_contribution_edit.sql` |
| 9 | `20260821220000_nido_income_mutations.sql` |
| 10 | `20260821230000_nido_budget_mutations.sql` |
| 11 | `20260822000000_nido_owner_transfer.sql` |
| 12 | `20260822120000_nido_recurrence_mutations.sql` |
| 13 | `20260822300000_nido_onboarding_financial.sql` |
| 14 | `20260822400000_nido_expense_payer_identity.sql` |
| 15 | `20260822500000_nido_household_categories_split.sql` |
| 16 | `20260822600000_nido_onboarding_savings_budgets.sql` |
| 17 | `20260822700000_nido_personal_visibility.sql` |
| 18 | `20260822800000_nido_expense_refunds.sql` |

Protected business data (do not touch): **Departamento**, **Nido Smoke 924**.

### 1.2 What already exists (live)

| Area | State |
| --- | --- |
| Auth | Email + password, confirmation, recovery. No Google OAuth. |
| Household | Create, leave, owner transfer, invitations (link / QR / Web Share only). |
| Household name | Stored on `households.name`. RLS: **any active member** may `UPDATE households`. No UI, no name-only RPC. |
| Categories | Household-scoped. Defaults seeded (`is_default`). Unique active name per type. Archive via `archived_at`. RLS allows active members to INSERT/UPDATE. **No RPC, no UI.** Forms only list active rows. |
| Expenses | Personal + shared. `create_expense` forces personal → `fixed`, shared → household preference. Creator-only edit/soft-delete. Personal SELECT follows `profiles.personal_visibility`. Shared stays visible to household members. |
| Incomes | Live. Onboarding monthly income persists as a real `incomes` row (Sueldo, today Mexico City) when amount > 0. |
| Nido budgets | Live monthly rows (`member_id` NULL). Spent is derived and **net** (9.4.5): live expenses in category + month minus refunds of those expenses. Includes visible personal expenses (D5). RLS hides `private` personal rows from peers. |
| Personal budgets | `create_budget(..., p_personal := true)` writes `member_id = auth.uid()`. Spent is only that owner’s `scope = personal` expenses in the same category + month, net of those expenses’ refunds. Shared expenses do not consume a personal budget. |
| Goals / contributions / recurrences | Live. Recurring **budgets** do not exist. |
| Activity | Derived from expenses, incomes, goal contributions, and refunds. No activity table. A refund opens the parent expense. |
| Split preference | Onboarding UI collects `equal` / `proportional` and persist writes `households.default_split_method`. `capacity` is not a product value. |
| DB `distribution_method` | `equal`, `percentage`, `fixed`, `income_based`. Stored **per expense / recurring template**, not on the household. |
| `income_based` | Recurring materialization only. Basis = **active recurring incomes** of participants. One-time `incomes` (including onboarding) do **not** participate. |
| Savings | Onboarding persists personal + shared stock in `savings_balances`. Not income, expense, or a goal. |
| Estimated onboarding expenses | Become initial monthly `budgets` (shared → `member_id` NULL; personal → creator). Never `expenses`. |
| Visibility | `profiles.personal_visibility` (`nido` \| `private`, default `nido`). One global setting for personal expenses, personal budgets, and personal savings. RLS helper `personal_finance_visible`. |
| Settlements / refunds | **Refunds live** (`expense_refunds` + frozen `expense_refund_splits`). Creator-only create via `create_expense_refund`. Immutable after insert. Monthly balance is derived: shared `paid − owed` net of those refunds, then pairwise obligations. No `balances` or `settlements` table. There is no “marcar como pagado”. |
| Initials | `initialsFromName`: one word → first **two** letters (`Carlos` → `CA`). Product contract is one letter (`C`). |
| Avatar image | `profiles.avatar_url` exists. No upload. Auth metadata `picture` may display as URL. |
| Refresh | `dashboard.refresh()` after mutations, error retry, and pull-to-refresh (9.4.7). MainApp shell does not scroll; **each tab** owns `h-full overflow-y-auto`. |
| Email invitations | Closed. `email` column historical, always inserted `null`. |

### 1.3 What must not be treated as pending 9.4

See [future.md](./future.md). Google OAuth, image avatars, notifications, Realtime, insights, persistent Activity, multi-currency, receipts, email invitations, recurring budgets, and push are **out of 9.4**.

---

## 2. Product → technical contract

### 2.1 Custom categories — IMPLEMENT

**Reuse:** `categories` + unique active name + `archived_at` + `is_default` + `category_id ON DELETE RESTRICT`. RLS already allows active-member INSERT/UPDATE.

**Add:**

| Layer | Change |
| --- | --- |
| RPC | `create_category`, `rename_category`, `archive_category` (SECURITY INVOKER). Do not hard-delete. |
| Domain | Wrappers + validation (name trim, unique, type, household). |
| UI | Create / rename / archive without breaking income/expense category pickers (active only). |
| Docs | Category CRUD is 9.4, not “still deferred”. |

**Rules:**

- Default catalog rows stay (`is_default = true`). They may be renamed; they must not be hard-deleted.
- Archive sets `archived_at`. Archived names may be reused.
- New expenses, incomes, and budgets still reject archived categories (existing RPC behavior).
- Any **active** member may mutate categories (same as current RLS). No owner-only restriction.

### 2.2 Personal expenses and personal budgets + visibility — IMPLEMENT

**Reuse:** `expenses.scope = personal` (already live). `budgets.member_id` for personal budgets (schema only today).

**Add:**

| Layer | Change |
| --- | --- |
| Schema | One global user setting, default **Visible al Nido**. Proposed: `profiles.personal_visibility` enum `nido` \| `private`, default `nido`. |
| RPC | Update-own-visibility (or a narrow profiles UPDATE of that column only). Extend `create_budget` (or add `create_personal_budget`) so `member_id = auth.uid()`. Client never sends another member’s id. |
| RLS | **Required.** React hiding is not sufficient. See §6. |
| UI | One control (Perfil or Hogar — implementation chooses the existing settings surface). Personal expense/budget lists. Default copy: **Visible al Nido** / **Solo yo**. |

**Rules:**

- One setting for the user. It applies to **both** personal expenses and personal budgets. No per-row privacy.
- **Visible al Nido:** other members of the household may read those rows (example: `Spotify — $200 — Carlos`).
- **Solo yo:** other members must not be able to query those rows. The owner always can.
- Shared expenses and Nido-level budgets (`member_id IS NULL`) are **unaffected**.
- Historical members keep today’s historical SELECT for rows they are allowed to see; they must not see another member’s `private` personal rows.
- Incomes are not in this setting (not specified). Do not hide incomes behind it.

**Personal-budget spent (9.4.4):**

- Nido budget: keep current formula (all live expenses in category + period that the viewer can SELECT). RLS is what hides `private` personal spend from other members.
- Personal budget: sum that member’s **personal** expenses (`scope = personal`) in the same category + period. Shared expenses do not consume a personal budget.

This last rule is a documented application choice left open in [database.md](./database.md) §7. It is not a new product feature.

### 2.3 Onboarding savings — IMPLEMENT

**Must persist as real financial stock.** Must not become a fake expense, income, or movement.

Onboarding already collects two optional amounts: **Ahorros personales** and **Ahorros compartidos**. Persist both when present.

**Minimum representation (new table, name to confirm in 9.4.2 SQL):**

```text
savings_balances
  household_id
  member_id     NULL = shared / Nido stock
                set  = personal stock (auth.uid() on create)
  amount        numeric(12,2) >= 0
  recorded_at   date (today America/Mexico_City on onboarding)
  created_by
  created_at / updated_at
```

Unique live row per `(household_id, member_id)` with `NULLS NOT DISTINCT` (one personal stock per member, one shared stock per Nido). Update in place later; do not append fake movements.

**Why not reuse:**

| Existing | Why it is wrong |
| --- | --- |
| `incomes` / `expenses` | Flows, not stock. |
| `goals` + `goal_contributions` | Requires `target_amount > 0`. Onboarding savings have no target. |
| Household / profile column | Cannot express personal + shared, history, or later metrics. |

Do **not** invent patrimonio / emergency-months / health metrics in 9.4. The row is the seed those metrics can read later.

**Visibility:** personal savings stock is personal information. Apply the **same** global setting as personal expenses/budgets (not specified explicitly; required so “Solo yo” is not bypassed by a new table). Shared savings stay visible to the Nido.

### 2.4 Onboarding estimated expenses → initial budgets — IMPLEMENT

They must **not** become `expenses`. They become **monthly budgets** for the current calendar month (`America/Mexico_City`).

| Estimate `type` | Budget |
| --- | --- |
| `shared` | Nido-level (`member_id` NULL) |
| `personal` | Personal (`member_id` = creator) |

**Category mapping (do not invent a collapse table):**

1. If `lower(trim(name))` matches an active expense category in the new household → use that id.
2. Else create a **custom** category (`is_default = false`) with that name and icon, then budget against it.

Examples: `Supermercado` and `Renta` do **not** match `Despensa` / `Vivienda`. They become custom categories. `Restaurantes` / `Limpieza` / `Mascotas` match defaults. `Spotify` becomes custom.

If two selected estimates share the same resolved category + scope + month, **sum** the amounts into one live budget (unique live index).

Zero / blank / unselected estimates are skipped (already the draft rule).

### 2.5 Household split method — IMPLEMENT

**Product values:** `equal` | `proportional`. **`capacity` is deleted** from product types and onboarding.

**Do not drop** DB enum values `percentage`, `fixed`, or `income_based`. They are live:

- `fixed` — personal expenses
- `equal` — current shared create path
- `percentage` / `income_based` — recurring materialization

**Add** a household preference, not a new per-expense UI for 9.4:

```text
households.default_split_method  equal | proportional
default: equal
```

Use a **new enum** (or a check constraint) with the **product** names. Do not store `capacity`. Map at computation time:

| Preference | New **shared** expense |
| --- | --- |
| `equal` | Today’s `allocateEqualSplits` / `distribution_method = equal` |
| `proportional` | Compute shares from income, persist frozen `expense_splits`, store `distribution_method = income_based` |

Personal expenses never read this preference (`fixed`, one split).

**Income basis for `proportional` (contract, required before `create_expense` uses the preference):**

Existing `income_based` for **recurring templates** stays: active `recurring_incomes` only.

For **new one-off shared expenses**, that basis is unusable: onboarding income is a one-time `incomes` row, so typical Nidos would get 0% / invalid.

Contract for one-off shared + household `proportional`:

1. Basis = `SUM(incomes.amount)` where `deleted_at IS NULL`, same household, participant `member_id`, `occurred_at` in the **current** calendar month (`America/Mexico_City`).
2. Member with zero in that month → 0%.
3. All participants zero → reject (`nido.invalid_split` / equivalent). User must use equal or add income. Same closed rule as today’s “all zero recurring income”.
4. Write computed `amount` + `percentage` on `expense_splits`. Historical rows are never recomputed.

Do **not** silently insert a `recurring_incomes` template from onboarding to make the old basis work.

Onboarding `contrib` must be persisted on household create (9.4.2). Hogar must show and edit it (9.4.1).

### 2.6 Edit household name — IMPLEMENT

**Authorization (existing contract, not invented):** `households_update_active_members` — any **active** member may UPDATE the household. Owner-only is **not** assumed.

**Add:** RPC `update_household_name(p_name)` SECURITY INVOKER that updates **only** `name` (normalized, non-blank). Prevents a client from writing `created_by`. UI on Hogar. Same Spanish validation as onboarding (`normalizeHouseholdName`).

### 2.7 Visual identity — initials only

Deterministic helper, reusable (replace `initialsFromName`):

```text
Carlos            → C
Carlos Sardina    → CS
Carlos A. Sardina → CS   (first + last token)
"" / whitespace   → ?
```

No Storage, no upload. Do not treat `profiles.avatar_url` or Auth `picture` as product identity in 9.4 UI. Image avatars: [future.md](./future.md).

### 2.8 Monthly balance + settlements — IMPLEMENTED (9.4.6)

No `balances` table. No `settlements` table. Source movements stay authoritative.

| Piece | Representation |
| --- | --- |
| Period | Calendar month, `America/Mexico_City`. Inclusive `YYYY-MM-DD` (`getMonthRange`). Refunds use the **expense** month, not the refund date. |
| Summary | Derived: period incomes, shared gross, shared net of refunds. Savings and budgets are not flows. |
| Member row | `paid` = shared expenses paid by the member minus those expenses’ refunds. `owed` = that member’s `expense_splits.amount` minus `expense_refund_splits`. `balance = paid − owed`. |
| Obligations | `deriveSettlements()` turns net balances into deterministic transfers. Not recorded payments. |
| Personal rows | Do **not** enter paid / owed / settlements. They remain personal even when `personal_visibility = nido`. |
| History | Any past month is recomputed from live rows (`deleted_at IS NULL`). Soft-deleted expenses and their refunds are omitted. |

A settlement in this phase is only a derived obligation: who owes whom how much. There is no “marcar como pagado”, no transfer ledger, and no Activity event.

UI: Home compact card + **Balance** overlay (month selector `< Agosto 2026 >`). Not a new tab. Health is unchanged.

### 2.9 Refunds — IMPLEMENT

Not a negative orphan expense.

```text
Expense
  └── expense_refunds (amount > 0, occurred_at, created_by, deleted_at)
        └── expense_refund_splits  (frozen copy of original percentages)
```

| Rule | Detail |
| --- | --- |
| Cap | Sum of live refunds ≤ original `expenses.amount` |
| Split | Automatic from original `expense_splits` percentages. No new split UI. $1000 60/40 + $500 refund → $300 / $200 |
| Who writes | Same as expense mutation: **creator** of the original expense, active member, live expense |
| Activity | Derived event (no activity table) |
| Budgets | `budgetSpent` becomes net: expense amounts − live refunds in range / category (and personal/Nido rules in §2.2) |
| Balance | Refunds reduce shared obligations in the **original expense month**, not the refund date (same as budget consumption) |
| Expense edit | Reject `update_expense` while live refunds exist (or require refunds deleted first). Do not rewrite history silently |

### 2.10 Pull-to-refresh — IMPLEMENTED (9.4.7)

No Realtime. No extra fetch functions.

**Container:** each main-tab scroll root (`h-full min-h-0 overflow-y-auto` on Home, Gastos, Ingresos, Metas, Hogar, Actividad). Not `MainApp` (`overflow-hidden`). Overlays that already have their own scroll (Presupuestos, Balance, Perfil, recurrencias) attach the same gesture to that root.

**Gesture (9.4.7 brief; supersedes the 9.4.0 “swipe up at end” sketch):** traditional pull-to-refresh. Swipe **down** only when that container is at `scrollTop === 0`. Threshold 72 px with resistance. Ignore mid-scroll. Touch-only; desktop mouse/trackpad keeps native scroll.

**Refetch:** the same live `dashboard.refresh()` / `useMonthlyBalance.refresh()` / existing Hogar and recurring loaders. `initialLoading` and `refreshing` are separate. In-flight lock ignores a second pull. Existing data stay on screen; a failed refresh keeps them and shows the existing error banner.

### 2.11 Leftover cleanup — IMPLEMENTED (9.4.8)

Delete only after proving no consumer. 9.4.8 removed proven-unused leftovers only. It did not change architecture, financial rules, RLS, RPCs, or SQL.

Removed (no runtime consumer):

- `ComingSoon`
- Prototype mocks `CATS`, `TOT_S`, `GOALS`, `FEED`, `LIFE_EVENTS`, `SAVE_METHODS`, `FREQUENCIES`, `EXP_CATS`, `GOAL_TYPES`
- Unused onboarding draft fields `freelance`, `savingsType`, `nestEmoji`
- Orphan wrappers `FlowHeader`, `OBtn2` / `PBtn`, `$k` / `pct`, `extract-components.mjs`, `ImageWithFallback`
- Unused `NidoHouse` `showCarlos` branch
- nest-ready “datos de demostración” copy

Kept (still consumed or legitimate):

- `EXP_SUGG`, `NIDO_NAMES`, `NEST_TYPES`, `QUICK_AMOUNTS`, `DEFAULT_QUICK`
- `nestType` and the `c-type` step (onboarding navigation; not persisted)
- sessionStorage draft until finalize
- `capacity` rejection tests and historical docs (product type stays deleted)
- Test fixtures named Diana / Carlos

`D_CAP` / `C_CAP` / `T_CAP` / `DIANA_*` were already gone from `src/`. `capacity` product type only — **not** DB `income_based`.

### 2.12 Out of 9.4 (do not implement)

Google OAuth, image avatar, notifications, Realtime, insights, persistent Activity, recurring budgets, multi-currency, receipts, email invitations, push. [future.md](./future.md).

---

## 3. Subphase order (validated)

The brief’s order is kept except one dependency: **refunds before monthly balance**, because net obligations and budget spent must include refunds.

```text
9.4.1  Household name + initials + categories + default_split_method
9.4.2  Onboarding persist (savings stock + estimates → budgets + split preference)
9.4.3  Personal budgets UI + global visibility (schema + RLS + UI)
9.4.4  Budget consumption (personal vs Nido; live expenses; no mocks)
9.4.5  Refunds + automatic splits + Activity/budget hooks
9.4.6  Monthly balance + derived settlements  **implemented**
9.4.7  Pull-to-refresh  **implemented**
9.4.8  Leftover cleanup (proven unused only)  **implemented**
9.4.9  Final documentation
```

**Why 9.4.2 after 9.4.1:** finalize needs category create + personal budget write + household split column.

**Why 9.4.3 after 9.4.2:** default visibility is `nido` (same as today’s open SELECT). No privacy regression if personal budgets are written before the `private` policy exists. RLS for `private` lands in 9.4.3 **before** the setting can be flipped.

**Why refunds before balance:** §2.8 net figures are wrong if refunds land after.

Do not implement a later subphase early.

---

## 4. Proposed migrations (later subphases — not in 9.4.0)

No SQL in this phase.

| When | Migration (proposed) | Contents |
| --- | --- | --- |
| 9.4.1 | `20260822500000_nido_household_categories_split.sql` | **Created.** `households.default_split_method`; category RPCs; `update_household_name`; `update_household_default_split_method`; `create_expense` uses the household preference for new shared expenses. |
| 9.4.2 | `nido_onboarding_savings_budgets` | `savings_balances` + RLS; extend `create_household_with_onboarding_income` (or replacement) to persist savings, estimates→budgets, split method |
| 9.4.3 | `20260822700000_nido_personal_visibility.sql` | **Created.** `personal_visibility` enum + `profiles` column; `personal_finance_visible`; `update_personal_visibility`; `create_budget` personal path; SELECT policies on expenses, splits, budgets, and savings. |
| 9.4.5 | `20260822800000_nido_expense_refunds.sql` | **Created.** `expense_refunds`, `expense_refund_splits`, `create_expense_refund`, RLS, edit-block triggers. Refunds are immutable (no `soft_delete_refund`). |
| 9.4.6 | none if derived-only | Add a table only if a later decision requires recorded transfers |

9.4.4 / 9.4.7 / 9.4.8 / 9.4.9 are expected to be application + docs unless a gap appears.

---

## 5. Proposed RPCs

All SECURITY INVOKER unless noted. `auth.uid()` is the actor. No `service_role` for normal operations. No client-supplied `created_by`.

| RPC | Phase | Role |
| --- | --- | --- |
| `update_household_name(p_name)` | 9.4.1 | Active member. Updates `name` only. |
| `create_category(...)` | 9.4.1 | Active member. `is_default = false`. |
| `rename_category(p_category_id, p_name)` | 9.4.1 | Active member. Unique active name. |
| `archive_category(p_category_id)` | 9.4.1 | Active member. Sets `archived_at`. |
| extend `create_household_with_onboarding_income` | 9.4.2 | Persist split method, savings rows, initial budgets (and custom categories) atomically with today’s household + income. |
| `update_personal_visibility(p_visibility)` | 9.4.3 | Self only. |
| extend `create_budget` / personal variant | 9.4.3 | `member_id = auth.uid()` when personal. |
| `create_expense_refund(p_expense_id, p_amount)` | 9.4.5 | Expense creator; writes refund + frozen splits in one transaction. No edit/delete RPC: refunds are immutable. |

Existing `create_expense` must accept household `proportional` for **shared** rows (9.4.1 or immediately after the column exists). Personal path unchanged.

---

## 6. Proposed RLS

Keep current helpers. Do not weaken historical read of **shared** data.

| Object | SELECT change |
| --- | --- |
| `expenses` | Shared: unchanged (household member). Personal: owner **or** owner’s `personal_visibility = nido`. |
| `expense_splits` | Via parent expense (hidden personal expense hides splits). |
| `budgets` | Nido (`member_id` NULL): unchanged. Personal: owner **or** owner’s visibility `nido`. |
| `savings_balances` | Shared (`member_id` NULL): household member. Personal: same visibility rule. |
| `expense_refunds` (+ splits) | Via parent expense. |
| `profiles.personal_visibility` | Readable by household peers (needed to evaluate… **no** — peers must not need to read the column if policies use a SECURITY DEFINER helper). Prefer `personal_finance_visible(owner_id)` STABLE SECURITY DEFINER (`search_path = public`) so the policy does not leak other profile fields. |
| `households` UPDATE | Unchanged (active members). RPC still required so only `name` / later `default_split_method` are written. |

INSERT/UPDATE/DELETE stay creator-or-active-member as today. Visibility is a **SELECT** concern.

UI filters are presentation only.

---

## 7. Proposed domain / types

| Today | 9.4 |
| --- | --- |
| `Model = "equal" \| "proportional" \| "capacity"` | Drop `capacity`. Household preference = `equal` \| `proportional`. |
| `DistributionMethod` | Unchanged DB union. |
| `initialsFromName` | First letter of first token; first+last if 2+ tokens. |
| `OnboardingFinancialPlan` | Persist savings + estimates + `contrib`; drop those `skipped` reasons when written. |
| `create_budget` | Personal payload (`memberId` implied by auth, not a free client field). |
| `budgetSpent` | Net of refunds; personal budgets filter `scope = personal` + member. |
| Activity types | `refund` derived from embedded `expense_refunds`. Opens the parent expense. |
| New | `SavingsBalance`, `PersonalVisibility`, `ExpenseRefund`, `MonthlyBalance`, `DerivedSettlement`. |

No persistent activity types. No notification types. No OAuth types.

---

## 8. Proposed UI (later subphases)

| Surface | Work |
| --- | --- |
| Hogar | Edit Nido name; show/edit split method; initials. |
| Categories | Manage list (likely from expense/income forms or Hogar — do not add a new bottom tab). |
| Perfil | Initials (not image); **Visible al Nido / Solo yo**. |
| Expense form | Shared default split from household preference. Personal unchanged. Category create/rename. |
| Budget form | Nido vs personal. Consumption: presupuesto / gastado / consumo % / restante from live data. |
| Onboarding | Persist savings, estimates, `contrib`. Remove capacity types. `nest-ready` no longer says the data is a demonstration. |
| Gastos / Home | Personal vs shared remain; honor RLS (empty for others when private). |
| Refund | From expense detail, creator only. No split editor. |
| Balance | **Implemented (9.4.6).** Period statement + derived who-owes-whom. No “cierre de mes” ceremony. No “marcar como pagado”. |
| All main tabs | Pull-to-refresh from the top of each tab scroll root (9.4.7). |

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| `households` UPDATE can change `created_by` today | Name (and split) RPCs write specific columns only. |
| Personal SELECT is currently wide open | Visibility RLS in 9.4.3; default `nido` matches current behavior. |
| Nido budget spent includes personal expenses | After RLS, other members’ totals omit `private` rows. Document the discrepancy. Prefer Nido spent = shared-only **only** if a later brief requires identical totals; not specified now. |
| `proportional` vs `income_based` recurring basis | Two bases, documented in §2.5. Do not change recurring materialization in 9.4. |
| Onboarding estimate names ≠ default catalog | Custom categories, not a silent map. |
| Unique live budget collision | Sum same category+scope+month. |
| Refunds + `update_expense` | Block edit while live refunds exist. |
| Pull-to-refresh on the wrong node | Attach per tab, not MainApp. |
| Cleanup deleting live constants | 9.4.8 consumer proof only. |
| Accidental Realtime / OAuth / email invite | [future.md](./future.md). |
| `service_role` / touching Departamento or Smoke 924 | Forbidden. Tests use ROLLBACK or isolated temp rows. |

---

## 10. Pending decisions

None of these block **9.4.1** (name, initials, categories, persist-the-column).

| # | Topic | Status |
| --- | --- | --- |
| D1 | Who can edit the Nido name? | **Resolved by current RLS:** any active member. Do not invent owner-only. |
| D2 | Income basis for `proportional` on new shared expenses | **Resolved in this contract** (§2.5): current-month confirmed `incomes`. Recurring templates unchanged. Confirm only if product wants a different basis. |
| D3 | Recorded settlement **payments** (ledger table + “marcar pagado”) | **Open — not required to start 9.4.6 derived statement.** Do not invent the UX. Ask before adding a table. |
| D4 | Who may create a refund? | **Resolved in this contract:** original expense creator (same as edit/delete). |
| D5 | Do personal expenses consume Nido-level budgets? | **Keep current formula** (all visible expenses in category). RLS hides `private` rows from others. Not a product block. |

No indispensable product decision is missing for **LISTA PARA IMPLEMENTACIÓN** of 9.4.1.

---

## 11. Documentation owned by 9.4.0

| File | Role |
| --- | --- |
| [future.md](./future.md) | Futuro vs fuera de alcance. |
| [phase-9.4.md](./phase-9.4.md) | This contract. |
| [nido.md](./nido.md) | Stop listing discarded items as “what remains”. |
| [database.md](./database.md) | Frontend is live, not a disposable prototype. Deferred list aligned. |
| [financial.md](./financial.md) | Pointer to 9.4; onboarding still draft-only until 9.4.2. |
| [security.md](./security.md) | Auth/OAuth wording; remove “prototype UI” as authority. |
| [supabase.md](./supabase.md) | Google OAuth → future, not “this iteration”. |
| [testing.md](./testing.md) | 9.4.0 validation record. |

---

## 12. Verdict

```text
9.4.8 IMPLEMENTADA (CASI CERRADA) — veredicto de cierre en testing.md
```

Next subphase: **9.4.9** — final documentation.

Do not declare 9.4.9 or phase 9.4 complete.
