# Manual test checklist (Phase 8.10.2)

Use this against a real Vercel + Supabase + SMTP environment. Automated unit tests do not replace these flows.

Confirm email stays enabled. Google OAuth stays disabled and is not a pending 9.4 item ([future.md](./future.md)). Do not use the service-role key in the browser. Do not treat this checklist as executed in production unless the run is recorded below.

Phase 9.4 scope: [phase-9.4.md](./phase-9.4.md). 9.4.1–9.4.9 are implemented. 9.4.10 applied migrations 15–18 and executed the live RLS matrix. Phase status: **IMPLEMENTADA — VALIDACIÓN OPERATIVA PARCIAL (SMOKE UI PENDIENTE)**.

Phase 9.1.1 connects Home to live Supabase reads. Phase 9.1.2A adds **Registrar un gasto**. Phase 9.1.2B closes Gastos (list, detail, edit, soft-delete). Phase 9.1.3A connects Metas (list, create, edit, archive). Phase 9.1.3B connects **Registrar una aportación**. Phase 9.1.3D closes aportaciones (edit / soft-delete). Phase 9.1.3C connects **Ingresos**. Phase 9.1.4 connects **Presupuestos**. Phase 9.2.1 connects **Actividad** to the live snapshot (no `FEED` mock) and still does not invent budget events. Phase 9.2.2 persists the onboarding monthly income with the Nido. See [financial.md](./financial.md).

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
4. **Crear mi Nido** / invite waits for `create_household_with_onboarding_income` before entering Home. A second tap does not create a duplicate Nido or a second income.
5. After success, Home / Ingresos / Actividad show the declared monthly income (Sueldo). Gastos, Metas, and Presupuestos stay empty unless the user adds rows later. Savings and estimated expenses do not appear as movements.

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

1. After creating a Nido, the owner generates a link from Hogar. **Mostrar QR** on a pending invitation opens `InviteQrModal` with a real QR of `buildInvitationUrl(origin, token)`.
2. `/join/<token>` shows the Nido name, not financial data.
3. The invitation appears in the Hogar list as **Pendiente**, with **Copiar enlace**, **Mostrar QR**, and **Cancelar**. Accepted and expired rows have no QR action.
4. The full token / URL is not shown as text. Copy and Share (when `navigator.share` exists) use the same URL as the QR. Cancelling the share sheet is not a product error.

## N. Duplicate invitation

1. Nido does not support email invitations. There is no email-invite surface in Hogar or onboarding.
2. Link/QR/Share invites remain token-unique (`/join/<token>`).

## O. Join invitation

1. Unauthenticated `/join/<token>` → sign in or sign up, then return to the invite.
2. If `profiles.display_name` is still the email local-part fallback, the join page asks for a name before continue. The entered name is written with `updateMyDisplayName` and then `accept_invitation` runs once.
3. A user who already has a chosen `display_name` is not asked to type it again.
4. Before accept, the join page asks **¿Cuánto ganas al mes?** with the same copy and validation as create-Nido onboarding. Amount `> 0` becomes an `incomes` row (Sueldo / Ingreso mensual neto, today in `America/Mexico_City`). Amount `0` joins with no income row.
5. Accept → live dashboard. `profiles.display_name` is the entered name, not the email local-part. Home / Ingresos / Actividad show the joiner’s income when it was persisted.
6. Malformed / invalid token → **Invitación no válida** without raw database errors.

## P. Already-member invitation

1. The public preview does not include `household_id`, so the page does not pre-label “this Nido” vs “another Nido”.
2. Accept RPC returns `nido.already_member` → **Ya perteneces a este Nido.** No second active membership.

## Q. Already-in-another-Nido invitation

1. A user with a different active Nido cannot join. Accept RPC returns `nido.already_in_nido`.
2. Copy: only one active Nido at a time. The original membership is unchanged.

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
8. Register a **shared** gasto with two active members → **Quién pagó** defaults to the writer (titular); it can be switched to the other member. **Quiénes participan** does not appear; both members are participants. `expense_splits` amounts sum to the expense.
9. With **three or more** members, a shared gasto shows **Quiénes participan**. Unselected members are not split.
10. Double-tap **Guardar gasto** → one row. Button shows **Guardando…** and stays disabled.
11. A date in a previous month updates activity if recent, but does not change “este mes” totals.
12. A user who already left the Nido cannot register a gasto there.
13. Errors stay in Spanish. No PostgREST / `nido.*` raw codes.

Manual runs actually executed for this checklist: none in this phase.

---

## Cerrar gastos (Phase 9.1.2B)

Requires migrations `20260821000000_nido_categories_and_create_expense.sql` and `20260821120000_nido_expense_mutations.sql` on the linked project. Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `X08`–`X14` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Crear gasto personal** — Home `+` → Registrar un gasto → personal → aparece en Home y Gastos.
B. **Crear gasto compartido** — al menos dos miembros activos; **Quién pagó** por defecto el titular; con dos miembros no aparece **Quiénes participan**; los splits suman el monto.
C. **Ver gasto en Home** — total del mes y actividad reciente usan el snapshot real.
D. **Ver gasto en Gastos** — lista del mes actual, sin mocks, ordenada por fecha.
E. **Abrir detalle** — descripción, monto, categoría, fecha, personal/compartido, quién registró, quién pagó, distribución si es compartido.
F. **Editar como creador** — Editar visible; validaciones iguales a crear; splits se reemplazan.
G. **Ver cambio en Home** — después de guardar, `useDashboard().refresh()` actualiza totales y actividad.
H. **Intentar editar como otro miembro** — no hay Editar/Eliminar; una mutación directa debe rechazarse (RLS/RPC, no solo UI).
I. **Eliminar como creador** — confirmación **¿Eliminar este gasto?** / **Esta acción quitará el gasto de tus totales y actividad.** Cancelar (ghost) + Eliminar gasto (danger). No borra al primer tap.
J. **Desaparece de totales** — el monto ya no entra en el mes.
K. **Desaparece de actividad normal** — no aparece en Home ni en la pestaña Actividad después de `dashboard.refresh()`.
L. **Intentar eliminar como otro miembro** — no hay botón; RPC/RLS rechaza.
M. **Refresh** — los gastos reales siguen; el soft-deleted no vuelve.
N. **Logout/login** — misma lista y totales.
O. **Mobile** — scroll, safe-area, footer 56px, pinch-to-zoom bloqueado.
P. **Empty state** — Nido sin gastos: **Sin gastos todavía** + **Registrar un gasto** abre el mismo ExpenseFlow.
Q. **Error de red** — copy en español, sin PostgREST.
R. **Doble tap** — Guardar / Eliminar: un solo request, botones disabled + loading.

