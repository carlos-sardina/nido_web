# Nido Supabase integration

This document describes the application-side Supabase foundation and authentication. The domain model in [database.md](./database.md) remains the source of truth. Row Level Security is documented in [security.md](./security.md). Household membership is documented in [nido.md](./nido.md).

---

## Environment

Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

These are the **public** project URL and anon/publishable key. They are safe to ship to the browser. They identify the project and allow unauthenticated or user-session requests. They do **not** bypass RLS.

Never put any of the following in `NEXT_PUBLIC_` variables, client code, or `.env.example`:

- `service_role` key
- secret API keys
- database passwords
- other privileged server credentials

This repository does not introduce `SUPABASE_SERVICE_ROLE_KEY`. Normal application access uses the anon key plus the authenticated user's session, on both the browser and the server.

Copy [`.env.example`](../.env.example) to `.env.local` and fill in values from the Supabase project API settings. `.env.local` is gitignored and must not be committed.

A separate redirect-URL environment variable is not required. The browser builds email-confirmation and password-recovery callbacks from `window.location.origin`.

---

## Real project

This repository is linked to the hosted Supabase project `nido_dev` (`pxfdvhavcddqmhuljxlf`) in `us-east-1`.

CLI workflow:

```bash
npx supabase login
npx supabase link --project-ref pxfdvhavcddqmhuljxlf
npx supabase migration list
npx supabase db push
npx supabase gen types typescript --linked --schema public > src/lib/supabase/types.ts
```

The three repository migrations are applied on that project, in order:

1. `20260816000000_nido_foundation_schema.sql`
2. `20260817000000_nido_rls.sql`
3. `20260818000000_nido_household_lifecycle.sql`

Do not put the database password, service-role key, or anon key in this document.

Local CLI config lives in `supabase/config.toml`. Link metadata under `supabase/.temp/` is gitignored.

---

## Clients

Code lives in `src/lib/supabase/`.

| File | Role |
| --- | --- |
| `env.ts` | Reads public env vars when a client is created |
| `client.ts` | Browser client for Client Components |
| `server.ts` | Server client for Server Components, Server Actions, and Route Handlers |
| `middleware.ts` | Session-refresh helper used by Next.js middleware |
| `types.ts` | Database TypeScript types |

### Browser client

Import from `@/lib/supabase/client`.

```ts
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
```

Use this from Client Components (`"use client"`). It uses `@supabase/ssr`'s `createBrowserClient`, the public anon key, and the user's browser session. `createBrowserClient` keeps a singleton in the browser. Call the factory from a module, not from inside a React component body.

Do not use this client where Next.js cookie handling is required (Server Components, Server Actions, Route Handlers).

### Server client

Import from `@/lib/supabase/server`.

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
```

Use this from Server Components, Server Actions, and Route Handlers. It uses `@supabase/ssr`'s `createServerClient` with `next/headers` cookies so the authenticated user's session is attached to the request.

Create a new server client per request. Do not cache it across requests.

**Never import `@/lib/supabase/server` from Client Components or any browser bundle.** That module uses `next/headers`, which is server-only.

The server client still uses the public anon key. It does not bypass RLS.

---

## Authentication

Authentication uses Supabase Auth with **email and password**. Google OAuth is not enabled in this iteration and may be added later as an additional provider without changing the session architecture.

There is no custom JWT system, no token storage in `localStorage`, and no service-role client.

### Browser / server architecture

```
Browser:
  createBrowserClient
    → signUp / signInWithPassword / resetPasswordForEmail
    → authenticated session (cookies)

Server:
  createServerClient
    → cookies
    → authenticated session

Middleware:
  updateSession()
    → refresh expired access token
    → write updated cookies
