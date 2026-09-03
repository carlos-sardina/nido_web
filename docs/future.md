# Futuro y fuera de alcance

This document is the inventory of features that are **not** in the current product and **not** in phase 9.4.

Do not treat anything listed here as “pending 9.4”, leftover work, or an implied next ticket. Phase 9.4 scope lives in [phase-9.4.md](./phase-9.4.md).

---

## Futuro

These may be considered in a later phase. They have no schema, RPC, UI, or documentation obligation in 9.4.

| Feature | Notes |
| --- | --- |
| **Google OAuth** | Email and password remain the only auth method. Do not add a Google button, provider, or callback. |
| **Avatar con imagen** | Identity is initials only. Do not add Storage, upload, or crop. `profiles.avatar_url` may stay unused. |
| **Notificaciones** | No in-app notification center, no email notifications, no notification table. |
| **Supabase Realtime** | No channel subscriptions. Live data is read on navigation, after mutations, and (in 9.4) via manual refresh. |
| **Insights / análisis financieros** | No dedicated insights product. Existing derived “Salud financiera” on Home stays as it is; do not expand it into an analysis suite. |
| **Activity persistente (creates)** | Create events stay derived. Shared **edits / deletes / adjustments** now persist in `household_mutation_events` and appear in Actividad. Do not add a general notification center or a full before/after audit payload. |
| **Multi-moneda** | One implicit household currency. No `currency` column, no FX. |
| **Receipts / comprobantes** | No attachments, Storage, or receipt UI. |

---

## Fuera de alcance actual

These are closed product decisions. Do not reopen them in 9.4 or in a later “cleanup” that quietly reintroduces them.

| Feature | Notes |
| --- | --- |
| **Invitaciones por email** | Nido does not support email invitations. The only invite path is bearer token → link → QR → Web Share. Do not add SMTP, Brevo, Resend, SendGrid, Nodemailer, an Edge Function, an API route, or a Server Action for email. `household_invitations.email` is historical and unused; new rows insert `null`. |
| **Presupuestos recurrentes** | Budgets are monthly rows. Do not add recurring-budget tables or RPCs. Recurring **income** templates already exist and are unrelated. |
| **Gastos recurrentes (plantillas)** | Removed from the product. Repeating monthly spend is **Copiar del mes pasado** (budgets) plus registering confirmed expenses. Do **not** put `recurring_expenses` back into the dashboard snapshot or any metric (spent, health, budgets, activity, balance, `hasAnyFinancialData`). Leftover table/RPC rows are historical only. Confirmed `expenses` with `recurring_id` still count. Recurring **incomes** stay. |
| **Push notifications** | Distinct from a future in-app notification center. No device tokens, no web-push, no FCM/APNs. |

---

## Explicitly not leftover

The following used to appear in “what remains” lists. They are **not** pending 9.4 work:

- Google OAuth
- Realtime
- Notifications / push
- Persistent activity feed
- Email invitations
- Recurring budgets
- Recurring expense templates (metrics must ignore leftover `recurring_expenses` rows)
- Image avatars
- Multi-currency
- Receipts
- Insights / analysis suite
