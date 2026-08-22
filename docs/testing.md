# Manual test checklist (Phase 8.10.2)

Use this against a real Vercel + Supabase + SMTP environment. Automated unit tests do not replace these flows.

Confirm email stays enabled. Google OAuth stays disabled. Do not use the service-role key in the browser. Do not treat this checklist as executed in production unless the run is recorded below.

Phase 9.1.1 connects Home to live Supabase reads. Phase 9.1.2A adds **Registrar un gasto**. Phase 9.1.2B closes Gastos (list, detail, edit, soft-delete). Phase 9.1.3A connects Metas (list, create, edit, archive). Phase 9.1.3B connects **Registrar una aportación**. Phase 9.1.3D closes aportaciones (edit / soft-delete). Actividad remains prototype. See [financial.md](./financial.md).

The 60-second email cooldown is a **UX protection**. It prevents accidental repeat clicks and shows a countdown. The real protection against abuse remains in **Supabase Auth rate limits** and **Brevo SMTP limits**. The frontend cooldown does not replace or weaken those provider limits.

With Confirm email enabled, a successful signup without a session can represent either a new registration or an obfuscated Supabase response for an existing account. The UI does not distinguish those cases, to avoid user enumeration. The frontend only validates email format. It does not look up existence. Email uniqueness is owned by Supabase Auth.

---

## A. New signup

1. Abrir la app sin sesión → **Auth Landing**: **Bienvenido** / **El lugar donde las personas construyen su patrimonio juntas.** / **Crea una cuenta o inicia sesión para continuar.** Primary **Crear cuenta**, secondary **Iniciar sesión**. No redundant “Nido” eyebrow.
2. **Crear cuenta** with a new email and a valid password (confirmation matching).
3. Email is trimmed and lowercased on submit.
4. Empty, malformed, or excessively long email is rejected in Spanish.
5. See **Revisa tu correo** with generic copy: **Si podemos crear una cuenta con este correo, recibirás un enlace de confirmación en:** plus the normalized email. Do **not** see “Te enviamos un enlace”. No Nido is created. The user is not authenticated.

## B. Duplicate signup attempt

1. Sign up again with an email that already exists (confirmed or not).
2. With Confirm email enabled, the same generic **Revisa tu correo** screen is expected. The UI does **not** say the email is already registered and does **not** claim a confirmation email was sent.
3. If Supabase instead returns an explicit `user_already_exists` error, see: **No pudimos crear la cuenta con ese correo. Si ya tienes una cuenta, intenta iniciar sesión.**
4. **¿Ya tienes una cuenta?** / **Volver a iniciar sesión** switches to login, keeps the email, and does not create a session.

## C. Confirm email

1. Open the confirmation link.
2. Arrive at **Nido Selection** (no Nido) or **MainApp** (already has an active Nido).
3. Confirmation does not open password recovery.

## D. Resend confirmation email

1. On **Revisa tu correo**, see **¿No recibiste el correo?** and **Reenviar correo**.
2. Request a resend → **Si podemos enviar un correo a esta dirección, recibirás uno en breve.**
3. Immediate second tap is blocked by the 60-second UX cooldown. The button shows **Reenviar en 59 s**, then 58 s, and does not call Supabase while the countdown is active.
4. If rate limited: **Has solicitado demasiados correos recientemente. Espera unos minutos antes de volver a intentarlo.** The 60-second UX cooldown does **not** start on a provider rate-limit rejection.
5. Raw `AuthApiError` is never shown.
6. **Volver a iniciar sesión** keeps the email in the form. The confirmation cooldown for that email remains.

## Email send cooldown (Phase 8.10.1)

The 60-second cooldown is a UX protection. Real abuse protection remains in Supabase/Brevo.

### A. Signup → confirmation

1. Sign up with a new email.
2. See **Revisa tu correo** with generic copy that does not claim the email was sent.
3. **Reenviar correo** is disabled with a 60-second countdown (`Reenviar en 59 s`).

### B. Resend confirmation

