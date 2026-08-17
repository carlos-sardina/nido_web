# Design system — Auth & Onboarding

Tokens and primitives introduced in Phase 8.11 so Auth, Onboarding, and later the dashboard share one visual language.

## Fonts

- **Figtree** (`font-sans`) — UI: body, labels, buttons, inputs, messages, navigation.
- **Fraunces** (`font-display`) — branding and editorial/emotional titles (landing, screen headings, “Dale nombre a tu Nido”). Not used for forms, data, or actions.

## Typography scale

| Token | Size | Use |
| --- | --- | --- |
| `text-display` | 44px / 2.75rem | Landing hero (“Bienvenido”) |
| `text-h1` | 32px / 2rem | Screen titles |
| `text-h2` | 24px / 1.5rem | Nested titles |
| `text-h3` | 20px / 1.25rem | Modal titles |
| `text-body` | 16px / 1rem | Inputs and primary copy |
| `text-body-sm` | 14px / 0.875rem | Supporting text |
| `text-label` | 13px / 0.8125rem | Field labels, card titles |
| `text-caption` | 12px / 0.75rem | Helper text, errors, legal |

Components: `Heading`, `Text` in `src/components/nido/`.

## Spacing (4px grid)

Use Tailwind spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48.

| Role | Token |
| --- | --- |
| Label → input | `mb-2` (8px) |
| Fields | `space-y-4` (16px) |
| Title → description | `mt-2` (8px) |
| Intro → content | `mb-6` / `mb-8` (24–32px) |
| Content → CTA | `mt-8` (32px) |
| Card / button padding | `p-4` / `px-6` |
| Screen gutter | `px-6` (24px) |
| Back control | `mb-4` (16px) |

## Layout

Shared shell: `FlowScreen`.

- Background: cream card (`bg-card`)
- Max width: `max-w-md` (28rem), centered
- Min height: `min-h-dvh`
- Structure: back → heading + supporting text → content → primary action → secondary/text actions

## Buttons

`Button` in `src/components/nido/Button.tsx`. Height 56px (`h-14`), `rounded-2xl`, Figtree semibold 14px.

| Variant | Use |
| --- | --- |
| `primary` | Main action (Crear cuenta, Continuar, Crear mi Nido) |
| `secondary` | Alternate action (Iniciar sesión on landing) |
| `ghost` | Cancel / close in nested surfaces |
| `compact` size | 44px, only inside nested forms |

Tertiary actions use `TextLink` (brand or muted), not a fourth button style.

Hover, active scale, disabled, loading (`aria-busy`), and `focus-visible` ring are built in.

## Inputs

`TextInput` / `MoneyField`: height 56px, `rounded-2xl`, 16px type, 2px border.

- Rest: muted border
- Filled / focus: primary border + ring
- Error: danger border + caption message (`role="alert"`)
- Labels associated with `htmlFor` / `id`

## Radius

16px (`rounded-2xl`) for buttons, fields, and cards.

## Color

Existing palette in `theme.css` / `src/lib/palette.ts`. Added `--danger` (`#B94040`) for errors, distinct from terracotta `--destructive`.
