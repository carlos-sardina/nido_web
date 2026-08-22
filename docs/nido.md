# Nido membership and invitations

This document describes household (Nido) creation, membership, leaving, invitations, and the pre-dashboard flow. Phase 8.10.2 hardens the signup confirmation copy so an ambiguous `signUp()` success is not treated as proof that an email was sent.

The schema in [database.md](./database.md) remains the source of truth. RLS in [security.md](./security.md) is unchanged: clients still cannot UPDATE `household_members`. Owner transfer is a new SECURITY DEFINER RPC. It does not change tables or weaken policies.

Phase 9.1.1 connects the Home dashboard to live Supabase reads. Phase 9.1.2A adds household default expense categories and **Registrar un gasto**. Phase 9.2.2 persists the onboarding monthly income with the new Nido. Phase 9.2.3 re-audited that stack on `nido_dev` and did not add product surfaces. Auth, recovery, and RLS policies are unchanged. See [financial.md](./financial.md). Auth and onboarding visuals use the tokens in [design-system.md](./design-system.md).

---

## Auth flow

Unauthenticated visitors see only authentication:

1. Landing: **Crear cuenta** / **Iniciar sesión**. It does not offer “Crear un Nido” or “Unirme a un Nido”.
2. Signup with email, password, and confirmation. Email is trimmed and lowercased. The UI only validates format; it does not look up whether the address exists. Email uniqueness is owned by Supabase Auth. With Confirm email enabled, a successful `signUp()` without a session can be a new registration **or** an obfuscated response for an existing account. The UI uses the same **Revisa tu correo** screen for both and does **not** distinguish them, to avoid user enumeration. Copy does not claim that a confirmation email was sent. A Nido is not created. If Supabase returns an explicit `user_already_exists` error, the generic message and **Iniciar sesión** are shown — it does not say the email is already registered. **Reenviar correo** uses a 60-second UX cooldown (persisted in `sessionStorage` as action + normalized email + timestamp, never tokens or passwords) and the same auth error classifier; success copy does not reveal whether the address exists. The cooldown is a frontend guard, not a substitute for Supabase/Brevo rate limits. **¿Ya tienes una cuenta?** / **Volver a iniciar sesión** returns to login with the same email and does not create a session.
3. Login with email and password. Invalid credentials stay generic. Unconfirmed email offers **Reenviar correo de confirmación**. Rate limits and network errors have their own Spanish copy. Raw Supabase errors are never shown.
4. Recovery: forgot password → email → `/auth/callback` → `/auth/update-password`. The same 60-second UX cooldown applies per normalized email, independently from confirmation resend. The callback marks the session as password recovery so other tabs do not treat it as a normal login. `next` is sanitized with `safeNextPath`. Tokens stay in cookies, not URLs or `localStorage`. After `updateUser({ password })`, routing is the normal authenticated destination (MainApp or Nido selection).
5. Logout: `signOut()`, clear the invitation token and the onboarding draft, return to the auth landing. It does not delete Supabase rows.

Google OAuth remains disabled. Email confirmation remains required. SMTP is configured outside this repository.

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

It is created on the invitations step, when the user taps **Crear mi Nido**, **Invitar por enlace**, or **Invitar por QR**. Those actions call `create_household_with_onboarding_income(p_name, p_income_amount)` (atomic household + owner membership + default catalogs + the declared monthly income) after `updateMyDisplayName`. Optional invitation rows are inserted only after that RPC succeeds.

Invitation links need a `household_id`, so generating a real link or QR finalizes the Nido first. The income is persisted in that same transaction. Savings, estimated expenses, and the division preference are not.

If the user leaves before that tap, nothing is written to `households` or `household_members`.

---

## One active Nido per user

A user may belong to **at most one active Nido**.

Active membership is a `household_members` row with `left_at IS NULL`. The unique index `household_members_one_active_membership_idx` enforces this.

A Nido may have one person, two people, or many people. There is no couple assumption and no member cap.

The UI must never imply that multiple active Nidos are supported.

