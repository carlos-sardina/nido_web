-- =============================================================================
-- Shared mutation events
--
-- When a member edits, deletes, archives, or adjusts something the Nido
-- shares, persist that fact so every member can see it in Actividad.
-- Creates stay derived from live rows. This table is only for mutations.
--
-- Personal rows are not recorded. Shared expenses, Nido budgets, shared
-- goals and their contributions, household settings, categories, and
-- shared savings stock are.
--
-- Clients cannot write this table. Triggers insert as SECURITY DEFINER.
-- Historical members may SELECT. Destructive changes: none.
-- =============================================================================

CREATE TYPE public.household_mutation_action AS ENUM (
  'edited',
  'deleted',
  'archived',
  'adjusted'
);

CREATE TYPE public.household_mutation_entity AS ENUM (
  'expense',
  'budget',
  'goal',
  'goal_contribution',
  'category',
  'household',
  'savings'
);

CREATE TABLE public.household_mutation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  action public.household_mutation_action NOT NULL,
  entity_type public.household_mutation_entity NOT NULL,
  entity_id uuid NOT NULL,
  scope public.expense_scope NOT NULL DEFAULT 'shared',
  label text NOT NULL,
  amount numeric(12, 2),
  icon text,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_mutation_events_label_chk
    CHECK (btrim(label) <> ''),
  CONSTRAINT household_mutation_events_scope_shared_chk
    CHECK (scope = 'shared')
);

COMMENT ON TABLE public.household_mutation_events IS
  'Persisted edit / delete / archive / adjust events for shared household data. Visible to every historical member. Written only by triggers.';

COMMENT ON COLUMN public.household_mutation_events.label IS
  'Human-readable subject at the time of the mutation (expense concept, goal name, category name).';

COMMENT ON COLUMN public.household_mutation_events.detail IS
  'Optional discriminator: household name vs split_method, or extra context.';

COMMENT ON COLUMN public.household_mutation_events.amount IS
  'Amount at mutation time when the entity has one. Null for household / category settings.';

CREATE INDEX household_mutation_events_household_occurred_idx
  ON public.household_mutation_events (household_id, occurred_at DESC);

ALTER TABLE public.household_mutation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.household_mutation_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.household_mutation_events TO authenticated;
GRANT ALL ON TABLE public.household_mutation_events TO service_role;