1. After the countdown ends, tap **Reenviar correo**.
2. Success copy stays generic (does not reveal whether the address exists).
3. A new 60-second countdown starts only if the request was accepted.
4. Network / technical errors do not start a fake 60-second cooldown.

### C. Recovery

1. **¿Olvidaste tu contraseña?** → submit a valid email.
2. Generic copy: **Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.**
3. Button shows **Enviar en 59 s** and helper **Podrás solicitar otro en 59 s.**
4. Does not reveal whether the user exists.
5. Recovery cooldown does not block confirmation resend for the same email.

### D. Refresh during cooldown

1. Start a resend or recovery cooldown.
2. Refresh the page.
3. Countdown is restored from `sessionStorage` (`nido.emailCooldown`: action, normalized email, `sentAt` only).
4. No password, access token, refresh token, recovery token, or confirmation token is stored.

### E. Change of email

1. Start cooldown for `a@example.com`.
2. Change the field to `b@example.com`.
3. The cooldown for A does not block B. Emails are trimmed and lowercased before the key is built.

### F. Double click

1. Double-click **Reenviar correo** or **Enviar enlace**, or press Enter repeatedly.
2. Only one request is sent. The button stays disabled with the existing loading label while the request is in flight.

### G. Rate limit

1. If Supabase/Brevo returns a rate limit, show the existing rate-limit message.
2. Do not start a new artificial 60-second UX cooldown on that rejection.
3. Provider rate limits are unchanged.

## E. Login

1. Log in with a confirmed account.
2. Active Nido → live dashboard (empty if the Nido has no financial rows). No Nido → Nido Selection.

## F. Wrong password

1. Log in with a wrong password.
2. Generic: **Email o contraseña incorrectos.**
3. Does not say whether the email exists.

## G. Forgot password

1. **¿Olvidaste tu contraseña?**
2. Submit a valid email → generic “if registered” copy.
3. Invalid email is rejected client-side.
4. Immediate second submit is blocked by the 60-second UX cooldown.
5. Open the link → `/auth/callback` → `/auth/update-password`.

## H. Recovery in another tab

1. Tab A: request recovery.
2. Tab B: open the recovery link → **Nueva contraseña**.
3. Tab A must **not** jump to MainApp or Nido Selection.
4. Save the new password in Tab B → Selection or Dashboard according to membership.
5. URL has no access/refresh tokens.

## I. Create Nido

1. From Nido Selection, **Crear un nuevo Nido**.
2. Empty / whitespace-only Nido name is rejected. Unicode names are accepted. Names are not globally unique.
3. Display name is required, trimmed, and written to `profiles.display_name` only at finalization.
4. **Crear mi Nido** creates one household. A second tap does not create a duplicate.

## J. Refresh during onboarding

1. Fill several onboarding steps.
2. Refresh → draft restores. No household exists until final submit.
3. Invalid money in the draft stays invalid (not coerced to 0).

## K. Invalid money

1. Income, savings, and expense amounts reject negative, NaN, Infinity, malformed, too-large, and too-many-decimal values.
2. Empty optional savings remain empty.
3. Spanish messages: **Ingresa un monto válido.** / **El monto no puede ser negativo.** / **El monto es demasiado grande.**

## L. Custom expense

1. Custom name is required (trim, reject whitespace-only, max length).
2. Amount must be greater than zero.
3. Personal/shared classification is required.
4. Duplicate taps do not add the expense twice while saving.

## M. Invite another user

1. After creating a Nido, generate a link/QR.
2. `/join/<token>` shows the Nido name, not financial data.

## N. Duplicate invitation

1. If inviting by email is used, a second pending invite for the same Nido/email maps to **Ya existe una invitación pendiente para ese correo.**
2. Link/QR invites remain token-unique.

## O. Join invitation

1. Unauthenticated `/join/<token>` → sign in or sign up, then return to the invite.
2. Accept → live dashboard (empty until financial rows exist).
3. Malformed / invalid token → **Invitación no válida** without raw database errors.