Manual runs actually executed for this checklist: none in this phase.

---

## Metas (Phase 9.1.3A)

Requires migration `20260821180000_nido_goal_mutations.sql` on the linked project (plus prior financial migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `Y01`–`Y12` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Empty state** — Nido sin metas ni fondos: **Sin metas ni fondos todavía** + **Crear una meta o un fondo**. Home **¿Tienen algo en mente?** no muestra números prototipo.
B. **Crear meta o fondo** — Home `+` → Crear una meta o un fondo. Nombre obligatorio, monto > 0, fecha y descripción opcionales, tipo fondo/meta, alcance personal/compartido. Aparece en Metas. Solo un **fondo compartido** entra en meses de soporte.
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

A. **Empty state** — Nido sin metas/fondos a los que pueda aportar: **Todavía no hay metas ni fondos** + **Crear una meta o un fondo** reutiliza GoalFlow.
B. **Crear aportación** — Home `+` → Registrar una aportación. Meta o fondo activo (compartido, o personal propio), monto > 0, fecha (hoy por default en America/Mexico_City).
C. **Progreso** — `SUM(goal_contributions.amount) / target_amount`. Home, Metas, detalle y actividad se actualizan con `dashboard.refresh()`. No hay `current_amount`.
D. **Otro miembro** — puede aportar a un **compartido** que no creó. No puede aportar a un **personal** ajeno. El progreso suma ambas aportaciones en el compartido.
E. **Supera el objetivo** — se acepta; el porcentaje visual se capea a 100%; el monto ahorrado es la suma real; no se persiste `status = completed`.
F. **Meta archivada** — no aparece en el selector; RPC/RLS rechaza.
G. **Miembro histórico / otro Nido** — no puede aportar.
H. **Doble tap** — un solo request; botón disabled + loading (`aria-busy`).
I. **Error de red** — copy en español, sin PostgREST.
J. **Editar / eliminar aportación** is live in 9.1.3D (`deleted_at` + creator-only UPDATE).
K. **9.1.3C ingresos** is live (`incomes.deleted_at` + creator-only UPDATE).
L. **9.1.4 presupuestos** is live (`budgets.deleted_at` + creator-only UPDATE).

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
K. **9.1.3C ingresos** is live (`incomes.deleted_at` + creator-only UPDATE).
L. **9.1.4 presupuestos** is live (`budgets.deleted_at` + creator-only UPDATE).

Manual runs actually executed for this checklist: none in this phase.

---

## Ingresos (Phase 9.1.3C)

Requires migration `20260821220000_nido_income_mutations.sql` on the linked project (plus prior financial migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `I01`–`I13` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session.

A. **Empty state** — Nido sin ingresos: **Sin ingresos todavía** + **Registrar un ingreso**.
B. **Crear ingreso** — Home `+` → Registrar un ingreso. Monto > 0, descripción, categoría de ingreso, fecha (hoy por default en America/Mexico_City).
C. **Listado** — Ingresos tab muestra filas reales del mes. Home muestra el mismo `periodIncome` del snapshot.
D. **Editar como creador** — Editar visible; mismas validaciones; `member_id` / `created_by` no cambian.
E. **Eliminar como creador** — confirmación **¿Eliminar este ingreso?** / **Esta acción quitará el ingreso de tus totales y actividad.** Cancelar (ghost) + Eliminar ingreso (danger).
F. **Otro miembro** — solo lectura; no hay Editar/Eliminar; RPC/RLS rechaza.
G. **Total** — `SUM(incomes.amount) WHERE deleted_at IS NULL` y `occurred_at` en el mes. No hay columna derivada. Recurring templates no se suman.
H. **Ingreso eliminado** — no entra en totales, salud, Ingresos ni actividad; no se puede volver a modificar.
I. **Miembro histórico / que salió / otro Nido / no autenticado** — no puede crear, editar ni eliminar.
J. **Doble tap** — un solo request; botón disabled + loading (`aria-busy`).
K. **Error de red** — copy en español, sin PostgREST.
L. **9.1.4 presupuestos** is live (`budgets.deleted_at` + creator-only UPDATE).

Manual runs actually executed for this checklist: none in this phase.

---

## Presupuestos (Phase 9.1.4)

Requires migration `20260821230000_nido_budget_mutations.sql` on the linked project (plus prior financial migrations). Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. SQL cases `K01`–`K16` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). The manual UI checklist below was **not** executed in a live app session. Prefix **K** is used because **B01–B09** already exist as Luis / never-member cases and **P01–P07** already exist as child-table SELECT / profile cases. Mapping to the requested B01–B16 list is 1:1.

A. **Empty state** — Nido sin presupuesto del mes: **Sin presupuestos este mes** + **Crear un presupuesto**. Home muestra la misma empty copy.
B. **Crear** — Home `+` → Crear un presupuesto. Categoría de gasto activa o **Nueva categoría** (nombre + emoji), monto > 0, mes calendario (America/Mexico_City). `member_id` NULL.
C. **Listado** — overlay Presupuestos desde Home. Límite, gastado derivado, restante, porcentaje, excedido.
D. **Editar como creador** — Editar visible; mismas validaciones; `created_by` / `household_id` no se envían como autorización.
E. **Eliminar como creador** — confirmación. Soft-delete (`deleted_at`). Los gastos no se eliminan.
F. **Otro miembro** — solo lectura; RPC/RLS rechaza mutación.
G. **Gastado** — `SUM(expenses.amount)` mismo household, categoría, fechas, `deleted_at IS NULL`. No hay `current_spent`. `recurring_expenses` no se suma.
H. **Presupuesto eliminado** — no entra en Home / Presupuestos / salud; no se puede volver a modificar.
I. **Miembro histórico / que salió / otro Nido / no autenticado** — no puede crear, editar ni eliminar.
J. **Doble tap** — un solo request; botón disabled + loading (`aria-busy`).
K. **Error de red** — copy en español, sin PostgREST.
L. **9.1.5 recurrencias** is live. Actividad no registra eventos de presupuesto ni de plantillas.

## Owner transfer y ciclo de vida (Phase 9.2)

Requires migration `20260822000000_nido_owner_transfer.sql` on the linked project. SQL cases `T01`–`T13` and `T20`–`T30` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). Owner-initiated remove (`RM01`–`RM12`) requires `20260831180000_nido_remove_household_member.sql`. Unit tests with mocks do **not** replace this checklist and are **not** real RLS proofs. The manual UI checklist below was **not** executed in a live app session.

