# Nido membership and invitations

This document describes household (Nido) creation, membership, leaving, invitations, and the pre-dashboard flow. Phase 8.10.2 hardens the signup confirmation copy so an ambiguous `signUp()` success is not treated as proof that an email was sent.

The schema in [database.md](./database.md) remains the source of truth. RLS in [security.md](./security.md) is unchanged: clients still cannot UPDATE `household_members`. Owner transfer and owner-initiated remove are SECURITY DEFINER RPCs. They do not change tables or weaken policies.

Phase 9.1.1 connects the Home dashboard to live Supabase reads. Phase 9.1.2A adds household default expense categories and **Registrar un gasto**. Phase 9.2.2 persists the onboarding monthly income with the new Nido. Phase 9.2.3 re-audited that stack on `nido_dev` and did not add product surfaces. Auth, recovery, and RLS policies are unchanged. See [financial.md](./financial.md). Auth and onboarding visuals use the tokens in [design-system.md](./design-system.md).

---

## Auth flow

Unauthenticated visitors see only authentication:

1. Landing: **Crear cuenta** / **Iniciar sesión**. It does not offer “Crear un Nido” or “Unirme a un Nido”.
2. Signup with email, password, and confirmation. Email is trimmed and lowercased. The UI only validates format; it does not look up whether the address exists. Email uniqueness is owned by Supabase Auth. With Confirm email enabled, a successful `signUp()` without a session can be a new registration **or** an obfuscated response for an existing account. The UI uses the same **Revisa tu correo** screen for both and does **not** distinguish them, to avoid user enumeration. Copy does not claim that a confirmation email was sent. A Nido is not created. If Supabase returns an explicit `user_already_exists` error, the generic message and **Iniciar sesión** are shown — it does not say the email is already registered. **Reenviar correo** uses a 60-second UX cooldown (persisted in `sessionStorage` as action + normalized email + timestamp, never tokens or passwords) and the same auth error classifier; success copy does not reveal whether the address exists. The cooldown is a frontend guard, not a substitute for Supabase/Brevo rate limits. **¿Ya tienes una cuenta?** / **Volver a iniciar sesión** returns to login with the same email and does not create a session.
3. Login with email and password. Invalid credentials stay generic. Unconfirmed email offers **Reenviar correo de confirmación**. Rate limits and network errors have their own Spanish copy. Raw Supabase errors are never shown.
4. Recovery: forgot password → email → `/auth/callback` → `/auth/update-password`. The same 60-second UX cooldown applies per normalized email, independently from confirmation resend. The callback marks the session as password recovery so other tabs do not treat it as a normal login. `next` is sanitized with `safeNextPath`. Tokens stay in cookies, not URLs or `localStorage`. After `updateUser({ password })`, routing is the normal authenticated destination (MainApp or Nido selection).
5. Logout: `signOut()`, clear the invitation token and the onboarding draft, return to the auth landing. It does not delete Supabase rows.

Google OAuth is out of scope ([future.md](./future.md)). It is not a pending 9.4 item. Email confirmation remains required. SMTP is configured outside this repository.

---

## Nido selection

After a confirmed session, if the user has **no active membership**, the app shows Nido selection — a separate stage from auth:

- **Crear un nuevo Nido** starts the local onboarding draft.
- **Unirme a un Nido** asks for an invitation link and continues at `/join/<token>`.

Historical membership (`left_at` set) is not an active Nido. Those users also see selection.

Entering this screen does not create a household.

---

## Onboarding lifecycle

Create-Nido is a **local draft** until the user explicitly finishes:

```
Nido selection
  → nombre del Nido
  → nombre personal
  → ingreso
  → ahorros
  → gastos mensuales estimados
  → método de división
  → invitaciones
  → Crear mi Nido / Invitar
  → create_household_with_onboarding_income + profiles.display_name
  → dashboard (live reads; the declared monthly income is a real incomes row)
```

Draft fields stay in React state and `sessionStorage` (`nido.onboardingDraft`) until finalize succeeds. That key is not used for auth tokens. After a confirmed persist the draft is cleared so it cannot become a second source of truth.