```

The session is owned by `@supabase/ssr` cookies. React state only holds the current `User` for display. Access and refresh tokens are not copied into React state or `localStorage`.

### Email and password

**Registro:** `supabase.auth.signUp({ email, password })`

- If Supabase returns a session immediately, onboarding continues (create or join).
- If email confirmation is required, the app shows a “revisa tu correo” message and does **not** treat the user as authenticated. The Nido is not created yet.

**Login:** `supabase.auth.signInWithPassword({ email, password })`

Failed login shows a generic “Email o contraseña incorrectos.” Rate limits and unconfirmed-email errors use their own copy. The UI does not expose raw Supabase or Postgres errors (`AuthApiError` is never shown).

**Logout:** `supabase.auth.signOut()` on the browser client. It clears the session and returns to the landing state. It does not delete the profile, membership, or any database rows.

**Recuperación:** `supabase.auth.resetPasswordForEmail()` sends a link to `/auth/callback?next=/auth/update-password`. After the callback exchanges the code, `/auth/update-password` calls `supabase.auth.updateUser({ password })`.

The recovery request always shows: “Si el correo está registrado, te enviaremos un enlace…” Rate limits on recovery show the wait-and-retry copy instead of pretending the email was sent.

### Email rate limits

Supabase Auth limits how many confirmation and recovery emails a project can send. That is expected during local testing and in production until a custom SMTP provider is configured.

The app treats `over_email_send_rate_limit` / HTTP 429 as a **UX error**, not a crash:

- The user sees a Spanish wait-and-retry message.
- Raw `AuthApiError` text is never shown.
- There are **no automatic retries**.
- Create/join pending state and invitation tokens are preserved so the user can try again on the same screen.
- A Nido is not created and an invitation is not accepted until a confirmed session exists.

Raising or removing the limit is a **Supabase dashboard / SMTP** concern, not a UI workaround.

`handle_new_user` still creates `public.profiles` when Auth creates a user. Display name comes from email local part until onboarding persists `profiles.display_name`. There is no Google avatar; the UI uses initials when `avatar_url` is missing.

### Callback URL

`/auth/callback` is kept for email confirmation and password recovery. It is not an OAuth-only route.

| Environment | Redirect URLs to add in the dashboard |
| --- | --- |
| Local development | `http://localhost:3000/auth/callback` |
| Local development | `http://localhost:3000/auth/update-password` |
| Production | `https://nido-web-chi.vercel.app/auth/callback` |
| Production | `https://nido-web-chi.vercel.app/auth/update-password` |

The `/auth/callback` route exchanges the PKCE `code` and writes session cookies onto the same redirect response. Site URL for the hosted project should be `https://nido-web-chi.vercel.app`.

`next` is validated with `safeNextPath` to prevent open redirects.

### Session handling

On startup, the app root calls `getUser()` and subscribes to `onAuthStateChange`. The subscription is created once and cleaned up on unmount.

The session survives:

- page refresh
- client navigation
- returning from email confirmation or password recovery

An already authenticated user is not sent through signup/login again. Routing uses the active membership:

- no active Nido → create/join onboarding
- active Nido → main app
- pending invitation token → `/join/<token>`

Logout calls `supabase.auth.signOut()` on the browser client. It clears the session and returns to the unauthenticated landing state. It does not delete the profile, membership, or any database rows.

### Middleware / proxy

`src/middleware.ts` exists only to refresh Supabase session cookies.

Official Supabase docs for newer Next.js versions describe this as a **proxy**. This project uses Next.js 15, which still uses the `middleware.ts` file convention.

The middleware:

- creates a request-scoped server client
- calls `getUser()` so expired tokens can be rotated
- writes refreshed cookies onto the response
- does **not** enforce application authorization
- does **not** redirect based on household membership
- does **not** protect every route as a login wall
- does **not** query financial data

If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, the middleware passes the request through so the prototype can still build and start.

### Profile trigger

`handle_new_user` is a `SECURITY DEFINER` trigger on `auth.users`. When Auth creates a user, the trigger inserts `public.profiles` with:

- `id` = `auth.users.id`
- `display_name` from metadata (`display_name`, `full_name`, `name`) or the email local part
- `avatar_url` from `raw_user_meta_data.avatar_url` when present

