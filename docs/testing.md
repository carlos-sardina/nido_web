# Manual test checklist (Phase 8.9)

Use this against a real Vercel + Supabase + SMTP environment. Automated unit tests do not replace these flows.

Confirm email stays enabled. Google OAuth stays disabled. Do not use the service-role key in the browser.

---

## A. Nuevo usuario

1. Abrir la app sin sesión → **Auth Landing** (solo Crear cuenta / Iniciar sesión).
2. Crear cuenta con email y contraseña.
3. Ver **Revisa tu correo** con el email usado. No debe aparecer un Nido.
4. Confirmar el correo.
5. Llegar a **Nido Selection** (no al dashboard, no a crear Nido automáticamente).
6. Elegir **Crear un nuevo Nido**.
7. Completar onboarding (nombre, nombre personal, ingreso, ahorros, gastos, división, invitaciones).
8. Tocar **Crear mi Nido**.
9. Ver el dashboard mock.

Refresh a mitad del onboarding no debe crear un household. Abandonar antes de **Crear mi Nido** no debe dejar un Nido en Supabase.

---

## B. Usuario existente sin Nido

1. Iniciar sesión.
2. Ver **Nido Selection**.

Incluye usuarios con membresía histórica (`left_at` distinto de null).

---

## C. Usuario existente con Nido

1. Iniciar sesión.
2. Ver el dashboard mock (MainApp).

---

## D. Invitación

1. Abrir `/join/<token>` válido.
2. Ver el nombre del Nido (sin datos financieros).
3. Crear cuenta o iniciar sesión.
4. Volver a `/join/<token>`.
5. Confirmar email si aplica.
6. Aceptar la invitación.
7. Ver el dashboard mock.

Probar también:

- token inválido
- invitación expirada
- invitación ya aceptada
- usuario que ya pertenece a otro Nido
- usuario que ya pertenece al Nido invitante

---

## E. Recovery

1. ¿Olvidaste tu contraseña?
2. Enviar el email.
3. Abrir el enlace → `/auth/callback` → `/auth/update-password`.
4. Guardar una contraseña nueva.
5. Llegar a la app (Selection o Dashboard según membresía).
6. Confirmar que la URL final no incluye access/refresh tokens.

Sin sesión, `/auth/update-password` no debe permitir cambiar la contraseña.

---

## F. Logout

1. Desde el dashboard, cerrar sesión.
2. Ver **Cerrando sesión…**
3. Llegar a **Auth Landing**.
4. No volver a Nido Selection ni al dashboard.
5. Confirmar que el Nido sigue existiendo en Supabase.

---

## G. Refresh / back

Probar refresh en:

- Auth landing
- Signup / login / confirm-email
- Nido Selection
- Cada paso del onboarding
- Invitaciones
- Join
- Dashboard

Probar browser back y forward en el onboarding. Un refresh no debe crear un Nido.

---

## H. Errores

- Fallo de red en login, signup, create household, accept invitation
- Credenciales inválidas → mensaje genérico
- Rate limit de email → mensaje amigable en español
- Email no confirmado → pedir confirmación
- Invitación inválida / expirada
- Doble tap en **Crear mi Nido** y **Aceptar invitación** (no debe duplicar writes)

Los usuarios no deben ver errores crudos de Supabase, Postgres, ni stack traces.

---

## I. Seguridad rápida

- No hay `service_role` en el frontend
- No hay tokens de auth en `localStorage`
- No hay passwords en URLs
- `?next=` rechaza URLs absolutas
- RLS sigue activa
- Confirmación de email sigue requerida