CREATE POLICY household_mutation_events_select_members
  ON public.household_mutation_events
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- Insert helper. SECURITY DEFINER so triggers can write without granting
-- INSERT to authenticated. It does not bypass membership for reads.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_household_mutation_event(
  p_household_id uuid,
  p_actor_id uuid,
  p_action public.household_mutation_action,
  p_entity_type public.household_mutation_entity,
  p_entity_id uuid,
  p_label text,
  p_amount numeric DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
BEGIN
  IF p_household_id IS NULL OR p_actor_id IS NULL OR p_entity_id IS NULL THEN
    RETURN;
  END IF;
  IF v_label IS NULL THEN
    v_label := 'un movimiento';
  END IF;

  INSERT INTO public.household_mutation_events (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    scope,
    label,
    amount,
    icon,
    detail
  ) VALUES (
    p_household_id,
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    'shared',
    v_label,
    p_amount,
    nullif(btrim(coalesce(p_icon, '')), ''),
    nullif(btrim(coalesce(p_detail, '')), '')
  );
END;
$$;

COMMENT ON FUNCTION public.insert_household_mutation_event(
  uuid, uuid, public.household_mutation_action, public.household_mutation_entity,
  uuid, text, numeric, text, text
) IS
  'Inserts one shared mutation event. Called from AFTER UPDATE triggers. SECURITY DEFINER only to write the table; clients have no INSERT grant.';

REVOKE ALL ON FUNCTION public.insert_household_mutation_event(
  uuid, uuid, public.household_mutation_action, public.household_mutation_entity,
  uuid, text, numeric, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_household_mutation_event(
  uuid, uuid, public.household_mutation_action, public.household_mutation_entity,
  uuid, text, numeric, text, text
) TO service_role;

-- -----------------------------------------------------------------------------
-- Per-table triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_record_shared_expense_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.household_mutation_action;
  v_label text;
  v_icon text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.scope IS DISTINCT FROM 'shared' AND OLD.scope IS DISTINCT FROM 'shared' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_action := 'deleted';
  ELSIF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  ELSE
    v_action := 'edited';
  END IF;

  SELECT c.name, c.icon
  INTO v_label, v_icon
  FROM public.categories AS c
  WHERE c.id = NEW.category_id;

  v_label := coalesce(
    nullif(btrim(coalesce(NEW.description, '')), ''),
    nullif(btrim(coalesce(v_label, '')), ''),
    'un gasto'
  );

  PERFORM public.insert_household_mutation_event(
    NEW.household_id,
    v_actor,
    v_action,
    'expense',
    NEW.id,
    v_label,
    NEW.amount,
    v_icon,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_record_shared_mutation
  AFTER UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_shared_expense_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_shared_budget_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.household_mutation_action;
  v_label text;
  v_icon text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.member_id IS NOT NULL AND OLD.member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_action := 'deleted';
  ELSIF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  ELSE
    v_action := 'edited';
  END IF;

  SELECT c.name, c.icon
  INTO v_label, v_icon
  FROM public.categories AS c
  WHERE c.id = NEW.category_id;

  PERFORM public.insert_household_mutation_event(
    NEW.household_id,
    v_actor,
    v_action,
    'budget',
    NEW.id,
    coalesce(nullif(btrim(coalesce(v_label, '')), ''), 'un presupuesto'),
    NEW.amount,
    v_icon,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER budgets_record_shared_mutation
  AFTER UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_shared_budget_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_shared_goal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.household_mutation_action;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.scope IS DISTINCT FROM 'shared' AND OLD.scope IS DISTINCT FROM 'shared' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    v_action := 'archived';
  ELSIF NEW.status = 'archived' THEN
    RETURN NEW;
  ELSE
    v_action := 'edited';
  END IF;

  PERFORM public.insert_household_mutation_event(
    NEW.household_id,
    v_actor,
    v_action,
    'goal',
    NEW.id,
    coalesce(nullif(btrim(NEW.name), ''), 'una meta'),
    NEW.target_amount,
    CASE WHEN NEW.goal_type = 'purchase' THEN '🎯' ELSE '🛡️' END,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER goals_record_shared_mutation
  AFTER UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_shared_goal_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_shared_contribution_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.household_mutation_action;
  v_household_id uuid;
  v_scope public.expense_scope;
  v_goal_name text;
  v_goal_type public.goal_type;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT g.household_id, g.scope, g.name, g.goal_type
  INTO v_household_id, v_scope, v_goal_name, v_goal_type
  FROM public.goals AS g
  WHERE g.id = NEW.goal_id;

  IF v_household_id IS NULL OR v_scope IS DISTINCT FROM 'shared' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_action := 'deleted';
  ELSIF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  ELSE
    v_action := 'edited';
  END IF;

  PERFORM public.insert_household_mutation_event(
    v_household_id,
    v_actor,
    v_action,
    'goal_contribution',
    NEW.id,
    coalesce(nullif(btrim(coalesce(v_goal_name, '')), ''), 'una meta'),
    NEW.amount,
    CASE WHEN v_goal_type = 'purchase' THEN '🎯' ELSE '🛡️' END,
    NEW.goal_id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER goal_contributions_record_shared_mutation
  AFTER UPDATE ON public.goal_contributions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_shared_contribution_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_category_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.household_mutation_action;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    v_action := 'archived';
  ELSIF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  ELSIF NEW.name IS DISTINCT FROM OLD.name OR NEW.icon IS DISTINCT FROM OLD.icon THEN
    v_action := 'edited';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.insert_household_mutation_event(
    NEW.household_id,
    v_actor,
    v_action,
    'category',
    NEW.id,
    coalesce(nullif(btrim(NEW.name), ''), 'una categoría'),
    NULL,
    NEW.icon,
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_record_shared_mutation
  AFTER UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_category_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_household_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.insert_household_mutation_event(
      NEW.id,
      v_actor,
      'adjusted',
      'household',
      NEW.id,
      coalesce(nullif(btrim(NEW.name), ''), 'el Nido'),
      NULL,
      '🏠',
      'name'
    );
  END IF;

  IF NEW.default_split_method IS DISTINCT FROM OLD.default_split_method THEN
    PERFORM public.insert_household_mutation_event(
      NEW.id,
      v_actor,
      'adjusted',
      'household',
      NEW.id,
      coalesce(nullif(btrim(NEW.name), ''), 'el Nido'),
      NULL,
      '🏠',
      'split_method'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER households_record_shared_mutation
  AFTER UPDATE ON public.households
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_household_mutation();

CREATE OR REPLACE FUNCTION public.trg_record_shared_savings_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_household_mutation_event(
    NEW.household_id,
    v_actor,
    'adjusted',
    'savings',
    NEW.id,
    'ahorro compartido',
    NEW.amount,
    '🏦',
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER savings_balances_record_shared_mutation
  AFTER UPDATE ON public.savings_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_record_shared_savings_mutation();