A. **Hogar** — cada miembro muestra **Propietario** o **Miembro**.
B. **Transferir** — visible solo para el owner, y solo si hay otro miembro activo. Confirmación. No aparece uno mismo en la lista.
C. **Eliminar integrante** — visible solo para el owner, en filas de otros miembros (no en la propia ni en un propietario). Confirmación. El historial se conserva.
D. **Éxito / error** — copy clara; el antiguo owner pasa a Miembro; el nuevo puede invitar.
E. **Miembro / histórico / otro Nido / no autenticado** — no pueden transferir ni eliminar integrantes (RPC).
F. **Salir como owner** — Perfil explica que primero debe transferir. No hay un segundo CTA de transferencia.
G. **Salir como único miembro** — no puede salir ni transferir.
H. **Salir después de transferir** — el historial se conserva; el Nido sigue teniendo owner.
I. **Doble tap** — un solo request.
J. **Error de red** — copy en español, sin PostgREST.

Manual runs actually executed for this checklist: none in this phase.

---

## Recurrencias (Phase 9.1.5)

Requires migration `20260822120000_nido_recurrence_mutations.sql` on the linked project. SQL cases `RE01`–`RE16` in `supabase/tests/rls_security_matrix.sql` were **executed** against linked `nido_dev` in this phase (all passed; transaction rolled back). Prefix **RE** is used because **R01** already exists as the membership-helper smoke test. Mapping to the requested R01–R16 list is 1:1 (RE01=create, …, RE16=departed creator). Unit tests with mocks are **not** real RLS or idempotency proofs.

**Las recurrencias son plantillas; los movimientos reales son los únicos que participan en cálculos financieros.**

A. **Crear plantilla** — Gastos / Ingresos → Recurrencias → Nueva. No se insertan `expenses` / `incomes`.
B. **Listado** — plantillas con próximo movimiento y estado. Copy deja claro que no están contabilizadas.
C. **Editar como creador** — monto, categoría, frecuencia, splits. `household_id` / `created_by` no autorizan.
D. **Pausar / reactivar** — `is_active`. Los movimientos ya creados permanecen.
E. **Materializar** — **Registrar este periodo** solo si `next_occurrence <= hoy`. Crea el movimiento, avanza el cursor, `dashboard.refresh()`.
F. **Idempotencia** — el mismo periodo no crea dos filas (índice único + RPC). Doble tap / retry / concurrente.
G. **Otro miembro / otro Nido / histórico / no autenticado** — no pueden editar ni materializar.
H. **Creador que salió** — no materializa; historial intacto. Sus `recurring_incomes` quedan inactivas.
I. **Actividad** — solo el movimiento real. Crear/pausar una plantilla no es un evento financiero.
J. **Doble tap** — un solo request; botón disabled + loading.

Manual runs actually executed for this checklist: none in this phase.

---

## Actividad real (Phase 9.2.1)

No new migration. Reads the existing dashboard snapshot. Unit coverage lives in `src/lib/nido/financial/activity.test.ts` and `dashboard.test.ts`. Those tests are **not** a live UI proof.

A. **Sin mock** — la pestaña no usa `FEED` ni nombres/montos hardcodeados.
B. **Gasto / ingreso / aportación** — cada tipo aparece con miembro, categoría o meta, monto y fecha reales.
C. **Soft-delete** — un gasto, ingreso o aportación eliminado desaparece del feed.
D. **Orden** — `occurred_at` / `contributed_at` desc, empate por `created_at` desc.
E. **Nido activo** — no se mezclan movimientos de otro household.
F. **Recurrencias** — una plantilla no aparece; el movimiento materializado sí.
G. **Estados** — loading, vacío (**Todo tranquilo por aquí.** + las tres acciones existentes) y error con **Reintentar**.
H. **Refresh** — crear / editar / eliminar actualiza Actividad vía `dashboard.refresh()` sin duplicar filas.
I. **Detalle** — tap abre `ExpenseDetail` / `IncomeDetail` / `GoalDetail`.
J. **Mobile** — scroll manual, safe-area, el contenido largo no queda bloqueado.