Household **names** are not unique. `households.id` is the identity. `profiles.display_name` is not unique. Invitation `token` is unique. Pending invitation email is unique per Nido while `accepted_at` is null. Auth email uniqueness stays with Supabase Auth. The frontend never queries `auth.users` and never exposes an “email exists” check.

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

The Hogar tab shows who is owner. **Transferir propiedad** is owner-only, asks for confirmation, lists other active members (not self), and shows success or error. Profile **Salir del Nido** tells a last owner to transfer first; it does not add a second transfer CTA.

---

## Owner and member semantics

| Role | How it is assigned |
| --- | --- |
| `owner` | First member of a newly created Nido, or the target of `transfer_household_ownership` |
| `member` | Invitation acceptance, or the previous owner after a transfer |

Active owners may create, read, and revoke invitations (existing RLS). Active members may read household identity and leave, subject to the last-owner rule.

---

## Invitation lifecycle

Invitations use `household_invitations`. No new table.

1. An active owner calls `createInvitation({ householdId, email? })`.
2. The service inserts a row with a cryptographically random token and an expiration.
3. The UI copies `/join/<token>`. Email delivery is not implemented.
4. Anyone with the link can look up status and the Nido name.
5. An authenticated user with no active Nido can accept.
6. Acceptance inserts a `member` row and sets `accepted_at`.

Statuses shown to the user:

- valid
- expired
- already accepted
- invalid
- already belongs to a Nido
- already belongs to this Nido

The token is required to accept. Lookups and RPCs do not return the token, email, or financial data.

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
| Invitation | `household_invitations` (token, optional email, expiry, accepted_at) |
| Leave | `household_members.left_at` |
| Owner transfer | `household_members.role` swapped atomically (`transfer_household_ownership`) |
| Default expense and income categories | `categories` (`is_default = true`) via `create_household` |
| Onboarding monthly income | `incomes` via `create_household_with_onboarding_income` → `create_income` |
| Confirmed expense | `expenses` + `expense_splits` via `create_expense` |

Auth identity still comes from Supabase Auth. The profile is the canonical application display name. Auth user metadata is not updated.

---

## What is still mock / local

Intentionally not persisted by onboarding (still true):

- personal / shared savings (existing stock; no goal target)
- estimated monthly expenses (planning estimates, not confirmed `expenses` or `budgets`)
- division preference (`equal` / `proportional`; no household column)
- unused draft leftovers (`freelance`, `savingsType`, nest type)

The onboarding **Ingreso mensual neto** is persisted. Category is the household **Sueldo** catalog row. `occurred_at` is today in `America/Mexico_City`. Description is `Ingreso mensual neto`. Amount `0` creates the Nido and writes no income row.

Live on Home, empty when the Nido has no financial rows:

- confirmed incomes and expenses (ingresos and gastos registered from `+` are live)
- goals and contribution progress
- Nido budgets for the current month (create / edit / soft-delete from Home and `+`)
- activity derived from expenses, incomes, and goal contributions (not budget mutations)

Still prototype UI (not wired):

- household planning widgets (capacity / split model)
- Profile personal-expense lists
- email or push delivery
- real-time subscriptions

Gastos, Metas, Crear una meta, and Registrar una aportación are live. Household name, member list, membership role, and `profiles.display_name` come from Supabase after the Nido is finalized.

---

## Transactions and RPCs

The PostgREST client cannot run a multi-statement transaction. These operations use Postgres functions.