Abandoning before **Crear mi Nido** leaves no household, no membership, and no financial rows. Refresh during a draft step restores the local draft; it does not create a Nido. Logout clears the draft. A failed Supabase call keeps the draft so the user can retry. A second tap while the request is in flight is ignored. A retry after a successful persist returns the existing Nido and does not insert another income.

`profiles.display_name` is written when the Nido is finalized, not when the name step is shown. Default expense and income categories are inserted in the same transaction as the household.

---

## When the household is created

The household is **not** created when the user enters onboarding.

It is created on the invitations step, when the user taps **Crear mi Nido**, **Invitar por enlace**, or **Invitar por QR**. Those actions call `create_household_with_onboarding_income` (atomic household + owner membership + default catalogs + split preference + optional savings stock + initial budgets from estimates + the declared monthly income) after `updateMyDisplayName`. Optional invitation rows are inserted only after that RPC succeeds.

Invitation links need a `household_id`, so generating a real link or QR finalizes the Nido first. Income, `contrib`, savings, and selected estimates are persisted in that same transaction.

If the user leaves before that tap, nothing is written to `households` or `household_members`.

---

## One active Nido per user

A user may belong to **at most one active Nido**.

Active membership is a `household_members` row with `left_at IS NULL`. The unique index `household_members_one_active_membership_idx` enforces this.

A Nido may have one person, two people, or many people. There is no couple assumption and no member cap.

The UI must never imply that multiple active Nidos are supported.

Household **names** are not unique. `households.id` is the identity. `profiles.display_name` is not unique. Invitation `token` is unique. Auth email uniqueness stays with Supabase Auth. The frontend never queries `auth.users` and never exposes an “email exists” check.

Nido does not support email invitations. Invitations are shared with a link, a QR, and Web Share when the browser provides it. `household_invitations.email` exists in the historical schema, including the unique pending-email index, but the UI does not use that mechanism and new invitations always insert `email` as null.

---

## Membership lifecycle

| State | Meaning | App destination |
| --- | --- | --- |
| Unauthenticated | No session | Auth landing |
| Authenticated + no memberships | Never belonged to a Nido | Nido selection |
| Authenticated + historical only | `left_at` is set on every row | Nido selection |
| Authenticated + active | `left_at IS NULL` | Main app / live dashboard |
| Authenticated + invitation pending | `/join/<token>` after email confirmation or a pasted link | Invitation acceptance |

Historical membership is **not** current membership. A person who has left may create or join another Nido.

Rejoining the same Nido creates a **new** `household_members` row. The previous row stays historical.

---

## Leaving and rejoining

`leaveHousehold()` calls `public.leave_household()`.

- The caller must have an active membership.
- The operation sets `left_at = now()`.
- The membership row is not deleted.
- The household is not deleted.
- Historical financial rows stay attached to the original `household_id` and `profiles.id`.

The last active owner cannot leave. They must transfer ownership first. The RPC returns `nido.last_owner`.

After leaving, the user returns to Nido selection and may create or join another Nido.

---

## Removing a member

An active owner can remove another **active member** of the same Nido. This is not self-leave.

`removeHouseholdMember(targetUserId)` calls `public.remove_household_member(p_target_user_id)`.

| Actor | Remove member |
| --- | --- |
| Current owner | Yes, an active **member** of the same Nido |
| Active non-owner | No (`nido.forbidden`) |
| Historical member | No (`nido.not_a_member`) |
| Other Nido / unknown / historical target | No (`nido.invalid_remove_target`) |
| Self | No (`nido.cannot_remove_self`); use **Salir del Nido** |
| An owner | No (`nido.invalid_remove_target`); transfer first if they should leave |
| Unauthenticated | No (`nido.unauthenticated`) |

Remove sets `left_at = now()` on the target row. The row is not deleted. The household is not deleted. Historical financial rows stay attached to the original `household_id` and `profiles.id`. The target’s `recurring_incomes` in that Nido are deactivated, same as `leave_household`.

The RPC takes only `p_target_user_id`. It does not take `household_id`, `owner_id`, or `user_id`. `auth.uid()` is the actor. Clients still cannot `UPDATE` `household_members`.

**Eliminar** on Hogar is owner-only, hidden for self and for owners, asks for confirmation, and shows success or error.

---

## Owner transfer