Manual runs actually executed for this checklist: none in this phase.

---

## Persistencia financiera del onboarding (Phase 9.2.2)

Unit coverage lives in `src/lib/onboarding/financial-plan.test.ts`, `src/lib/nido/create-household-onboarding.test.ts`, and the existing draft/validation tests. Those tests are **not** a live UI proof. SQL matrix `OB01`–`OB11` is the RLS proof.

A. **Draft completo / mínimo** — ambos persisten solo el ingreso si `salary > 0`.
B. **Ingreso válido** — aparece en Home, Ingresos y Actividad como Sueldo / Ingreso mensual neto, fecha de hoy en `America/Mexico_City`.
C. **Ingreso inválido** — no se crea el Nido. El draft se conserva.
D. **Ahorros** — opcionales en el draft; no aparecen en Metas ni como aportaciones.
E. **Gastos estimados** — no aparecen en Gastos, Presupuestos ni Actividad.
F. **Método de división** — no crea un gasto ni una columna de household.
G. **Guardar → confirmar → entrar** — el botón espera la RPC. No entra a Home y luego intenta guardar.
H. **Doble tap / retry** — un solo household y un solo ingreso.
I. **Abandono** — refresh restaura el draft; no hay filas en Supabase.
J. **Error de red** — mensaje `NidoError` en español; el draft sigue; Reintentar no duplica.
K. **Mobile** — scroll manual en gastos estimados; el CTA de invitaciones no queda tapado.

Manual runs actually executed for this checklist:

- `20260822300000_nido_onboarding_financial.sql` applied to linked `nido_dev` (`pxfdvhavcddqmhuljxlf`)
- `npx supabase db query --linked -f supabase/tests/rls_security_matrix.sql` — all assertions passed, including `OB01`–`OB11`; the script ended in `ROLLBACK`
- Unit tests / `tsc` / `npm run build` passed in this phase
- Full UI walkthrough (Home / Ingresos / Gastos / Metas / Presupuestos / Actividad, double tap, mobile scroll) still needs a signed-in session in the running app

---

## Cierre de integración (Phase 9.2.3)

Re-audit of the live repo + linked `nido_dev` on 2026-08-21. No new tables or columns were added.

