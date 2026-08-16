# Nido Supabase integration

This document describes the application-side Supabase foundation and authentication. The domain model in [database.md](./database.md) remains the source of truth. Row Level Security is documented in [security.md](./security.md).

Household membership and onboarding persistence are intentionally not implemented yet.

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

A separate redirect-URL environment variable is not required. The browser builds the OAuth callback from `window.location.origin`.

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

Authentication uses Supabase Auth with Google OAuth. There is no custom JWT system, no token storage in `localStorage`, and no service-role client.

### Browser / server architecture

```
Browser:
  createBrowserClient
    → Google OAuth
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

### Google OAuth flow

1. The user clicks **Continuar con Google**.
2. The browser client calls `supabase.auth.signInWithOAuth({ provider: "google" })`.
3. `redirectTo` is `${origin}/auth/callback` (local example: `http://localhost:3000/auth/callback`).
4. Google authenticates the user and returns to Supabase.
5. Supabase redirects to `src/app/auth/callback/route.ts` with a `code`.
6. The route handler exchanges the code for a session through the server client.
7. Session cookies are written.
8. The user is redirected back to `/`.
9. The existing `handle_new_user` database trigger creates a `profiles` row for a new `auth.users` row.
10. The existing onboarding UI continues. The frontend does **not** insert into `profiles`.

If Google authentication fails, the user stays on (or returns to) the authentication screen with a generic error and can retry. Internal Supabase error details are not shown in the UI.

### Callback URL

Application callback route: `/auth/callback`

| Environment | Application redirect URL |
| --- | --- |
| Local development | `http://localhost:3000/auth/callback` |
| Production | `https://<production-domain>/auth/callback` |

Do not invent the production domain. Use the origin of the deployed app.

This application callback is **not** the same URL that Google Cloud Console needs. Google must redirect to Supabase first:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

### Session handling

On startup, the app root calls `getUser()` and subscribes to `onAuthStateChange`. The subscription is created once and cleaned up on unmount.

The session survives:

- page refresh
- client navigation
- returning from Google OAuth

An already authenticated user is not sent through the Google button again. They are **not** routed to the dashboard, create-Nido, or join-Nido based on household membership. That decision belongs to a later phase.

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

`handle_new_user` is a `SECURITY DEFINER` trigger on `auth.users`. When Google creates an auth user, the trigger inserts `public.profiles` with:

- `id` = `auth.users.id`
- `display_name` from Google metadata (`display_name`, `full_name`, `name`) or the email local part
- `avatar_url` from `raw_user_meta_data.avatar_url`

The UI must not insert a profile during login. Later screens may read `profiles` under RLS. Profile editing is not implemented in this phase.

The onboarding name field is a **local draft**. Editing it does not update `profiles`.

### Current-phase limitations

Household membership and onboarding persistence are intentionally not implemented yet.

This phase does **not**:

- create a household
- insert `household_members`
- assign an owner
- join a household
- send or accept invitations
- persist onboarding income, savings, expenses, or contribution model
- replace mock financial dashboard data
- route authenticated users based on active Nido membership

The buttons **Crear un nuevo Nido** and **Unirme a un Nido** still lead into the existing prototype onboarding. Join remains a UI mock.

---

## Supabase dashboard configuration

The application cannot configure the Supabase dashboard. A developer must do this before real Google login works.

### 1. Enable the Google provider

In the Supabase dashboard:

**Authentication → Sign In / Providers → Google**

Enable Google and add the Client ID and Client Secret from Google Cloud Console. This repository does not contain those credentials and must not invent them.

### 2. Google Cloud Console

Create an OAuth client (Web application) and set the authorized redirect URI to the **Supabase** callback:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

`<project-ref>` is the subdomain of `NEXT_PUBLIC_SUPABASE_URL`.

### 3. Application redirect URLs

In the Supabase dashboard:

**Authentication → URL Configuration**

Add the application callback URLs:

Development:

```
http://localhost:3000/auth/callback
```

Production (replace with the real deployed origin):

```
https://<production-domain>/auth/callback
```

Site URL for local development is typically `http://localhost:3000`.

---

## Local development

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Enable Google in the Supabase dashboard and add `http://localhost:3000/auth/callback`
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

Do not use service-role access for normal application operations. Invitation accept, leave, join, and owner transfer remain later service-layer work, as documented in [security.md](./security.md).

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

Supabase CLI was **not** available in the environment that created this file, and no live project was linked. `types.ts` is therefore a **hand-authored** representation of the SQL migrations. It is **not** output from `supabase gen types` against a live database.

Prefer official generation as soon as a project exists. Replace the file in place; keep the official `Database` shape so clients do not need to change.

### How to regenerate

With a hosted project:

```bash
npx supabase gen types typescript --project-id <project-id> --schema public > src/lib/supabase/types.ts
```

With a local Supabase stack (Docker + CLI):

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

After regenerating, restore the file header comment if you want the regeneration instructions to stay in the file, or keep this document as the source for that command.

Local development and `npm run dev` do **not** require Docker or the Supabase CLI.