| Function | Security | Why |
| --- | --- | --- |
| `create_household(p_name)` | `SECURITY INVOKER` | Household + first owner + default catalogs must be atomic. RLS still applies. |
| `create_household_with_onboarding_income(p_name, p_income_amount)` | `SECURITY INVOKER` | Reuses `create_household` + `create_income` so a failed income cannot leave a finished-looking Nido. Takes no household_id or identity. |
| `create_expense(...)` | `SECURITY INVOKER` | Expense + splits must be atomic. Split sums and personal cardinality are enforced here. RLS still applies. |
| `create_goal(...)` / `update_goal` / `archive_goal` | `SECURITY INVOKER` | Goal definition. Only the creator may update or archive. |
| `create_goal_contribution(...)` | `SECURITY INVOKER` | Any active member may contribute to an active goal of the same Nido. `member_id` and `created_by` are `auth.uid()`. |
| `create_budget(...)` / `update_budget` / `soft_delete_budget` | `SECURITY INVOKER` | Nido-level monthly budget. Only the creator may update or soft-delete. Spent is not stored. |
| `lookup_invitation(p_token)` | `SECURITY DEFINER` | Invitation SELECT is owner-only. Invitees and anonymous users need a name/status preview. |
| `accept_invitation(p_token)` | `SECURITY DEFINER` | No client UPDATE on invitations and no client INSERT of a non-owner membership. |
| `leave_household()` | `SECURITY DEFINER` | No client UPDATE on `household_members`. Last owner cannot leave. |
| `transfer_household_ownership(p_new_owner_id)` | `SECURITY DEFINER` | No client UPDATE on `household_members`. Two role writes must be atomic. INVOKER would require an UPDATE policy that could leave a Nido without an owner. |

`create_household` and `create_expense` live in `supabase/migrations/20260818000000_nido_household_lifecycle.sql` and `supabase/migrations/20260821000000_nido_categories_and_create_expense.sql`. Onboarding income persist lives in `supabase/migrations/20260822300000_nido_onboarding_financial.sql`. Owner transfer lives in `supabase/migrations/20260822000000_nido_owner_transfer.sql`. `SECURITY DEFINER` functions set `search_path = public`, require `auth.uid()`, and never take a user-supplied actor `user_id`. They do not bypass the one-active-Nido unique index.

There is no service-role client.

---

## Application services

Code lives in `src/lib/nido/`.

| Module | Functions |
| --- | --- |
| `household.ts` | `createHousehold`, `createHouseholdFromOnboarding` |
| `membership.ts` | `getMyActiveHousehold`, `getMyMembership`, `getMyNidoState`, `getHouseholdMembers`, `leaveHousehold`, `transferHouseholdOwnership` |
| `transfer-ownership.ts` | `transferOwnershipWithAuth`, `canSubmitTransfer` |
| `leave-household.ts` | `leaveHouseholdWithAuth`, `canSubmitLeave` |
| `invitations.ts` | `createInvitation`, `lookupInvitation`, `acceptInvitation` |
| `profile.ts` | `getMyProfile`, `updateMyDisplayName` |
| `rules.ts` | Pure classification and token/email helpers |
| `invitation-copy.ts` | Safe invitation status copy for `/join/<token>` |
| `financial/` | Date range, money, splits, categories, expense input, goal progress, budget spent, activity, dashboard view model |
| `queries/dashboard.ts` | `fetchDashboardSnapshot` |
| `queries/categories.ts` | `fetchActiveExpenseCategories` |
| `create-expense.ts` | `createExpenseWithAuth`, `canSubmitExpense` |
| `expenses.ts` | `createExpense` (Supabase wrapper) |
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
  → preview (name + status only)
  → if no session: email/password auth
  → after signup/login (and email confirmation if required): return to /join/<token>
  → accept
  → MainApp / live dashboard
```

The invitation token is stored in `sessionStorage` (`nido.pendingInvitationToken`) so it survives email confirmation. It is not an auth token and is never written to `localStorage`.

Accepting a valid invitation goes to the dashboard, not auth, Nido selection, or onboarding.

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

- household planning widgets and Profile personal-expense lists
- invitation email delivery
- Google OAuth
- category CRUD (create / rename / archive) beyond the default catalog
- personal budgets (`member_id` set) in the UI

---

## Apply the migration

This phase applied `20260822300000_nido_onboarding_financial.sql` to linked `nido_dev` (`pxfdvhavcddqmhuljxlf`). Types were regenerated with `npx supabase gen types typescript --linked`.

`leave_household` now deactivates the leaving member’s `recurring_incomes` in that Nido. Recurring expense templates and already-materialized movements stay. A departed creator cannot materialize.