Technical validations executed in this phase:

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test "src/**/*.test.ts"` | 627 passed, 0 failed |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |
| `node supabase/tests/validate_rls_coverage.mjs` | 14 tables |
| `npx supabase db query --linked -f supabase/tests/rls_security_matrix.sql` | 239 assertions, 0 failed, `ROLLBACK` |
| Remote migrations | all 13 local files present on `nido_dev` |

The matrix did not leave `rls-matrix` / `@nido.test` users. Existing `nido_dev` data after rollback was one household with one member and no financial rows — that is not matrix leftover.

Manual UI smoke (two real users, mobile, double-tap in the running app) was **not** executed in this audit. Checklists A–J in the 9.2.3 brief remain the product walkthrough.

Hogar no longer renders the prototype split-model constants (`D_INC`, `TOT_B`). Perfil no longer renders `DIANA_ITEMS` / `DIANA_EXTRAS`. Those leftovers are not dashboard sources. Home, Gastos, Ingresos, Metas, Presupuestos, and Actividad use `useDashboard()` → `fetchDashboardSnapshot()` → `buildDashboardViewModel()`.

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
- RLS for expense UPDATE/splits is now creator-only (`20260821120000`); goal UPDATE/archive is creator-only (`20260821180000`). SQL matrix `X01`–`X14`, `Y01`–`Y12`, and onboarding persist `OB01`–`OB11` need a real database. Unit mocks are not RLS proofs.
- No account enumeration on signup, resend, or recovery
- No “email exists” lookup, RPC, or client query to `auth.users`
- Signup does not inspect `identities` / user id to branch the UI
- Raw Supabase / Postgres errors are never shown

---

## Scroll (Phase 8.10.4)

Default Auth/Onboarding/Join screens use document scroll (`min-h-dvh`). Do **not** require selecting text to move the page. Wheel, trackpad, touch swipe, and keyboard must work when content exceeds the viewport.

**Registrar un gasto** (Phase 9.1.2A): one internal scroll. Title, fields, and **Guardar gasto** travel with the content. Only **Cerrar** stays pinned. Wheel, trackpad, and touch must move the whole form. The CTA must not cover the last field and must not stay glued to the bottom of the viewport.

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
- Gastos mensuales estimados (internal scroll; only Atrás pinned; Continuar at the end of the list)
- Registrar un gasto (internal scroll; only Cerrar pinned; Guardar at the end of the form)
- División
- Invitaciones
- Crear mi Nido
- error / loading shells

Join:
- preview
- name (fallback display name only)
- error
- aceptación
- loading

---

## Manual runs actually executed

Phase 9.2.4 against local app + linked `nido_dev` (`pxfdvhavcddqmhuljxlf`) on 2026-08-22:

- Migration `20260822400000_nido_expense_payer_identity.sql` applied. Remote INSERT/UPDATE of `expenses` now requires `payer_id = auth.uid()`.
- RLS matrix: 207 assertions, 0 failed, script ended in `ROLLBACK`.
- Unit tests 627 passed. `tsc` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables.
- Smoke UI used test accounts `nido.smoke.carlos.924@nido.test` and `nido.smoke.diana.924@nido.test` on a new household **Nido Smoke 924**. The preexisting **Departamento** household was left intact (1 member, 0 financial rows).
- Walkthrough results: A, B, C, E, H, J observed against the live app/DB. D, F, G, I did not complete a full two-user proof in this run.

Phase 9.3.1 closure audit against the repo + linked `nido_dev` (`pxfdvhavcddqmhuljxlf`) on 2026-08-22:

- No new migration, table, column, or RPC. Local and remote still have the same 14 migrations. `household_invitations` still has no persisted `status`, `cancelled_at`, `code`, or `owner_id`.
- Unit tests 642 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables.
- RLS matrix re-run: 239 assertions, 0 failed, script ended in `ROLLBACK`. Invitation product cases `J01`–`J30` (plus `J17b` / `J28b`) cover lookup, accept, and owner DELETE cancel. Seeded matrix users and tokens did not persist.
- **Departamento** (1 owner) and **Nido Smoke 924** remained. Two pre-existing Smoke 924 invitation rows remained. No `nido-rls-j-%` invitation rows.
- Manual Hogar two-user smoke (create → list → copy → cancel → accept as second user → accepted in list) is **BLOCKED**. This environment cannot operate the app with two real sessions. Do not treat RPC/matrix success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and automated checks are complete; the 10-step UI smoke is the only open 9.3.1 item.

Phase 9.3.2 (join + identity) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. `profiles` UPDATE remains `id = auth.uid()`. `lookup_invitation` still returns only status + household name.
- Unit tests 669 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables.
- RLS matrix was **not** re-run: schema and policies are unchanged from the 9.3.1 run (239 passed, 0 failed).
- New coverage: `isFallbackDisplayName`, `joinDisplayNameDecision` / `completeJoinInvitationWithAuth` (name before accept; `already_member` vs `already_in_nido`; invitation invalid/expired/accepted), `withTransientRetry` (network → success, persistent network, domain no-retry, max 2 attempts).
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users or invitations were created.
- Manual UI smoke (new invitee enters a name, fallback rename, same/other Nido accept errors, post-login retry) is **BLOCKED**. This environment cannot operate the app with real browser sessions. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and automated checks are complete; the 6-case UI smoke is the only open 9.3.2 item.

Phase 9.3.3 (real QR + Web Share) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. The QR encodes the existing `/join/<token>` URL. Web Share is optional and client-only.
- Unit tests 676 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables. RLS matrix was **not** re-run: schema and policies are unchanged from the 9.3.1 run (239 passed, 0 failed).
- New coverage: `canShowInvitationQr` (pending only), `invitationDestination` / `invitationQrValue` / `shareInvitationPayload` (same `buildInvitationUrl` destination), `shareInvitationUrl` (correct URL, cancellation vs failure, no share UI when `navigator.share` is missing).
- Physical scan of the QR and the 6-case Hogar/share UI smoke are **BLOCKED**. This environment cannot operate the app with a real browser session or a second device. Do not treat unit/build success as a UI or scan pass.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users or invitations were created.
- Verdict: recorded in the 9.3.3 execution report.

Phase 9.3.4 (Hogar prototype financial mock cleanup) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. The contribution-model block was removed from Hogar. No replacement schema or “modelo de aportación” persist was added.
- Unit tests 676 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables. RLS matrix was **not** re-run: schema and policies are unchanged from the 9.3.1 run (239 passed, 0 failed).
- Removed from Hogar: “Modelo de aportación”, Persona A / Persona B, and prototype constants `D_INC`, `C_INC`, `D_CAP`, `C_CAP`, `T_INC`, `T_CAP`, `TOT_B`. MainApp leftover `model` / `setModel` state for that block was also removed. Onboarding still uses the local `Model` type.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users or invitations were created.
- Manual Hogar UI smoke (10 cases: mocks gone, members/invitations/QR/ownership/name unchanged, no new financial widget) is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and automated checks are complete; the 10-step UI smoke is the only open 9.3.4 item.

Phase 9.3.5 (Perfil: real identity + mock cleanup) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. `profiles` UPDATE remains `profiles_update_self` (`id = auth.uid()`). Perfil edits `display_name` through the existing `updateMyDisplayName` / `normalizeDisplayName` path.
- Unit tests 685 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables. RLS matrix was **not** re-run: schema and policies are unchanged from the 9.3.1 run (239 passed, 0 failed).
- Removed from Perfil: “Gastos fijos personales”, “Extra este mes”, and prototype constants `DIANA_ITEMS` / `DIANA_EXTRAS`. No personal-expense table or RPC was added.
- New coverage: `normalizeDisplayName` valid/invalid cases, `updateMyDisplayNameWithAuth` (persist only `display_name`, Supabase error + retry, no email local-part overwrite), `canSubmitDisplayName`.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users or invitations were created.
- Manual Perfil UI smoke (edit name, persist after reload, reject empty/>80, email/Nido/role intact, mocks gone, Leave, Logout) is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and automated checks are complete; the 18-case UI smoke is the only open 9.3.5 item.

Phase 9.3.6 (email invitations closed as unsupported) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. `household_invitations.email` remains a historical nullable column. New invitations insert `email` as null.
- Removed dead invitation-email helpers (`normalizeInviteEmail`, `isInviteEmailValid`, `invitationEmailIssue`) and the unused `createInvitation({ email })` input. Hogar/onboarding copy no longer implies email delivery is pending.
- Unit tests 680 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables. RLS matrix was **not** re-run: schema and policies are unchanged from the 9.3.1 run (239 passed, 0 failed).
- Automated scan: no email-invite UI, no invitation email provider, no email secrets in the client. Hogar and onboarding still create `/join/<token>` via `createInvitation` + `buildInvitationUrl` / `invitationDestination` (Copy, QR, Web Share).
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users or invitations were created.
- Manual Hogar/onboarding UI smoke is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.

Phase 9.4.0 (scope + technical contract, no feature implementation) against the repo + linked `nido_dev` (`pxfdvhavcddqmhuljxlf`) on 2026-08-22:

- No schema change. No `supabase db push`. Local and remote still have the same 14 migrations.
- Documentation only: [phase-9.4.md](./phase-9.4.md), [future.md](./future.md), plus alignment of nido / database / financial / security / supabase / README so discarded items are not “pending 9.4”.
- Unit tests 680 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables.
- RLS matrix was **not** re-run: no policy or table change.
- **Departamento** and **Nido Smoke 924** were not modified. No DELETE / TRUNCATE / seeds.
- Verdict: **LISTA PARA IMPLEMENTACIÓN**. No 9.4 feature is implemented. Next: 9.4.1.

Phase 9.4.1 (household name + initials + categories + `default_split_method`) against the repo on 2026-08-22:

- New migration `20260822500000_nido_household_categories_split.sql`: `households.default_split_method` (`equal` \| `proportional`, default `equal`), `update_household_name`, `update_household_default_split_method`, `create_category` / `rename_category` / `archive_category`, and `create_expense` reads the household preference for new shared expenses. All SECURITY INVOKER. No `service_role`. No RLS policy rewrite.
- Unit tests 707 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 14 tables.
- Local Docker / `supabase start` is not available in this environment, so the migration was **not** applied to a running database here. `supabase db push` against `nido_dev` was **not** run (project procedure). Remote still has the previous 14 migrations until the team applies this one.
- RLS matrix was **not** re-run: it needs the new migration applied. New assertions `Y01`–`Y20` are in `rls_security_matrix.sql` (ROLLBACK). Do not treat them as executed.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual Hogar / expense UI smoke (19 cases) is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.2 (onboarding persist: savings stock + estimates → budgets + split preference) against the repo on 2026-08-22:

- New migration `20260822600000_nido_onboarding_savings_budgets.sql`: table `savings_balances` (personal `member_id` / shared NULL, unique per household+member), RLS (SELECT members, INSERT/UPDATE creator+active, no DELETE), and `create_household_with_onboarding_income` extended with `p_split_method`, `p_savings_personal`, `p_savings_shared`, `p_estimates`. SECURITY INVOKER. No `service_role`. No client household_id or identity. Existing 2-argument calls keep working via defaults. Estimates never write `expenses`.
- Idempotency: already-active membership returns the existing household and does not insert again. No `onboarding_id`. Unique savings and live-budget indexes are the remaining backstops.
- Unit tests 725 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 15 tables (includes `savings_balances`).
- Local Docker / `supabase start` is not available in this environment, so the migration was **not** applied to a running database here. `supabase db push` against `nido_dev` was **not** run (project procedure). Remote still has the previous 14 migrations until the team applies 9.4.1 and 9.4.2.
- RLS matrix cases `OB12`–`OB28` are in `rls_security_matrix.sql` (ROLLBACK). Do not treat them as executed.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual onboarding UI smoke (16 cases) is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.3 (personal budgets UI + global visibility) against the repo on 2026-08-22:

- New migration `20260822700000_nido_personal_visibility.sql`: enum `personal_visibility` (`nido` \| `private`), `profiles.personal_visibility` default `nido`, helper `personal_finance_visible` (SECURITY DEFINER, `search_path = public`), `update_personal_visibility` (SECURITY INVOKER, self only), `create_budget` extended with `p_personal` (`member_id = auth.uid()` or NULL). SELECT policies on `expenses`, `expense_splits`, `budgets`, and `savings_balances` honor the setting. Personal budget INSERT rejects another member’s `member_id`.
- One global setting applies to personal expenses, personal budgets, and personal savings. Shared / Nido rows are unchanged. Activity stays derived. Dashboard aggregates only see RLS-authorized rows.
- UI: Presupuestos del Nido / Presupuestos personales; Perfil **Visible al Nido** / **Solo yo**.
- Unit tests 741 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 15 tables (includes `personal_finance_visible`).
- Local Docker / `supabase start` is not available in this environment, so the migration was **not** applied to a running database here. `supabase db push` against `nido_dev` was **not** run (project procedure). Remote still has the previous 14 migrations until the team applies 9.4.1–9.4.3.
- RLS matrix cases `V01`–`V22` are in `rls_security_matrix.sql` (ROLLBACK). Do not treat them as executed.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual Perfil / Presupuestos UI smoke is **BLOCKED**. This environment cannot operate the app with a real browser session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.4 (budget consumption: personal vs Nido, derived from live expenses) against the repo on 2026-08-22:

- No new migration, table, column, or RPC. Spent stays derived. `calculateBudgetConsumption()` / `budgetSpent()` run on the RLS-filtered dashboard snapshot. Amounts are **gross**; 9.4.5 will subtract refunds.
- Decision D5: a Nido budget consumes every visible expense in the same `category_id` and `America/Mexico_City` month (`deleted_at IS NULL`), including personal rows the viewer may SELECT. A personal budget consumes only that owner’s `scope = personal` expenses. Shared expenses do not consume a personal budget. Home / health formulas were not changed.
- UI: Presupuestos list and detail show budgeted, consumed, unbounded %, remaining (may be negative), and the existing progress bar.
- Unit tests 757 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 15 tables.
- Local Docker / `supabase start` is not available in this environment. `supabase` / `psql` are not on PATH. `supabase db push` was **not** run. Local still has 17 migrations; remote (`nido_dev` / `pxfdvhavcddqmhuljxlf`) still has the previous 14 until the team applies 9.4.1–9.4.3.
- RLS matrix cases `C01`–`C06` are in `rls_security_matrix.sql` (ROLLBACK). They were **not** executed. Do not treat them as a live pass.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual Presupuestos / Home UI smoke is **BLOCKED**. This environment has no browser automation. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.5 (expense refunds + frozen splits + net budget consumption) against the repo on 2026-08-22:

- New migration `20260822800000_nido_expense_refunds.sql`: `expense_refunds`, `expense_refund_splits`, `create_expense_refund` (SECURITY INVOKER), SELECT via parent expense (inherits `personal_visibility`), INSERT via `can_mutate_expense`, no UPDATE/DELETE. Refunds are immutable. `update_expense` / split rewrites are rejected while refunds exist; soft-delete of the expense is still allowed. Concurrent creates lock the expense (`SELECT … FOR UPDATE`).
- Domain: `refundableRemaining`, `validateRefundAmount`, `allocateRefundSplits` (reuses `allocateIncomeBasedSplits`), `netExpense`, `calculateBudgetConsumption` now net. Activity type `refund` is derived and opens the parent expense.
- UI: expense detail shows original / refunded / remaining / net and **Devolver dinero**. No independent refunds screen. No split editor.
- Unit tests 786 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 17 tables (adds `expense_refunds`, `expense_refund_splits`).
- Local Docker / `supabase start` is not available. `supabase` / `psql` are not on PATH. `supabase db push` was **not** run. Local still has 18 migrations; remote (`nido_dev` / `pxfdvhavcddqmhuljxlf`) still has the previous 14 until the team applies 9.4.1–9.4.5.
- RLS matrix cases `RF01`–`RF12` are in `rls_security_matrix.sql` (ROLLBACK). They were **not** executed. Do not treat them as a live pass. Prefix **RF** because **R01** is the membership-helper recursion smoke.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual Gastos / Activity / Presupuestos / Home UI smoke is **BLOCKED**. This environment has no browser automation. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.6 (derived monthly balance + derived settlements) against the repo on 2026-08-22:

- No new migration, table, column, or RPC. Balance is `calculateMonthlyBalance()` / `deriveSettlements()` on the RLS-filtered snapshot. Refunds belong to the original expense month. Personal expenses do not create inter-member debt. There is no “marcar como pagado”.
- UI: Home compact **Balance** card; **Balance** overlay with `< mes >` selector. Not a new tab. Health formula unchanged. Activity unchanged.
- Unit tests 817 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 17 tables (unchanged; no new table).
- Local Docker / `supabase start` is not available. `supabase` / `psql` are not on PATH. `supabase db push` was **not** run. No new SQL objects; remote still has the previous 14 migrations until the team applies 9.4.1–9.4.5.
- RLS matrix was **not** re-run: no policy or table change. Do not treat a static coverage pass as a live matrix pass.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual Balance / Home UI smoke is **BLOCKED**. This environment has no browser automation. Do not treat unit/build success as a UI pass. Pending cases: (1) open Balance, (2) current month, (3) previous month, (4) summary, (5) per-member balances, (6) who owes whom, (7) 50/50, (8) proportional, (9) refund, (10) personal excluded, (11) soft-deleted excluded, (12) period without movements, (13) balanced period, (14) peer, (15) private personal data, (16) multiple members.
- Verdict: **CASI CERRADA**. Implementation and unit/build checks are complete; UI smoke and the live RLS matrix remain open.

Phase 9.4.7 (pull-to-refresh) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. Pull-to-refresh calls the existing `dashboard.refresh()` / `useMonthlyBalance.refresh()` / Hogar and recurring loaders. No Realtime, polling, or second snapshot.
- Scroll root is each tab/overlay `overflow-y-auto` node, not `MainApp` (`overflow-hidden`). Gesture is touch-only, `scrollTop === 0`, 72 px threshold, one in-flight refresh. `isLoading` (first load) and `refreshing` are separate; a failed refresh keeps previous data.
- Unit tests 832 passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 17 tables (unchanged; no new table).
- Local Docker / `supabase start` is not available. `supabase` / `psql` are not on PATH. `supabase db push` was **not** run. Local still has 18 migrations; remote (`nido_dev` / `pxfdvhavcddqmhuljxlf`) still has the previous 14 until the team applies 9.4.1–9.4.5.
- RLS matrix was **not** re-run: no policy or table change.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual pull-to-refresh UI smoke is **BLOCKED**. This environment has no browser automation and no real session. Do not treat unit/build success as a UI pass. Pending cases: (A) Home refresh, (B) external change visible after pull, (C) refresh error keeps data, (D) double pull ignored, (E) mid-scroll does not refresh, (F) empty state still pullable, (G) overlay does not trap the gesture.
- Verdict: **CASI CERRADA**. Implementation and automated checks are complete; UI smoke remains open.

Phase 9.4.8 (leftover cleanup of prototype remnants) against the repo on 2026-08-22:

- No new migration, table, column, RPC, or RLS change. Cleanup only: unused prototype constants, orphaned components, unused onboarding draft fields (`freelance`, `savingsType`, `nestEmoji`), and stale nest-ready demo copy.
- Kept live catalogs (`EXP_SUGG`, `NIDO_NAMES`, `NEST_TYPES`, `QUICK_AMOUNTS`), the `c-type` step, the sessionStorage draft until finalize, and `capacity` rejection tests.
- Unit tests 832 passed, 0 failed (delta 0). One freelance-skip assertion was dropped because the leftover field no longer exists; the surrounding persist tests remain. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` 17 tables (unchanged).
- Local Docker / `supabase start` is not available. `supabase` / `psql` are not on PATH. `supabase db push` was **not** run. Local still has 18 migrations; remote (`nido_dev` / `pxfdvhavcddqmhuljxlf`) still has the previous 14 until the team applies 9.4.1–9.4.5.
- RLS matrix was **not** re-run: no policy or table change.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds.
- Manual UI smoke is **BLOCKED**. This environment has no browser automation and no real session. Do not treat unit/build success as a UI pass.
- Verdict: **CASI CERRADA**. Cleanup and automated checks are complete; UI smoke remains open.

