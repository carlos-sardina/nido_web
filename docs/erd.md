# Nido entity-relationship diagram

This diagram matches the foundation schema in `supabase/migrations/20260816000000_nido_foundation_schema.sql`.

`auth.users` is shown as `auth_users`. It already exists in Supabase and is not created by the migration.

```mermaid
erDiagram
    auth_users ||--|| profiles : "id"

    profiles ||--o{ households : "created_by"
    profiles ||--o{ household_members : "user_id"
    profiles ||--o{ household_invitations : "invited_by"
    profiles ||--o{ categories : "created_by"
    profiles ||--o{ recurring_incomes : "member_id"
    profiles ||--o{ recurring_incomes : "created_by"
    profiles ||--o{ incomes : "member_id"
    profiles ||--o{ incomes : "created_by"
    profiles ||--o{ recurring_expenses : "payer_id"
    profiles ||--o{ recurring_expenses : "created_by"
    profiles ||--o{ recurring_expense_splits : "member_id"
    profiles ||--o{ expenses : "payer_id"
    profiles ||--o{ expenses : "created_by"
    profiles ||--o{ expense_splits : "member_id"
    profiles ||--o{ budgets : "member_id"
    profiles ||--o{ budgets : "created_by"
    profiles ||--o{ goals : "created_by"
    profiles ||--o{ goal_contributions : "member_id"
    profiles ||--o{ goal_contributions : "created_by"

    households ||--o{ household_members : "has"
    households ||--o{ household_invitations : "has"
    households ||--o{ categories : "has"
    households ||--o{ recurring_incomes : "has"
    households ||--o{ incomes : "has"
    households ||--o{ recurring_expenses : "has"
    households ||--o{ expenses : "has"
    households ||--o{ budgets : "has"
    households ||--o{ goals : "has"

    categories ||--o{ recurring_incomes : "classifies"
    categories ||--o{ incomes : "classifies"
    categories ||--o{ recurring_expenses : "classifies"
    categories ||--o{ expenses : "classifies"
    categories ||--o{ budgets : "classifies"

    recurring_incomes ||--o{ incomes : "originates"
    recurring_expenses ||--o{ expenses : "originates"
    recurring_expenses ||--o{ recurring_expense_splits : "plans"
    expenses ||--o{ expense_splits : "splits"
    goals ||--o{ goal_contributions : "receives"

    auth_users {
        uuid id PK
    }

    profiles {
        uuid id PK
        text display_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    households {
        uuid id PK
        text name
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    household_members {
        uuid id PK
        uuid household_id FK
        uuid user_id FK
        household_role role
        timestamptz joined_at
        timestamptz left_at
        timestamptz created_at
    }

    household_invitations {
        uuid id PK
        uuid household_id FK
        uuid invited_by FK
        text email
        text token UK
        timestamptz expires_at
        timestamptz accepted_at
        timestamptz created_at
    }

    categories {
        uuid id PK
        uuid household_id FK
        text name
        text icon
        category_type type
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz archived_at
    }

    recurring_incomes {
        uuid id PK
        uuid household_id FK
        uuid member_id FK
        uuid category_id FK
        numeric amount
        text description
        recurrence_frequency frequency
        smallint day_of_month
        date start_date
        date end_date
        date next_occurrence
        boolean is_active
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    incomes {
        uuid id PK
        uuid household_id FK
        uuid member_id FK
        uuid category_id FK
        numeric amount
        text description
        date occurred_at
        uuid recurring_id FK
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    recurring_expenses {
        uuid id PK
        uuid household_id FK
        uuid category_id FK
        numeric amount
        text description
        uuid payer_id FK
        expense_scope scope
        distribution_method distribution_method
        recurrence_frequency frequency
        date start_date
        date end_date
        date next_occurrence
        boolean is_active
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    recurring_expense_splits {
        uuid id PK
        uuid recurring_expense_id FK
        uuid member_id FK
        numeric amount
        numeric percentage
        timestamptz created_at
        timestamptz updated_at
    }

    expenses {
        uuid id PK
        uuid household_id FK
        uuid category_id FK
        numeric amount
        text description
        date occurred_at
        uuid payer_id FK
        expense_scope scope
        distribution_method distribution_method
        uuid recurring_id FK
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    expense_splits {
        uuid id PK
        uuid expense_id FK
        uuid member_id FK
        numeric amount
        numeric percentage
        timestamptz created_at
        timestamptz updated_at
    }

    budgets {
        uuid id PK
        uuid household_id FK
        uuid member_id FK
        uuid category_id FK
        numeric amount
        budget_period period
        date start_date
        date end_date
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    goals {
        uuid id PK
        uuid household_id FK
        text name
        text description
        goal_type goal_type
        numeric target_amount
        date target_date
        goal_status status
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    goal_contributions {
        uuid id PK
        uuid goal_id FK
        uuid member_id FK
        numeric amount
        date contributed_at
        uuid created_by FK
        timestamptz created_at
    }
```

## Relationship notes

- A user has at most one **active** household membership (`left_at IS NULL`). Historical memberships are many. Financial FKs point at `profiles`, not at `household_members`, so leaving does not delete history.
- `member_id` / `payer_id` + `household_id` keep a transaction in its original Nido after the person joins another Nido.
- `budgets.member_id` is optional: null is a Nido-level budget.
- `incomes.recurring_id` and `expenses.recurring_id` are optional. When set, the rule must belong to the same household (and the same member for income). Confirmed transactions can exist without a template.
- Recurring rules are templates. `next_occurrence` is the only scheduling cursor. There is no occurrence table.
- `expense_splits` and `recurring_expense_splits` list participants only. The payer is stored on the parent expense / rule and does not have to appear in the split set.
- Personal and shared expenses use the same `expenses` + `expense_splits` model.
- For `income_based` recurring expenses, shares are recalculated at generation time. Confirmed `expense_splits` are historical and are not recalculated when income changes.
- There is no `balances` table. There is no `current_amount` on goals and no `current_spent` on budgets.
- There is no `currency` column. One implicit household currency for this version.
