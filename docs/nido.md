# Nido membership and invitations

This document describes Phase 8: real household (Nido) creation, membership, leaving, and invitations.

The schema in [database.md](./database.md) remains the source of truth. RLS in [security.md](./security.md) is unchanged. This phase adds application services and four Postgres functions. It does not change tables or weaken policies.

---

## One active Nido per user

A user may belong to **at most one active Nido**.

Active membership is a `household_members` row with `left_at IS NULL`. The unique index `household_members_one_active_membership_idx` enforces this.

A Nido may have one person, two people, or many people. There is no couple assumption and no member cap.

The UI must never imply that multiple active Nidos are supported.

---

## Membership lifecycle

| State | Meaning | App destination |
| --- | --- | --- |
| Unauthenticated | No session | Landing / email+password auth |
| Authenticated + no memberships | Never belonged to a Nido | Create / join onboarding |
| Authenticated + historical only | `left_at` is set on every row | Create / join onboarding |
| Authenticated + active | `left_at IS NULL` | Main app |
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

After leaving, the user returns to create/join onboarding and may join another Nido.

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

Auth identity still comes from Supabase Auth. The profile is the canonical application display name. Auth user metadata is not updated.

---

## What is still mock

Intentionally not persisted:

- onboarding income, savings, expenses, and distribution preference
- dashboard balances, budgets, goals, activity
- categories
- recurring transactions
- email or push delivery
- real-time subscriptions

The dashboard and some household planning widgets still render prototype financial numbers. Household name, member list, and membership role come from Supabase.

---

## Transactions and RPCs

The PostgREST client cannot run a multi-statement transaction. These operations use Postgres functions in `supabase/migrations/20260818000000_nido_household_lifecycle.sql`.

| Function | Security | Why |
| --- | --- | --- |
| `create_household(p_name)` | `SECURITY INVOKER` | Household insert + first owner insert must be atomic. RLS still applies. |
| `lookup_invitation(p_token)` | `SECURITY DEFINER` | Invitation SELECT is owner-only. Invitees and anonymous users need a name/status preview. |
| `accept_invitation(p_token)` | `SECURITY DEFINER` | No client UPDATE on invitations and no client INSERT of a non-owner membership. |
| `leave_household()` | `SECURITY DEFINER` | No client UPDATE on `household_members`. |

`SECURITY DEFINER` functions set `search_path = public`, require `auth.uid()`, and never take a user-supplied `user_id`. They do not bypass the one-active-Nido unique index.

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

UI components call this layer. They do not query Supabase tables directly.

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

## Apply the migration

This workspace does not apply SQL to a live project. After pulling this phase, apply `20260818000000_nido_household_lifecycle.sql` with the same process used for the foundation and RLS migrations.

Until that function migration is applied, household create/accept/leave RPCs will fail at runtime.