Phase 9.4.9 (final documentation and phase closure) against the repo on 2026-08-22:

- No new migration, table, column, RPC, RLS, financial logic, or UI. Documentation only. `supabase db push` was **not** run. This session did not query or write `nido_dev`.
- Code evidence confirmed 9.4.1–9.4.8 (name/initials/categories/split, onboarding persist, personal visibility + personal budgets, derived consumption, refunds, derived monthly balance, pull-to-refresh, leftover cleanup). 9.4.9 closes the phase on paper.
- Automated validation: unit tests **832 passed, 0 failed**. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` **17 tables**.
- Local migrations **18**. Remote known state **14**. Last 9.4 SQL is `20260822800000_nido_expense_refunds.sql` (9.4.5). Migrations 15–18 remain pending `db push` — operational, not a missing implementation.
- RLS matrix exists with accumulated 9.4 cases `Y01`–`Y20`, `OB12`–`OB28`, `V01`–`V22`, `C01`–`C06`, `RF01`–`RF12` plus historical cases. **317** `record_result` calls, **299** unique ids. Runtime = **BLOCKED**: no local Postgres / Docker / `psql`; not executed against `nido_dev`. Last live pass remains the 9.3.1 run (239 assertions).
- Discrepancy (not fixed): 9.4.1 reused `Y01`–`Y12` (already goal cases) and 9.4.4 reused `C01`–`C06` (already historical-member cases). `test_id` is a primary key, so a future runtime run will fail on those collisions until the 9.4 prefixes are renamed.
- Smoke UI = **BLOCKED**. This environment has no browser session. Accumulated pending smoke: 9.4.1 (name, initials, categories, equal/proportional, shared expense uses preference); 9.4.2 (onboarding savings, estimates → budgets, custom categories, split persist, retry); 9.4.3 (visibility nido/private, personal budget, peer cannot see private); 9.4.4 (consumption 0 / partial / 100 / >100, negative remaining, personal vs Nido, soft-delete, visibility); 9.4.5 (create refund, partial/total, frozen splits, net, edit lock, Activity, privacy); 9.4.6 (current/previous month, multiple members, payer, proportional, refunds, personal excluded, soft-delete, derived settlements); 9.4.7 (pull-to-refresh, no skeleton, double gesture, error keeps snapshot); 9.4.8 (navigation after cleanup, no broken imports).
- Leftovers confirmed removed from `src/`: `CATS`, `TOT_S`, `GOALS`, `FEED`, `LIFE_EVENTS`, `EXP_CATS`, `GOAL_TYPES`, `FREQUENCIES`, `SAVE_METHODS`, `$k`, `pct`, `ComingSoon`, `FlowHeader`, `OBtn2`, `PBtn`, `showCarlos`, `ImageWithFallback`, `extract-components.mjs`. Kept: `EXP_SUGG`, `NIDO_NAMES`, `NEST_TYPES`, `QUICK_AMOUNTS`, `DEFAULT_QUICK`, `nestType`, sessionStorage draft, `capacity` rejection tests, test fixtures.
- Out of 9.4 and still absent: Google OAuth, image avatars, notifications, Realtime, insights, persistent Activity, multi-currency, receipts, email invitations, recurring budgets, push, persisted settlements / “marcar como pagado”.
- **Departamento** and **Nido Smoke 924** were not modified. No temporary users, invitations, or permanent seeds. No `service_role`.
- Verdict: **FASE 9.4 IMPLEMENTADA — PENDIENTE DE VALIDACIÓN OPERATIVA**. Do not record this as 100% verified or as “cerrada”.

Phase 9.4.10 (operational validation) against the repo + linked `nido_dev` (`pxfdvhavcddqmhuljxlf`) on 2026-08-22:

- Matrix collisions fixed: 9.4.1 cases renamed `Y01`–`Y20` → `HS01`–`HS20`; 9.4.4 cases renamed `C01`–`C06` → `BC01`–`BC06`. Goal `Y01`–`Y12` and historical-member `C01`–`C06` kept. **317** unique ids.
- Harness-only matrix fixes so the already-contracted cases can run after T26/D: restore Carlos to Nido A before HS; HS06 reads household A as table owner; HS18 uses the live current-month income basis; RF09/RF10 impersonate `authenticated` without a JWT. No product RPC, RLS, or UI change.
- `supabase db push --linked --yes` after dry-run applied exactly `20260822500000`, `20260822600000`, `20260822700000`, `20260822800000`. Local and remote now both have **18** migrations.
- RLS matrix: **317** passed, **0** failed, script ended in `ROLLBACK`. Includes `HS01`–`HS20`, `OB12`–`OB28`, `V01`–`V22`, `BC01`–`BC06`, `RF01`–`RF12`.
- Unit tests **832** passed, 0 failed. `tsc --noEmit` pass. `npm run build` pass. `validate_rls_coverage.mjs` **17 tables**.
- **Departamento** (1 member, 0 financial rows) and **Nido Smoke 924** (2 members, 5 expenses, 3 incomes, 1 budget, 4 goals) unchanged. Both received `default_split_method = equal` by column default. No leftover `*rls*` / `*example.test` auth users or matrix households.
- Manual smoke UI of 9.4.1–9.4.8 is **BLOCKED**. This environment has no browser session or automation. Do not treat RLS/build success as a UI pass. Accumulated pending smoke is unchanged from 9.4.9.
- Verdict: **FASE 9.4 IMPLEMENTADA — VALIDACIÓN OPERATIVA PARCIAL (SMOKE UI PENDIENTE)**. Do not record this as 100% verified or as “cerrada”.

Do not record production results here unless they were performed.
