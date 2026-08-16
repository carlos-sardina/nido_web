# Nido Supabase integration

This document describes the application-side Supabase foundation. The domain model in [database.md](./database.md) remains the source of truth. Row Level Security is documented in [security.md](./security.md).

This phase adds clients, public environment variables, and database TypeScript types. It does not implement authentication, replace mock data, or expose feature APIs.

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

---

## Clients

Code lives in `src/lib/supabase/`.

| File | Role |
| --- | --- |
| `env.ts` | Reads public env vars when a client is created |
| `client.ts` | Browser client for Client Components |
| `server.ts` | Server client for Server Components, Server Actions, and Route Handlers |
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

Authentication is **not** implemented yet.

This phase does not add Google login, email/password, magic links, OAuth callbacks, login/logout UI, protected routes, auth context, auth hooks, or profile synchronization.

The existing mock authentication behavior is unchanged. Those features belong to Phase 7.

### Middleware / proxy

Official Supabase SSR guides often add Next.js middleware (or a proxy) to refresh expired auth tokens on every request.

That interception is **not** added here. There is no authenticated session to refresh, and this phase must not change request behavior.

When authentication is introduced, evaluate the official session-refresh middleware/proxy and add it then if required.

---

## RLS

All database access is expected to operate under the RLS policies already defined in `supabase/migrations/20260817000000_nido_rls.sql`.

Architectural principle:

- **Browser:** anon/publishable key + authenticated user's session + RLS
- **Server:** anon/publishable key + authenticated user's session + RLS
- **Service role:** not introduced in this phase

Do not use service-role access for normal application operations. Invitation accept, leave, join, and owner transfer remain later service-layer work, as documented in [security.md](./security.md).

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

---

## Local development

The current UI still uses mock data. It does not import the Supabase clients.

1. Install dependencies: `npm install`
2. Start the app: `npm run dev`

Missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` does **not** prevent the prototype from starting. The clients are not initialized until they are imported and `createClient()` is called.

When a client **is** created without those variables, it throws a clear configuration error. The app does not invent fake credentials or a fake client.

To point the foundation at a real project later:

1. Copy `.env.example` to `.env.local`
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Restart `npm run dev`

Do not commit `.env.local`.