Ownership is `household_members.role = owner` with `left_at IS NULL`. There is no `households.owner_id`. `households.created_by` is the original creator and does **not** change on transfer.

`transferHouseholdOwnership(newOwnerId)` calls `public.transfer_household_ownership(p_new_owner_id)`.

| Actor | Transfer | Leave |
| --- | --- | --- |
| Current owner | Yes, to another **active member** of the same Nido | No, while they are the last owner |
| Active non-owner | No (`nido.forbidden`) | Yes (sets `left_at`) |
| Historical member | No (`nido.not_a_member`) | No (`nido.not_a_member`) |
| Other Nido / unknown target | No (`nido.invalid_transfer_target`) | — |
| Self | No (`nido.cannot_transfer_to_self`) | — |
| Unauthenticated | No (`nido.unauthenticated`) | No |
| Last active member | No eligible target | No (they are the last owner) |

Transfer is **replacement**, not co-ownership: the caller becomes `member` and the target becomes `owner` in one transaction. The former owner stays in the Nido until they leave. After that they can leave; the Nido still has an owner.

The RPC takes only `p_new_owner_id`. It does not take `household_id`, `owner_id`, or `user_id`. `auth.uid()` is the actor. Clients still cannot `UPDATE` `household_members`.

Financial rows are unchanged: `expenses`, `expense_splits`, `incomes`, `budgets`, `goals`, and `goal_contributions` keep their `household_id` and `profiles.id` FKs. Creator-only mutation rules stay. History is not rewritten.

The Hogar tab shows who is owner. **Transferir propiedad** is owner-only, asks for confirmation, lists other active members (not self), and shows success or error. **Eliminar** on a member row is owner-only, excludes self, and asks for confirmation. Profile **Salir del Nido** tells a last owner to transfer first; it does not add a second transfer CTA.

---

## Owner and member semantics

| Role | How it is assigned |
| --- | --- |
| `owner` | First member of a newly created Nido, or the target of `transfer_household_ownership` |
| `member` | Invitation acceptance, or the previous owner after a transfer |

Active owners may create, read, and revoke invitations (existing RLS), and remove another active member. Active members may read household identity and leave, subject to the last-owner rule.

---

## Invitation lifecycle

Nido does not support email invitations. Owners share a bearer token through a link (`/join/<token>`), a QR of that same URL, and Web Share when the browser provides it.

Invitations use `household_invitations`. No new table.

1. An active owner calls `createInvitation({ householdId })`.
2. The service inserts a row with a cryptographically random token and an expiration. `email` is always null.
3. Hogar copies `/join/<token>` and refreshes the invitation list.
4. `listInvitations()` reads the owner's rows via RLS. Status is derived with `classifyInvitation` (`valid` → Pendiente, `accepted` → Aceptada, `expired` → Expirada). There is no `status` column.
5. A pending invitation can copy the existing token again (`buildInvitationUrl`), show a real QR of that same URL, or be cancelled.
6. Cancel is a client `DELETE` of `household_invitations.id` only. RLS restricts it to the active owner. There is no cancel RPC and no `cancelled_at`.
7. Anyone with the link can look up status and the Nido name.
8. An authenticated user with no active Nido can accept. If `profiles.display_name` is still the email local-part fallback, they enter a name first; that UPDATE uses the existing self policy.
9. Acceptance inserts a `member` row and sets `accepted_at`. The public preview never receives `household_id`; already-this vs already-other is decided by `accept_invitation` error codes.

Join-page statuses shown to the invitee:

- valid
- expired
- already accepted
- invalid
- already belongs to a Nido
- already belongs to this Nido

Hogar does not show the full token or URL. Lookups and RPCs do not return the token, email, household id, or financial data. `InviteQrModal` renders a real QR that encodes exactly `buildInvitationUrl(origin, token)` (`/join/<token>`). Copy and optional Web Share (`navigator.share({ url })`, only when the browser supports it) use that same URL. Accepted and expired invitations cannot open the QR. There is no short code, alternate URL, or extra identifier.

---

## Invitation expiration

Default lifetime is **7 days** (`INVITATION_TTL_DAYS` in `src/lib/nido/types.ts`).

`expires_at` is stored on the row. `lookup_invitation` and `accept_invitation` both reject `expires_at <= now()`.