## P. Already-member invitation

1. A member of that Nido who opens the invite sees that they already belong (or **Ya tienes un Nido** if the household id is not in the public preview).
2. Accept RPC still returns **Ya perteneces a este Nido.**

## Q. Already-in-another-Nido invitation

1. A user with a different active Nido cannot join.
2. Copy: only one active Nido at a time.

## R. Logout

1. From the dashboard, log out.
2. **Cerrando sesión…** → Auth Landing.
3. Onboarding draft is cleared. The Nido remains in Supabase.
4. From **Nido Selection**, **Cerrar sesión** is also available so a signed-in user is not trapped.

## S. Re-login

1. Log in again → same destination as membership (MainApp or Selection).
2. Draft does not resurrect after logout.

## T. Duplicate household name

1. Create a Nido named **Casa** (or **Nido**).
2. Another independent account can also create **Casa**.
3. Household id remains the identity. No unique error on `households.name`.

---

## Dashboard live data (Phase 9.1.1)

1. Sign in with an active Nido that has **no** incomes/expenses/goals → Home shows empty copy, not Diana/Carlos prototype numbers.
2. Seed or insert a real expense/income/goal in Supabase → refresh Home → those values appear.
3. A failed load shows **No pudimos cargar tus datos. Inténtalo de nuevo.** and **Reintentar**, not a PostgREST message.
4. Log out from Home still returns to Auth Landing.
5. A user without an active Nido still cannot open MainApp.

---

## Registrar un gasto (Phase 9.1.2A)

Requires migration `20260821000000_nido_categories_and_create_expense.sql` on the linked project. Unit tests do **not** replace this checklist. SQL RLS cases `X01`–`X07` in `supabase/tests/rls_security_matrix.sql` also need a real Supabase database.

1. Create or open an active Nido. Confirm it has default expense categories (Vivienda, Despensa, …).
2. Home `+` → bottom sheet with Registrar un gasto, Crear una meta, Registrar una aportación.
3. **Registrar una aportación** → form with the Nido’s active goals. If none exist, **Todavía no hay metas** + **Crear una meta**.
4. **Registrar un gasto** opens the form. Categories are the Nido’s active expense categories, not another household’s.
5. Empty amount, `0`, negative, and malformed amounts are rejected in Spanish. Invalid input is not coerced to `0`.
6. Empty / whitespace description is rejected. Unicode is kept.
7. Register a **personal** gasto for today → it appears in Home spent this month and activity.
8. Register a **shared** gasto with at least two active members → `expense_splits` amounts sum to the expense.
9. Double-tap **Guardar gasto** → one row. Button shows **Guardando…** and stays disabled.
10. A date in a previous month updates activity if recent, but does not change “este mes” totals.
11. A user who already left the Nido cannot register a gasto there.
12. Errors stay in Spanish. No PostgREST / `nido.*` raw codes.

Manual runs actually executed for this checklist: none in this phase.

---

## Cerrar gastos (Phase 9.1.2B)

