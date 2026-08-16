-- =============================================================================
-- Nido foundation schema
--
-- Establishes the core domain model for households (Nidos), membership,
-- categories, incomes, expenses, splits, recurrence templates, budgets,
-- and goals.
--
-- Intentionally omitted from this migration (later phases):
--   - Row Level Security policies
--   - Authentication / Supabase client wiring
--   - Seed or production data
--   - Occurrence-queue tables for recurrence confirmation
--   - Persistent balances or stored running totals
--
-- Recurrence uses next_occurrence as the only scheduling cursor.
-- "Requires review" (departed participant, invalid income_based) is derived
-- at generation time; there is no occurrence-queue or review-state column.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE public.household_role AS ENUM (
  'owner',
  'member'
);

CREATE TYPE public.category_type AS ENUM (
  'income',
  'expense'
);

CREATE TYPE public.recurrence_frequency AS ENUM (
  'weekly',
  'biweekly',
  'monthly',
  'yearly'
);

CREATE TYPE public.expense_scope AS ENUM (
  'personal',
  'shared'
);

CREATE TYPE public.distribution_method AS ENUM (
  'equal',
  'percentage',
  'fixed',
  'income_based'
);

CREATE TYPE public.budget_period AS ENUM (
  'monthly'
);

CREATE TYPE public.goal_type AS ENUM (
  'saving',
  'purchase'
);

CREATE TYPE public.goal_status AS ENUM (
  'active',
  'completed',
  'archived'
);

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Maintains updated_at on row modification.';

-- Membership and category checks run as SECURITY DEFINER so they remain
-- valid after RLS is introduced. They only assert integrity; they do not
-- grant application access.