Accepted invitations stay accepted even if they would also be expired.

---

## What this phase persists

| Data | Where |
| --- | --- |
| Household name | `households.name` |
| Creator | `households.created_by = auth.uid()` |
| Owner membership | `household_members` (`role = owner`, `left_at` null) |
| Member membership | `household_members` (`role = member`) on accept |
| Display name | `profiles.display_name` |
| Invitation | `household_invitations` (token, expiry, accepted_at). `email` is historical and unused by the product. |
| Leave | `household_members.left_at` |
| Owner remove member | `household_members.left_at` via `remove_household_member` (owner-only; not self) |
| Owner transfer | `household_members.role` swapped atomically (`transfer_household_ownership`) |
| Default expense and income categories | `categories` (`is_default = true`) via `create_household` |
| Custom / renamed / archived **expense** categories | `categories` via `create_category` / `rename_category` / `archive_category` (9.4.1). Income is Sueldo + Extra only. No hard delete. |
| Household name edit | `households.name` via `update_household_name` (active member; name only) |
| Household split preference | `households.default_split_method` via `update_household_default_split_method` (`equal` \| `proportional`) |
| Onboarding monthly income | `incomes` via `create_household_with_onboarding_income` → `create_income` |
| Onboarding savings stock | `savings_balances` (`member_id` set = personal, NULL = shared) |
| Onboarding estimated expenses | initial monthly `budgets` (shared → Nido, personal → creator). Never `expenses`. |
| Onboarding split preference | `households.default_split_method` (`equal` \| `proportional`) |
| Confirmed expense | `expenses` + `expense_splits` via `create_expense` |
| Expense refund | `expense_refunds` + `expense_refund_splits` via `create_expense_refund`. Immutable. |
| Personal visibility | `profiles.personal_visibility` (`nido` \| `private`, default `nido`) via `update_personal_visibility` |
| Personal / Nido budgets | `create_budget` (`p_personal` → `member_id = auth.uid()`, default → NULL). Spent is derived, never stored. |

Auth identity still comes from Supabase Auth. The profile is the canonical application display name. Auth user metadata is not updated.

Perfil shows that persisted name and lets the signed-in user edit `profiles.display_name`. The write is the existing `updateMyDisplayName` path (`normalizeDisplayName` + `profiles` UPDATE). RLS remains `profiles_update_self` (`id = auth.uid()`). After a successful save, the UI applies the normalized name with `applyProfileDisplayName` and does not reload the app.

Perfil also has **Visibilidad de mis datos personales**: **Visible al Nido** / **Solo yo**. That writes `profiles.personal_visibility` via `update_personal_visibility` (`auth.uid()` only). Default is `nido`. The same preference applies to personal expenses, personal budgets, and personal savings. Shared / Nido rows are unaffected. Privacy is enforced by RLS (`personal_finance_visible`), not only by React.

---

## What is still mock / local

The create-Nido draft stays in `sessionStorage` until finalize. After persist, Home reads live rows. Nest type (`c-type`) is local onboarding UX only; it is not written to the household. Unused draft leftovers (`freelance`, `savingsType`, `nestEmoji`) were removed in 9.4.8.

The onboarding **Ingreso mensual neto** is persisted. Category is the household **Sueldo** catalog row. `occurred_at` is today in `America/Mexico_City`. Description is `Ingreso mensual neto`. Amount `0` creates the Nido and writes no income row. Joiners are asked the same question on `/join/<token>` and persist with `create_income` after accept.

Personal / shared savings persist as `savings_balances` stock (zero is valid; blank is omitted). Estimated monthly expenses become current-month `budgets` using the estimate name as the category (`Renta` stays `Renta`). `contrib` writes `households.default_split_method`. `capacity` is rejected.

Live on Home, empty when the Nido has no financial rows:

- confirmed incomes and expenses (ingresos and gastos registered from `+` are live)
- goals and contribution progress
- Nido and personal budgets for the current month (create / edit / soft-delete from Home and `+`; lists are separate). Each row shows budgeted / consumed / % / remaining from live expenses **net of refunds** (`America/Mexico_City` month, `deleted_at IS NULL`). A refund reduces the original expense’s month, not the month it was recorded. Nido consumption includes visible personal expenses; personal consumption is only the owner’s personal expenses. Percentage may exceed 100%; remaining may be negative.
- activity derived from expenses, incomes, goal contributions, and refunds (not budget mutations). Activity stays derived. Private personal rows of other members never enter the snapshot. A refund is a derived event linked to the original expense.