Requires migrations `20260821000000_nido_categories_and_create_expense.sql` and `20260821120000_nido_expense_mutations.sql` on the linked project. Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `X08`–`X14` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Crear gasto personal** — Home `+` → Registrar un gasto → personal → aparece en Home y Gastos.
B. **Crear gasto compartido** — al menos dos miembros activos; los splits suman el monto.
C. **Ver gasto en Home** — total del mes y actividad reciente usan el snapshot real.
D. **Ver gasto en Gastos** — lista del mes actual, sin mocks, ordenada por fecha.
E. **Abrir detalle** — descripción, monto, categoría, fecha, personal/compartido, quién registró, quién pagó, distribución si es compartido.
F. **Editar como creador** — Editar visible; validaciones iguales a crear; splits se reemplazan.
G. **Ver cambio en Home** — después de guardar, `useDashboard().refresh()` actualiza totales y actividad.
H. **Intentar editar como otro miembro** — no hay Editar/Eliminar; una mutación directa debe rechazarse (RLS/RPC, no solo UI).
I. **Eliminar como creador** — confirmación **¿Eliminar este gasto?** / **Esta acción quitará el gasto de tus totales y actividad.** Cancelar (ghost) + Eliminar gasto (danger). No borra al primer tap.
J. **Desaparece de totales** — el monto ya no entra en el mes.
K. **Desaparece de actividad normal** — no aparece en la capa de actividad del snapshot (la pantalla Actividad sigue siendo prototipo).
L. **Intentar eliminar como otro miembro** — no hay botón; RPC/RLS rechaza.
M. **Refresh** — los gastos reales siguen; el soft-deleted no vuelve.
N. **Logout/login** — misma lista y totales.
O. **Mobile** — scroll, safe-area, footer 56px, pinch-to-zoom habilitado.
P. **Empty state** — Nido sin gastos: **Sin gastos todavía** + **Registrar un gasto** abre el mismo ExpenseFlow.
Q. **Error de red** — copy en español, sin PostgREST.
R. **Doble tap** — Guardar / Eliminar: un solo request, botones disabled + loading.

Manual runs actually executed for this checklist: none in this phase.

---

## Metas (Phase 9.1.3A)