The UI must not insert a profile during login. Onboarding may update `profiles.display_name` for the signed-in user. That is an UPDATE under RLS, not an INSERT.

The onboarding name field is persisted to `profiles.display_name` when the Nido is created. If the user does not edit it, the email-derived name is used.

### Current-phase limitations

Household identity is real. Financial onboarding fields are still local drafts.

This phase does **not**:

- persist onboarding income, savings, expenses, or contribution model
- replace mock financial dashboard data
- send invitation emails
- transfer ownership
- use a service-role client
- enable Google OAuth (explicitly out of this iteration)

Create, join, leave, and invitation accept are documented in [nido.md](./nido.md).

---

## Supabase dashboard configuration

Verified on `nido_dev` (`pxfdvhavcddqmhuljxlf`) via the public Auth settings API:

| Setting | Current value |
| --- | --- |
| Email provider | enabled |
| Google provider | disabled (do not enable for this phase) |
| Signups | enabled (`disable_signup` is false) |
| Confirm email (`mailer_autoconfirm`) | **false** — confirmation is required |

Implications of confirm email:

- `signUp()` typically returns a user without a session.
- The app shows the confirmation message and does not create a Nido.
- The user must open the email link, which returns through `/auth/callback`.
- To test a same-session signup locally, a developer may temporarily enable “Confirm email” autoconfirm in the dashboard. This repository does not change that setting.

### Redirect URLs

**Authentication → URL Configuration**

Add:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/update-password
```

Site URL for local development is typically `http://localhost:3000`.

Production:

```
https://nido-web-chi.vercel.app/auth/callback
https://nido-web-chi.vercel.app/auth/update-password
```

Hosted Site URL: `https://nido-web-chi.vercel.app`.

Google remains a future optional provider. Do not configure it in this phase.

---

## Local development

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Confirm Email is enabled in the dashboard and add the redirect URLs above
5. Start the app: `npm run dev`

Without those public variables, `npm run build` still succeeds. Creating a client at runtime throws a clear configuration error. The app does not invent fake credentials.

Do not commit `.env.local`.

---

## RLS

All database access is expected to operate under the RLS policies already defined in `supabase/migrations/20260817000000_nido_rls.sql`.

Authentication does **not** replace RLS.

Architectural principle:

- **Browser:** anon/publishable key + authenticated user's session + RLS
- **Server:** anon/publishable key + authenticated user's session + RLS
- **Service role:** not introduced

Do not use service-role access for normal application operations. Invitation accept and leave use narrowly scoped RPCs under the authenticated session, as documented in [nido.md](./nido.md) and [security.md](./security.md). Owner transfer is not implemented.

When server-side identity is required, obtain it from the authenticated Supabase session (`getUser()`). Do not trust a client-provided user id.

---

## Types

Database types live in `src/lib/supabase/types.ts`.

They follow the official Supabase `Database` shape (`Tables`, `Insert`, `Update`, `Enums`, `Functions`, plus the generated helper types `Tables`, `TablesInsert`, `TablesUpdate`, and `Enums`).

They represent the current migrations, including:

- `profiles`, `households`, `household_members`, `household_invitations`
- `categories`
- `recurring_incomes`, `incomes`
- `recurring_expenses`, `recurring_expense_splits`, `expenses`, `expense_splits`
- `budgets`, `goals`, `goal_contributions`
- the public enums
- the public SQL helpers used by integrity triggers and RLS

Do not add parallel domain interfaces that only repeat a table row. Feature-specific types can be added later when a screen needs them.

### Generation approach

`src/lib/supabase/types.ts` is official output from the linked project:

```bash
npx supabase gen types typescript --linked --schema public > src/lib/supabase/types.ts
```

Do not hand-edit that file. Regenerate it after schema changes.

A local Supabase stack (Docker + CLI) can also generate types:

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

`npm run dev` does **not** require Docker. The CLI is invoked with `npx supabase`.