Not in this product and not pending 9.4 ([future.md](./future.md)):

- push / notification delivery
- Supabase Realtime subscriptions

Hogar no longer shows the prototype contribution-model block (`D_INC` / `TOT_B`, Persona A / Persona B). Phase 9.4.1 adds live Hogar surfaces for the Nido name, `default_split_method` (`equal` / `proportional`; `capacity` is not a product value), and **expense** category create / rename / archive. Income categories are fixed (Sueldo and Extra) and are not listed in that card. Initials use first letter of the first token and, when there are two or more words, the first letter of the last token (`Carlos` → `C`, `Carlos Sardina` → `CS`).

Perfil no longer shows prototype personal-expense lists (`DIANA_ITEMS` / `DIANA_EXTRAS`). Those sections were removed; they were not replaced with another financial model.

Gastos, Metas, Crear una meta, and Registrar una aportación are live. Household name, member list, membership role, and `profiles.display_name` come from Supabase after the Nido is finalized.

---

## Transactions and RPCs

The PostgREST client cannot run a multi-statement transaction. These operations use Postgres functions.

| Function | Security | Why |
| --- | --- | --- |
| `create_household(p_name)` | `SECURITY INVOKER` | Household + first owner + default catalogs must be atomic. RLS still applies. |
| `create_household_with_onboarding_income(p_name, p_income_amount, p_split_method, p_savings_personal, p_savings_shared, p_estimates)` | `SECURITY INVOKER` | Reuses `create_household` + `create_income` and writes split, savings stock, and initial budgets in the same transaction. Takes no household_id or identity. New parameters default so older 2-argument calls still work. |
| `create_expense(...)` | `SECURITY INVOKER` | Expense + splits must be atomic. Split sums and personal cardinality are enforced here. RLS still applies. |
| `create_expense_refund(p_expense_id, p_amount)` | `SECURITY INVOKER` | Refund + frozen splits in one transaction. Locks the expense (`FOR UPDATE`). Client sends only expense_id and amount. |
| `create_goal(...)` / `update_goal` / `archive_goal` | `SECURITY INVOKER` | Goal definition. Only the creator may update or archive. |
| `create_goal_contribution(...)` | `SECURITY INVOKER` | Any active member may contribute to an active goal of the same Nido. `member_id` and `created_by` are `auth.uid()`. |
| `create_budget(...)` / `update_budget` / `soft_delete_budget` | `SECURITY INVOKER` | Monthly budget. `p_personal` true → `member_id = auth.uid()`; default → Nido (`NULL`). Only the creator may update or soft-delete. Spent is derived and net of refunds. |
| `update_personal_visibility(p_visibility)` | `SECURITY INVOKER` | Self only. Writes `profiles.personal_visibility` (`nido` \| `private`). Does not take a user id. |
| `lookup_invitation(p_token)` | `SECURITY DEFINER` | Invitation SELECT is owner-only. Invitees and anonymous users need a name/status preview. |
| `accept_invitation(p_token)` | `SECURITY DEFINER` | No client UPDATE on invitations and no client INSERT of a non-owner membership. |
| `leave_household()` | `SECURITY DEFINER` | No client UPDATE on `household_members`. Last owner cannot leave. |
| `remove_household_member(p_target_user_id)` | `SECURITY DEFINER` | No client UPDATE on `household_members`. Owner-only. Sets `left_at` on another active member of the same Nido. Cannot remove self or an owner. |
| `transfer_household_ownership(p_new_owner_id)` | `SECURITY DEFINER` | No client UPDATE on `household_members`. Two role writes must be atomic. INVOKER would require an UPDATE policy that could leave a Nido without an owner. |