CREATE OR REPLACE FUNCTION public.assert_active_household_member(
  p_household_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = p_user_id
      AND hm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'User % is not an active member of household %',
      p_user_id,
      p_household_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_active_household_member(uuid, uuid) IS
  'Write-time check for NEW financial/planning rows: the person must currently be an active member (left_at IS NULL). Historical members remain valid owners of existing rows; queries are not filtered by this function.';

CREATE OR REPLACE FUNCTION public.assert_category_in_household(
  p_household_id uuid,
  p_category_id uuid,
  p_expected_type public.category_type DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_type public.category_type;
BEGIN
  SELECT household_id, type
  INTO v_household_id, v_type
  FROM public.categories
  WHERE id = p_category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category % does not exist', p_category_id
      USING ERRCODE = '23503';
  END IF;

  IF v_household_id <> p_household_id THEN
    RAISE EXCEPTION
      'Category % does not belong to household %',
      p_category_id,
      p_household_id
      USING ERRCODE = '23514';
  END IF;

  IF p_expected_type IS NOT NULL AND v_type <> p_expected_type THEN
    RAISE EXCEPTION
      'Category % has type %; expected %',
      p_category_id,
      v_type,
      p_expected_type
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_recurring_income_origin(
  p_household_id uuid,
  p_member_id uuid,
  p_recurring_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_member_id uuid;
BEGIN
  IF p_recurring_id IS NULL THEN
    RETURN;
  END IF;

  SELECT household_id, member_id
  INTO v_household_id, v_member_id
  FROM public.recurring_incomes
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring income % does not exist', p_recurring_id
      USING ERRCODE = '23503';
  END IF;

  IF v_household_id <> p_household_id THEN
    RAISE EXCEPTION
      'Recurring income % does not belong to household %',
      p_recurring_id,
      p_household_id
      USING ERRCODE = '23514';
  END IF;

  IF v_member_id <> p_member_id THEN
    RAISE EXCEPTION
      'Recurring income % does not belong to member %',
      p_recurring_id,
      p_member_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_recurring_income_origin(uuid, uuid, uuid) IS
  'A confirmed income may reference a recurring rule only when both share household and member.';

CREATE OR REPLACE FUNCTION public.assert_recurring_expense_origin(
  p_household_id uuid,
  p_recurring_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  IF p_recurring_id IS NULL THEN
    RETURN;
  END IF;

  SELECT household_id
  INTO v_household_id
  FROM public.recurring_expenses
  WHERE id = p_recurring_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring expense % does not exist', p_recurring_id
      USING ERRCODE = '23503';
  END IF;

  IF v_household_id <> p_household_id THEN
    RAISE EXCEPTION
      'Recurring expense % does not belong to household %',
      p_recurring_id,
      p_household_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_recurring_expense_origin(uuid, uuid) IS
  'A confirmed expense may reference a recurring rule only when both share the same household.';

-- -----------------------------------------------------------------------------
-- AUTH / USER
-- -----------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Application profile for a Supabase auth user. One profile per auth.users row.';

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'User'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- NIDO
-- -----------------------------------------------------------------------------

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT households_name_not_blank CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.households IS
  'A Nido: a household or shared-finance group. Membership size is not capped. Currency is implicit (one household currency); multi-currency is out of scope for this version.';

CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  role public.household_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_members_left_at_after_joined
    CHECK (left_at IS NULL OR left_at >= joined_at)
);

COMMENT ON TABLE public.household_members IS
  'Membership history for a Nido. Leaving sets left_at; rows are retained. At least one owner is an application/service rule, not a trigger.';

COMMENT ON COLUMN public.household_members.left_at IS
  'NULL means the membership is active. A user may have only one active membership. Historical rows (left_at IS NOT NULL) remain valid owners of past financial records.';

CREATE UNIQUE INDEX household_members_one_active_membership_idx
  ON public.household_members (user_id)
  WHERE left_at IS NULL;

CREATE INDEX household_members_user_id_idx
  ON public.household_members (user_id);

CREATE INDEX household_members_household_id_idx
  ON public.household_members (household_id);

CREATE INDEX household_members_active_household_user_idx
  ON public.household_members (household_id, user_id)
  WHERE left_at IS NULL;

CREATE TABLE public.household_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  email text,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_invitations_token_key UNIQUE (token),
  CONSTRAINT household_invitations_email_not_blank
    CHECK (email IS NULL OR length(trim(email)) > 0)
);

COMMENT ON TABLE public.household_invitations IS
  'Invite-by-email or token/QR. Acceptance creates a household_members row in application logic.';

CREATE INDEX household_invitations_household_id_idx
  ON public.household_invitations (household_id);

CREATE UNIQUE INDEX household_invitations_pending_email_idx
  ON public.household_invitations (household_id, lower(email))
  WHERE email IS NOT NULL AND accepted_at IS NULL;

-- -----------------------------------------------------------------------------
-- CONFIGURATION
-- -----------------------------------------------------------------------------

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  type public.category_type NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT categories_name_not_blank CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.categories IS
  'Household-scoped income or expense categories. Archive instead of deleting.';

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX categories_household_id_idx
  ON public.categories (household_id);

CREATE UNIQUE INDEX categories_active_name_type_idx
  ON public.categories (household_id, lower(name), type)
  WHERE archived_at IS NULL;

-- -----------------------------------------------------------------------------
-- INCOME
-- -----------------------------------------------------------------------------

CREATE TABLE public.recurring_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  description text,
  frequency public.recurrence_frequency NOT NULL,
  day_of_month smallint,
  start_date date NOT NULL,
  end_date date,
  next_occurrence date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_incomes_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT recurring_incomes_day_of_month_range
    CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  CONSTRAINT recurring_incomes_end_date_after_start
    CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.recurring_incomes IS
  'Income templates/rules. They do not become incomes until an occurrence is confirmed. Deactivate with is_active = false; do not hard-delete in normal operation.';

COMMENT ON COLUMN public.recurring_incomes.amount IS
  'Active recurring income amounts are the default basis for income-based expense splits. One-time incomes are excluded.';

COMMENT ON COLUMN public.recurring_incomes.is_active IS
  'Soft-deactivate / archive strategy for the rule. Hard-delete SET NULLs incomes.recurring_id and should be avoided.';

COMMENT ON COLUMN public.recurring_incomes.next_occurrence IS
  'Scheduling cursor only. Confirm, edit, or skip is application work; there is no occurrence table.';

CREATE TRIGGER recurring_incomes_set_updated_at
  BEFORE UPDATE ON public.recurring_incomes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX recurring_incomes_household_id_idx
  ON public.recurring_incomes (household_id);

CREATE INDEX recurring_incomes_member_id_idx
  ON public.recurring_incomes (member_id);

CREATE INDEX recurring_incomes_active_member_idx
  ON public.recurring_incomes (household_id, member_id)
  WHERE is_active;

CREATE INDEX recurring_incomes_active_next_occurrence_idx
  ON public.recurring_incomes (household_id, next_occurrence)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.trg_recurring_incomes_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.member_id);
  PERFORM public.assert_category_in_household(
    NEW.household_id,
    NEW.category_id,
    'income'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_incomes_integrity
  BEFORE INSERT OR UPDATE ON public.recurring_incomes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_incomes_integrity();

CREATE TABLE public.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  description text,
  occurred_at date NOT NULL,
  recurring_id uuid REFERENCES public.recurring_incomes (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT incomes_amount_non_negative CHECK (amount >= 0)
);

COMMENT ON TABLE public.incomes IS
  'Confirmed income transactions belonging to an individual member. Soft-delete via deleted_at. One-time rows have recurring_id NULL.';

CREATE TRIGGER incomes_set_updated_at
  BEFORE UPDATE ON public.incomes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX incomes_household_occurred_at_idx
  ON public.incomes (household_id, occurred_at);

CREATE INDEX incomes_member_id_idx
  ON public.incomes (member_id);

CREATE INDEX incomes_recurring_id_idx
  ON public.incomes (recurring_id);

CREATE OR REPLACE FUNCTION public.trg_incomes_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.recurring_id IS NOT DISTINCT FROM OLD.recurring_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.member_id);
  PERFORM public.assert_category_in_household(
    NEW.household_id,
    NEW.category_id,
    'income'
  );
  PERFORM public.assert_recurring_income_origin(
    NEW.household_id,
    NEW.member_id,
    NEW.recurring_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER incomes_integrity
  BEFORE INSERT OR UPDATE ON public.incomes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_incomes_integrity();

-- -----------------------------------------------------------------------------
-- EXPENSE
-- -----------------------------------------------------------------------------

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  description text,
  payer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  scope public.expense_scope NOT NULL,
  distribution_method public.distribution_method NOT NULL,
  frequency public.recurrence_frequency NOT NULL,
  start_date date NOT NULL,
  end_date date,
  next_occurrence date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expenses_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT recurring_expenses_end_date_after_start
    CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.recurring_expenses IS
  'Expense templates/rules. They do not become expenses until an occurrence is confirmed. Deactivate with is_active = false; do not hard-delete in normal operation.';

COMMENT ON COLUMN public.recurring_expenses.payer_id IS
  'Default payer for generated expenses. Independent from participants in recurring_expense_splits.';

COMMENT ON COLUMN public.recurring_expenses.distribution_method IS
  'How upcoming occurrences should allocate shares. income_based is recalculated from current active recurring incomes at generation time; values on recurring_expense_splits are not frozen.';

COMMENT ON COLUMN public.recurring_expenses.next_occurrence IS
  'Scheduling cursor only. If a listed participant or payer is no longer an active member, or income_based is invalid, the application must require review before confirm. No occurrence table.';

COMMENT ON COLUMN public.recurring_expenses.is_active IS
  'Soft-deactivate / archive strategy for the rule. Hard-delete SET NULLs expenses.recurring_id and should be avoided.';

CREATE TRIGGER recurring_expenses_set_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX recurring_expenses_household_id_idx
  ON public.recurring_expenses (household_id);

CREATE INDEX recurring_expenses_payer_id_idx
  ON public.recurring_expenses (payer_id);

CREATE INDEX recurring_expenses_active_next_occurrence_idx
  ON public.recurring_expenses (household_id, next_occurrence)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.trg_recurring_expenses_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.payer_id IS NOT DISTINCT FROM OLD.payer_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.payer_id);
  PERFORM public.assert_category_in_household(
    NEW.household_id,
    NEW.category_id,
    'expense'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_expenses_integrity
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_expenses_integrity();

CREATE TABLE public.recurring_expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id uuid NOT NULL
    REFERENCES public.recurring_expenses (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  percentage numeric(7, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_splits_unique_participant
    UNIQUE (recurring_expense_id, member_id),
  CONSTRAINT recurring_expense_splits_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT recurring_expense_splits_percentage_range
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

COMMENT ON TABLE public.recurring_expense_splits IS
  'Default participants for a recurring expense rule. For equal and income_based, amount/percentage are not authoritative; they are recalculated when each occurrence is generated. Do not auto-remove a participant who has left — the upcoming occurrence requires review.';

CREATE TRIGGER recurring_expense_splits_set_updated_at
  BEFORE UPDATE ON public.recurring_expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX recurring_expense_splits_recurring_expense_id_idx
  ON public.recurring_expense_splits (recurring_expense_id);

CREATE INDEX recurring_expense_splits_member_id_idx
  ON public.recurring_expense_splits (member_id);

CREATE OR REPLACE FUNCTION public.trg_recurring_expense_splits_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.recurring_expense_id IS NOT DISTINCT FROM OLD.recurring_expense_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id THEN
    RETURN NEW;
  END IF;

  SELECT household_id
  INTO v_household_id
  FROM public.recurring_expenses
  WHERE id = NEW.recurring_expense_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Recurring expense % does not exist', NEW.recurring_expense_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM public.assert_active_household_member(v_household_id, NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_expense_splits_integrity
  BEFORE INSERT OR UPDATE ON public.recurring_expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_expense_splits_integrity();

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  description text,
  occurred_at date NOT NULL,
  payer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  scope public.expense_scope NOT NULL,
  distribution_method public.distribution_method NOT NULL,
  recurring_id uuid REFERENCES public.recurring_expenses (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT expenses_amount_non_negative CHECK (amount >= 0)
);

COMMENT ON TABLE public.expenses IS
  'Confirmed expense transactions. Soft-delete via deleted_at. Balances are derived from these rows and their splits. Personal and shared use this same table.';

COMMENT ON COLUMN public.expenses.payer_id IS
  'The member who paid. May differ from the participating members in expense_splits.';

COMMENT ON COLUMN public.expenses.scope IS
  'personal = exactly one participant at 100% (application transaction rule); shared = selected participants, not necessarily the whole Nido.';

COMMENT ON COLUMN public.expenses.distribution_method IS
  'How the stored expense_splits were computed. Confirmed splits are historical and are not recalculated when income later changes.';

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX expenses_household_occurred_at_idx
  ON public.expenses (household_id, occurred_at);

CREATE INDEX expenses_payer_id_idx
  ON public.expenses (payer_id);

CREATE INDEX expenses_recurring_id_idx
  ON public.expenses (recurring_id);

CREATE OR REPLACE FUNCTION public.trg_expenses_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.payer_id IS NOT DISTINCT FROM OLD.payer_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.recurring_id IS NOT DISTINCT FROM OLD.recurring_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.payer_id);
  PERFORM public.assert_category_in_household(
    NEW.household_id,
    NEW.category_id,
    'expense'
  );
  PERFORM public.assert_recurring_expense_origin(
    NEW.household_id,
    NEW.recurring_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_integrity
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_expenses_integrity();

CREATE TABLE public.expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  percentage numeric(7, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_splits_unique_participant UNIQUE (expense_id, member_id),
  CONSTRAINT expense_splits_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT expense_splits_percentage_range
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

COMMENT ON TABLE public.expense_splits IS
  'Final allocation of an expense. Payer is not required to appear here. For a confirmed expense, SUM(amount) must equal expenses.amount (application transaction). Do not add a row-level trigger that blocks incremental inserts.';

CREATE TRIGGER expense_splits_set_updated_at
  BEFORE UPDATE ON public.expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX expense_splits_expense_id_idx
  ON public.expense_splits (expense_id);

CREATE INDEX expense_splits_member_id_idx
  ON public.expense_splits (member_id);

CREATE OR REPLACE FUNCTION public.trg_expense_splits_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.expense_id IS NOT DISTINCT FROM OLD.expense_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id THEN
    RETURN NEW;
  END IF;

  SELECT household_id
  INTO v_household_id
  FROM public.expenses
  WHERE id = NEW.expense_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Expense % does not exist', NEW.expense_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM public.assert_active_household_member(v_household_id, NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER expense_splits_integrity
  BEFORE INSERT OR UPDATE ON public.expense_splits
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_expense_splits_integrity();

-- -----------------------------------------------------------------------------
-- PLANNING
-- -----------------------------------------------------------------------------

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  period public.budget_period NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budgets_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT budgets_end_date_after_start CHECK (end_date >= start_date),
  CONSTRAINT budgets_unique_scope
    UNIQUE NULLS NOT DISTINCT (household_id, category_id, member_id, start_date)
);

COMMENT ON TABLE public.budgets IS
  'Planning targets, not spending restrictions. member_id NULL = Nido-level; otherwise personal. There is no current_spent column; spent is derived from expenses.';

COMMENT ON COLUMN public.budgets.member_id IS
  'NULL means a shared/Nido budget. Non-null means a personal budget for that member.';

CREATE TRIGGER budgets_set_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX budgets_household_start_date_idx
  ON public.budgets (household_id, start_date);

CREATE INDEX budgets_member_start_date_idx
  ON public.budgets (member_id, start_date);

CREATE OR REPLACE FUNCTION public.trg_budgets_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.household_id IS NOT DISTINCT FROM OLD.household_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
    RETURN NEW;
  END IF;

  IF NEW.member_id IS NOT NULL THEN
    PERFORM public.assert_active_household_member(NEW.household_id, NEW.member_id);
  END IF;

  PERFORM public.assert_category_in_household(NEW.household_id, NEW.category_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER budgets_integrity
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_budgets_integrity();

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  goal_type public.goal_type NOT NULL,
  target_amount numeric(12, 2) NOT NULL,
  target_date date,
  status public.goal_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goals_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT goals_target_amount_positive CHECK (target_amount > 0)
);

COMMENT ON TABLE public.goals IS
  'Nido-level saving or purchase goals. Current amount is SUM(goal_contributions.amount); it is not stored. Archive via status; do not hard-delete goals that have contributions.';

CREATE TRIGGER goals_set_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX goals_household_id_idx
  ON public.goals (household_id);

CREATE TABLE public.goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  contributed_at date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_contributions_amount_non_negative CHECK (amount >= 0)
);

COMMENT ON TABLE public.goal_contributions IS
  'Individual contributions toward a Nido goal. Multiple contributions per member are allowed. Leaving a Nido does not delete these rows.';

CREATE INDEX goal_contributions_goal_id_idx
  ON public.goal_contributions (goal_id);

CREATE INDEX goal_contributions_member_id_idx
  ON public.goal_contributions (member_id);

CREATE OR REPLACE FUNCTION public.trg_goal_contributions_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.goal_id IS NOT DISTINCT FROM OLD.goal_id
     AND NEW.member_id IS NOT DISTINCT FROM OLD.member_id THEN
    RETURN NEW;
  END IF;

  SELECT household_id
  INTO v_household_id
  FROM public.goals
  WHERE id = NEW.goal_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Goal % does not exist', NEW.goal_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM public.assert_active_household_member(v_household_id, NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER goal_contributions_integrity
  BEFORE INSERT OR UPDATE ON public.goal_contributions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_goal_contributions_integrity();