Requires migration `20260821180000_nido_goal_mutations.sql` on the linked project (plus prior financial migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `Y01`–`Y12` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Empty state** — Nido sin metas: **Sin metas todavía** + **Crear una meta**. Home **¿Tienen algo en mente?** no muestra números prototipo.
B. **Crear meta** — Home `+` → Crear una meta. Nombre obligatorio, monto > 0, fecha y descripción opcionales, tipo ahorro/compra. Aparece en Metas y Home.
C. **Progreso** — `SUM(goal_contributions.amount) / target_amount`. Sin contribuciones: 0%. Al 100% se muestra 100%. Si las aportaciones exceden, el porcentaje se capea a 100% y el monto ahorrado sigue siendo la suma real. No hay `current_amount`.
D. **Editar como creador** — detalle → Editar; mismas validaciones.
E. **Archivar como creador** — **¿Archivar esta meta?** / **Dejará de aparecer en Metas y en el inicio. Las aportaciones se conservan.** Cancelar (ghost) + Archivar meta (danger).
F. **Otro miembro** — puede ver; no hay Editar/Archivar; RPC/RLS rechaza la mutación.
G. **Refresh** — `useDashboard().refresh()` actualiza Home y Metas. Un solo snapshot.
H. **Doble tap** — un solo request; botón disabled + loading.
I. **Error de red** — copy en español, sin PostgREST.
J. **Registrar una aportación** is live in 9.1.3B.

Manual runs actually executed for this checklist: none in this phase.

---

## Aportaciones (Phase 9.1.3B)

Requires migration `20260821200000_nido_goal_contribution_mutations.sql` on the linked project (plus prior financial and goal migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `Z01`–`Z11` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Empty state** — Nido sin metas activas: **Todavía no hay metas** + **Crear una meta** reutiliza GoalFlow.
B. **Crear aportación** — Home `+` → Registrar una aportación. Meta activa, monto > 0, fecha (hoy por default en America/Mexico_City).
C. **Progreso** — `SUM(goal_contributions.amount) / target_amount`. Home, Metas, detalle y actividad se actualizan con `dashboard.refresh()`. No hay `current_amount`.
D. **Otro miembro** — puede aportar a una meta que no creó. El progreso suma ambas aportaciones.
E. **Supera el objetivo** — se acepta; el porcentaje visual se capea a 100%; el monto ahorrado es la suma real; no se persiste `status = completed`.
F. **Meta archivada** — no aparece en el selector; RPC/RLS rechaza.
G. **Miembro histórico / otro Nido** — no puede aportar.
H. **Doble tap** — un solo request; botón disabled + loading (`aria-busy`).
I. **Error de red** — copy en español, sin PostgREST.
J. **Editar / eliminar aportación** is live in 9.1.3D (`deleted_at` + creator-only UPDATE).
K. **9.1.3C ingresos** no se inició.
L. **9.1.4** no se inició.

---

## Editar / eliminar aportación (Phase 9.1.3D)

Requires migration `20260821210000_nido_goal_contribution_edit.sql` on the linked project (plus prior financial, goal, and contribution-create migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `Z12`–`Z22` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Listado en detalle** — aportaciones reales, `contributed_at` desc luego `created_at`. Sin mocks.
B. **Editar como creador** — Editar visible; mismas validaciones de monto y fecha; la meta no cambia.
C. **Eliminar como creador** — confirmación **¿Eliminar esta aportación?** / **Esta acción quitará la aportación del progreso y de la actividad.** Cancelar (ghost) + Eliminar aportación (danger).
D. **Otro miembro** — solo lectura; no hay Editar/Eliminar; RPC/RLS rechaza.
E. **Progreso** — `SUM(...) WHERE deleted_at IS NULL / target_amount`. Home, Metas, detalle y actividad se actualizan con `dashboard.refresh()`. No hay `current_amount`. No se persiste `status = completed`.
F. **Aportación eliminada** — no entra en progreso, totales ni actividad; no se puede volver a modificar.
G. **Meta archivada** — no acepta nuevas aportaciones ni mutaciones de las existentes.
H. **Miembro histórico / que salió / otro Nido / no autenticado** — no puede editar ni eliminar.
I. **Doble tap** — un solo request; botón disabled + loading.
J. **Error de red** — copy en español, sin PostgREST.
K. **9.1.3C ingresos** no se inició.
L. **9.1.4** no se inició.

Manual runs actually executed for this checklist: none in this phase.

Manual runs actually executed for this checklist: none in this phase.

---

## Unconfirmed login

If Supabase reports email-not-confirmed on login:

- Show the confirmation copy.
- Offer **Reenviar correo de confirmación**.
- Do not auto-resend.

---

## Security quick check

- No `service_role` in the frontend
- No auth tokens in `localStorage`
- No passwords in URLs, logs, or the onboarding draft
- No sensitive auth data in `sessionStorage` (draft is onboarding fields only; pending invite is a join token, not an access token; email cooldown stores only action, normalized email, and a timestamp)
- `?next=` rejects absolute URLs (`safeNextPath`)
- Recovery marker still distinguishes recovery from login
- RLS for expense UPDATE/splits is now creator-only (`20260821120000`); goal UPDATE/archive is creator-only (`20260821180000`). SQL matrix `X01`–`X14` and `Y01`–`Y12` needs a real database. Unit mocks are not RLS proofs.
- No account enumeration on signup, resend, or recovery
- No “email exists” lookup, RPC, or client query to `auth.users`
- Signup does not inspect `identities` / user id to branch the UI
- Raw Supabase / Postgres errors are never shown

---

## Scroll (Phase 8.10.4)

Default Auth/Onboarding/Join screens use document scroll (`min-h-dvh`). Do **not** require selecting text to move the page. Wheel, trackpad, touch swipe, and keyboard must work when content exceeds the viewport.

**Registrar un gasto** (Phase 9.1.2A): internal scroll + sticky **Guardar gasto** (safe-area footer). Wheel, trackpad, and touch must move the fields. The footer must not cover the last field.

For each screen below, check a short desktop viewport, a large desktop viewport, and mobile. If content is taller than the viewport, scroll directly.

Auth:
- Crear cuenta
- Iniciar sesión
- Recuperar acceso
- Nueva contraseña
- Revisa tu correo

Onboarding:
- Nido Selection
- Dale nombre a tu Nido
- ¿Cómo te llamas?
- Ingreso
- Ahorros
- Gastos mensuales estimados (internal scroll + sticky CTA)
- Registrar un gasto (internal scroll + sticky Guardar gasto)
- División
- Invitaciones
- Crear mi Nido
- error / loading shells

Join:
- preview
- error
- aceptación
- loading

---

## Manual runs actually executed

None in this phase. Do not record production results here unless they were performed.