`create_household` and `create_expense` live in `supabase/migrations/20260818000000_nido_household_lifecycle.sql` and `supabase/migrations/20260821000000_nido_categories_and_create_expense.sql`. Phase 9.4.1 (`20260822500000_nido_household_categories_split.sql`) adds `households.default_split_method` and the name / category / split RPCs, and updates `create_expense` for the household preference. Phase 9.4.2 (`20260822600000_nido_onboarding_savings_budgets.sql`) adds `savings_balances` and extends `create_household_with_onboarding_income`. Phase 9.4.3 (`20260822700000_nido_personal_visibility.sql`) adds `profiles.personal_visibility`, `personal_finance_visible`, `update_personal_visibility`, and the personal path of `create_budget`. Phase 9.4.5 (`20260822800000_nido_expense_refunds.sql`) adds `expense_refunds`, `expense_refund_splits`, and `create_expense_refund`. Onboarding income persist was introduced in `supabase/migrations/20260822300000_nido_onboarding_financial.sql`. Owner transfer lives in `supabase/migrations/20260822000000_nido_owner_transfer.sql`. Owner-initiated remove lives in `supabase/migrations/20260831180000_nido_remove_household_member.sql`. `SECURITY DEFINER` functions set `search_path = public`, require `auth.uid()`, and never take a user-supplied actor `user_id`. They do not bypass the one-active-Nido unique index.

There is no service-role client.

---

## Application services

Code lives in `src/lib/nido/`.

| Module | Functions |
| --- | --- |
| `household.ts` | `createHousehold`, `createHouseholdFromOnboarding` |
| `membership.ts` | `getMyActiveHousehold`, `getMyMembership`, `getMyNidoState`, `getHouseholdMembers`, `leaveHousehold`, `transferHouseholdOwnership`, `removeHouseholdMember` |
| `transfer-ownership.ts` | `transferOwnershipWithAuth`, `canSubmitTransfer` |
| `remove-member.ts` | `removeMemberWithAuth`, `canSubmitRemove` |
| `leave-household.ts` | `leaveHouseholdWithAuth`, `canSubmitLeave` |
| `invitations.ts` | `createInvitation`, `listInvitations`, `cancelInvitation`, `lookupInvitation`, `acceptInvitation`, `completeJoinInvitation` |
| `invitation-actions.ts` | `listInvitationsWithAuth`, `cancelInvitationWithAuth`, `listStatusFromClassification` |
| `join-invitation.ts` | `joinDisplayNameDecision`, `joinIncomeDecision`, `completeJoinInvitationWithAuth` — name and income, then a single `accept_invitation`; income row after accept |
| `profile.ts` | `getMyProfile`, `updateMyDisplayName`, `updatePersonalVisibility` |
| `update-display-name.ts` | `updateMyDisplayNameWithAuth`, `canSubmitDisplayName` |
| `personal-visibility.ts` | `PersonalVisibility`, `DEFAULT_PERSONAL_VISIBILITY`, `canReadPersonalFinance` |
| `update-personal-visibility.ts` | `updatePersonalVisibilityWithAuth`, `canSubmitPersonalVisibility` |
| `rules.ts` | Pure classification and token helpers |
| `invitation-copy.ts` | Safe invitation status copy for `/join/<token>` |
| `transient-retry.ts` | Bounded retry for `useMyNido` transient `network` / session-establishment errors |
| `financial/` | Date range, money, splits, categories, expense input, goal progress, budget spent, activity, dashboard view model |
| `queries/dashboard.ts` | `fetchDashboardSnapshot` |
| `queries/categories.ts` | `fetchActiveExpenseCategories`, `fetchActiveIncomeCategories`, `fetchHouseholdCategories` |
| `update-household-name.ts` | `updateHouseholdNameWithAuth`, `canSubmitHouseholdName` |
| `update-household-split-method.ts` | `updateHouseholdSplitMethodWithAuth` |
| `category-mutations.ts` | `createCategoryWithAuth`, `renameCategoryWithAuth`, `archiveCategoryWithAuth` |
| `create-expense.ts` | `createExpenseWithAuth`, `canSubmitExpense` |
| `create-refund.ts` | `createRefundWithAuth`, `canSubmitRefund` |
| `expenses.ts` | `createExpense` / `createRefund` (Supabase wrappers) |
| `goals.ts` | `createGoal` / `updateGoal` / `archiveGoal` |
| `create-contribution.ts` | `createContributionWithAuth`, `canSubmitContribution` |
| `contributions.ts` | `createContribution` (Supabase wrapper) |
| `incomes.ts` | `createIncome` / `updateIncome` / `deleteIncome` |
| `budgets.ts` | `createBudget` / `updateBudget` / `deleteBudget` |
| `use-dashboard.ts` | Shared snapshot for Home, Gastos, Ingresos, Metas, Presupuestos, and Actividad; uses the active household from `useMyNido` |

