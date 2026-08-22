# Nido membership and invitations

This document describes household (Nido) creation, membership, leaving, invitations, and the pre-dashboard flow. Phase 8.10.2 hardens the signup confirmation copy so an ambiguous `signUp()` success is not treated as proof that an email was sent.

The schema in [database.md](./database.md) remains the source of truth. RLS in [security.md](./security.md) is unchanged. Application services and four Postgres functions live in this phase. It does not change tables or weaken policies.

Phase 9.1.1 connects the Home dashboard to live Supabase reads. Phase 9.1.2A adds household default expense categories and **Registrar un gasto**. Auth, recovery, onboarding, and RLS policies are unchanged. See [financial.md](./financial.md). Auth and onboarding visuals use the tokens in [design-system.md](./design-system.md).

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
  → Crear mi Nido
  → create_household + profiles.display_name
  → dashboard (live reads; empty financial rows until the user registers a gasto)
```

Draft fields (household name, display name, income, savings, expenses, classification, amounts, division method, invite UI) stay in React state and `sessionStorage` (`nido.onboardingDraft`). That key is not used for auth tokens.

Abandoning before **Crear mi Nido** leaves no household, no membership, and no financial rows. Refresh during a draft step restores the local draft; it does not create a Nido. Logout clears the draft.

`profiles.display_name` is written when the Nido is finalized, not when the name step is shown. Default expense categories are inserted by `create_household` in the same transaction.

---

## When the household is created

The household is **not** created when the user enters onboarding.

It is created on the invitations step, when the user taps **Crear mi Nido**, **Invitar por enlace**, or **Invitar por QR**. Those actions call `create_household(p_name)` (atomic household + owner membership + default expense categories) and then `updateMyDisplayName`. Optional invitation rows are inserted only after that RPC succeeds.

Invitation links need a `household_id`, so generating a real link or QR finalizes the Nido first. Financial onboarding data is still not persisted.

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

The last active owner cannot leave. Owner transfer is not implemented. The RPC returns `nido.last_owner`.

After leaving, the user returns to Nido selection and may create or join another Nido.

---

## Owner and member semantics

| Role | How it is assigned in this phase |
| --- | --- |
| `owner` | First member of a newly created Nido |
| `member` | Invitation acceptance |

Role changes and owner transfer are out of scope.

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
| Default expense categories | `categories` (`is_default = true`) via `create_household` |
| Confirmed expense | `expenses` + `expense_splits` via `create_expense` |

Auth identity still comes from Supabase Auth. The profile is the canonical application display name. Auth user metadata is not updated.

---

## What is still mock / local

Intentionally not persisted by onboarding (still true):

- onboarding income, savings, expenses, classification, and distribution preference

Live on Home, empty when the Nido has no financial rows:

- confirmed incomes and expenses (gastos registered from `+` are live)
- goals and contribution progress
- Nido budgets for the current month
- activity derived from those tables

Still prototype UI (not wired):

- Gastos, Metas, and Actividad screens
- Crear una meta / Registrar una aportación (visible in `+`, show **Próximamente**)
- household planning widgets (capacity / split model)
- Profile personal-expense lists
- email or push delivery
- real-time subscriptions

Household name, member list, membership role, and `profiles.display_name` come from Supabase after the Nido is finalized.

---

## Transactions and RPCs

The PostgREST client cannot run a multi-statement transaction. These operations use Postgres functions.

| Function | Security | Why |
| --- | --- | --- |
| `create_household(p_name)` | `SECURITY INVOKER` | Household + first owner + default expense categories must be atomic. RLS still applies. |
| `create_expense(...)` | `SECURITY INVOKER` | Expense + splits must be atomic. Split sums and personal cardinality are enforced here. RLS still applies. |
| `lookup_invitation(p_token)` | `SECURITY DEFINER` | Invitation SELECT is owner-only. Invitees and anonymous users need a name/status preview. |
| `accept_invitation(p_token)` | `SECURITY DEFINER` | No client UPDATE on invitations and no client INSERT of a non-owner membership. |
| `leave_household()` | `SECURITY DEFINER` | No client UPDATE on `household_members`. |

`create_household` and `create_expense` live in `supabase/migrations/20260818000000_nido_household_lifecycle.sql` and `supabase/migrations/20260821000000_nido_categories_and_create_expense.sql`. `SECURITY DEFINER` functions set `search_path = public`, require `auth.uid()`, and never take a user-supplied `user_id`. They do not bypass the one-active-Nido unique index.

There is no service-role client.

---

## Application services

Code lives in `src/lib/nido/`.

| Module | Functions |
| --- | --- |
| `household.ts` | `createHousehold` |
| `membership.ts` | `getMyActiveHousehold`, `getMyMembership`, `getMyNidoState`, `getHouseholdMembers`, `leaveHousehold` |
| `invitations.ts` | `createInvitation`, `lookupInvitation`, `acceptInvitation` |
| `profile.ts` | `getMyProfile`, `updateMyDisplayName` |
| `rules.ts` | Pure classification and token/email helpers |
| `invitation-copy.ts` | Safe invitation status copy for `/join/<token>` |
| `financial/` | Date range, money, splits, categories, expense input, goal progress, budget spent, activity, dashboard view model |
| `queries/dashboard.ts` | `fetchDashboardSnapshot` |
| `queries/categories.ts` | `fetchActiveExpenseCategories` |
| `create-expense.ts` | `createExpenseWithAuth`, `canSubmitExpense` |
| `expenses.ts` | `createExpense` (Supabase wrapper) |
| `use-dashboard.ts` | Home data hook; uses the active household from `useMyNido` |

Onboarding draft helpers live in `src/lib/onboarding/` (`draft`, `validation`). They do not write to Supabase.

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

## What remains after 9.1.3A

- 9.1.3B: registrar aportaciones
- Actividad screen on the same data layer
- 9.1.4: Hogar / Perfil refinement
- ingresos / presupuestos / recurrencias
- invitation email delivery
- owner transfer
- Google OAuth
- category CRUD (create / rename / archive) beyond the default catalog

---

## Apply the migration

This workspace does not apply SQL to a live project. After pulling this phase, apply `20260821180000_nido_goal_mutations.sql` with the same process used for the foundation, RLS, lifecycle, and expense migrations.

Until that migration is applied, `create_goal` / `update_goal` / `archive_goal` will fail at runtime.