Onboarding helpers live in `src/lib/onboarding/` (`draft`, `validation`, `financial-plan`). The draft does not write to Supabase. Finalize calls `createHouseholdFromOnboarding`.

UI components call this layer. They do not query Supabase tables directly.

---

## Invitation join flow

```
/join/<token>
  → preview (status + household name only; no household_id)
  → if no session: email/password auth
  → after signup/login (and email confirmation if required): return to /join/<token>
  → if profiles.display_name is still the email local-part fallback: ask for a name
  → ask for monthly income (same question as create-Nido onboarding)
  → updateMyDisplayName (existing profiles UPDATE self)
  → accept_invitation()
  → create_income (Sueldo / Ingreso mensual neto) when amount > 0
  → MainApp / live dashboard
```

The invitation token is stored in `sessionStorage` (`nido.pendingInvitationToken`) so it survives email confirmation. It is not an auth token and is never written to `localStorage`.

`lookup_invitation` still does not return `household_id`. The join page does **not** guess `already_in_this` vs `already_in_other` from the public preview. `accept_invitation` is the authority: `nido.already_member` → already this Nido; `nido.already_in_nido` → already another Nido. Those codes keep their own copy. If the user cancels before accept, no membership is created. A chosen name is written before accept so a successful join cannot keep the email local-part. A valid existing `display_name` is not overwritten. Monthly income is required (same validation as create-Nido). Amount `0` joins and writes no income row. Amount `> 0` is written with `create_income` after accept, using the household **Sueldo** catalog row and description **Ingreso mensual neto**, dated today in `America/Mexico_City`. A failed income write does not undo the join; the member can add it later from Ingresos.

`handle_new_user` may still insert the email local-part as `profiles.display_name`. Join treats that as fallback via `isFallbackDisplayName` and asks for a real name. The trigger is unchanged.

Accepting a valid invitation goes to the dashboard, not auth, Nido selection, or onboarding.

After login, `useMyNido` → `getMyNidoState` retries at most once (2 attempts, short backoff) when the error is `network` or a transient `unauthenticated` while a session user already exists. Domain errors (`already_in_nido`, `forbidden`, invitation codes, validation) are not retried. A successful first load has no delay.

---

## Routes

| Path | Role |
| --- | --- |
| `/` | Auth + membership gate: landing, onboarding, or main app |
| `/join/<token>` | Invitation preview and accept |
| `/auth/callback` | Email confirmation and password-recovery callback. `?next=` is a safe same-origin path |
| `/auth/update-password` | Set a new password after the recovery email |

Unauthenticated visitors on `/join/<token>` see the Nido name (when valid) and sign in or create an account with email and password. The token is stored in `sessionStorage` if email confirmation is required, so acceptance can resume after the user confirms.

---

## What remains after owner transfer

Phase 9.4 work is specified in [phase-9.4.md](./phase-9.4.md). **9.4.1–9.4.9** are implemented. 9.4.10 applied migrations 15–18 to `nido_dev` and executed the live RLS matrix. The phase is **IMPLEMENTADA — VALIDACIÓN OPERATIVA PARCIAL (SMOKE UI PENDIENTE)**. 9.4.8 is leftover cleanup, not a new product surface.

Do **not** treat these as pending 9.4: Google OAuth, image avatars, notifications, Realtime, insights, persistent Activity, multi-currency, receipts, email invitations, recurring budgets, push. See [future.md](./future.md).

---

## Apply the migration

This phase applied `20260822300000_nido_onboarding_financial.sql` to linked `nido_dev` (`pxfdvhavcddqmhuljxlf`). Types were regenerated with `npx supabase gen types typescript --linked`.

`leave_household` now deactivates the leaving member’s `recurring_incomes` in that Nido. `remove_household_member` does the same for a member the owner removes. Recurring expense templates and already-materialized movements stay. A departed creator cannot materialize.
