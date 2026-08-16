-- =============================================================================
-- Nido Row Level Security
--
-- Authorization is based on household_members, not on the current frontend.
--
-- ACTIVE membership:  household_members.user_id = auth.uid() AND left_at IS NULL
-- HISTORICAL membership: any household_members row for auth.uid()
--
-- READ:  historical membership is enough
-- WRITE: active membership is required
--
-- Membership helpers are SECURITY DEFINER so policies can consult
-- household_members without RLS recursion. They only read membership
-- (and parent household keys). They do not write and do not bypass
-- membership checks for the caller.
--
-- Invitation accept, leave, join, and owner transfer remain
-- application/service operations (service_role). This migration does
-- not grant clients general membership write access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_household_member(uuid) IS
  'True when auth.uid() has any membership in the household, including left_at IS NOT NULL. SECURITY DEFINER avoids household_members RLS recursion. Reads only; search_path is pinned to public.';

CREATE OR REPLACE FUNCTION public.is_active_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = auth.uid()
      AND hm.left_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_active_household_member(uuid) IS
  'True when auth.uid() currently belongs to the household (left_at IS NULL). Required for writes. SECURITY DEFINER avoids RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_household_owner(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = auth.uid()
      AND hm.role = 'owner'
      AND hm.left_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_household_owner(uuid) IS
  'True when auth.uid() is an active owner of the household. SECURITY DEFINER avoids RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_active_member_of(
  p_household_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = p_user_id
      AND hm.left_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_active_member_of(uuid, uuid) IS
  'True when p_user_id is an active member of p_household_id. Used in INSERT WITH CHECK so member_id/payer_id cannot point at another household. SECURITY DEFINER reads membership only.';

CREATE OR REPLACE FUNCTION public.shares_household_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.household_members AS me
    INNER JOIN public.household_members AS them
      ON them.household_id = me.household_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.shares_household_with(uuid) IS
  'True when auth.uid() and p_user_id have ever belonged to the same household. Used to limit profile visibility. SECURITY DEFINER avoids household_members RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_household_created_by_current_user(
  p_household_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.households AS h
    WHERE h.id = p_household_id
      AND h.created_by = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_household_created_by_current_user(uuid) IS
  'True when auth.uid() created the household. SECURITY DEFINER is required so the creator can insert the first owner row before they are a member (households SELECT is membership-gated).';

CREATE OR REPLACE FUNCTION public.household_has_no_members(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.household_members AS hm
    WHERE hm.household_id = p_household_id
  );
$$;

COMMENT ON FUNCTION public.household_has_no_members(uuid) IS
  'True when the household has no membership rows. Limits the client bootstrap INSERT to the first owner. SECURITY DEFINER reads household_members without recursion.';

CREATE OR REPLACE FUNCTION public.category_belongs_to_household(
  p_category_id uuid,
  p_household_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.categories AS c
    WHERE c.id = p_category_id
      AND c.household_id = p_household_id
  );
$$;

COMMENT ON FUNCTION public.category_belongs_to_household(uuid, uuid) IS
  'True when the category belongs to the given household. Defense in depth for INSERT/UPDATE WITH CHECK. SECURITY DEFINER reads categories without nested RLS.';

CREATE OR REPLACE FUNCTION public.household_id_for_expense(p_expense_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.household_id
  FROM public.expenses AS e
  WHERE e.id = p_expense_id;
$$;

COMMENT ON FUNCTION public.household_id_for_expense(uuid) IS
  'Resolves an expense''s household without denormalizing household_id onto expense_splits. SECURITY DEFINER avoids nested expenses RLS.';

CREATE OR REPLACE FUNCTION public.household_id_for_recurring_expense(
  p_recurring_expense_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT re.household_id
  FROM public.recurring_expenses AS re
  WHERE re.id = p_recurring_expense_id;
$$;

COMMENT ON FUNCTION public.household_id_for_recurring_expense(uuid) IS
  'Resolves a recurring expense''s household without denormalizing household_id onto recurring_expense_splits. SECURITY DEFINER avoids nested RLS.';

CREATE OR REPLACE FUNCTION public.household_id_for_goal(p_goal_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.household_id
  FROM public.goals AS g
  WHERE g.id = p_goal_id;
$$;

COMMENT ON FUNCTION public.household_id_for_goal(uuid) IS
  'Resolves a goal''s household without denormalizing household_id onto goal_contributions. SECURITY DEFINER avoids nested RLS.';

REVOKE ALL ON FUNCTION public.is_household_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_household_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_household_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_member_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_household_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_household_created_by_current_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_has_no_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_belongs_to_household(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_id_for_expense(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_id_for_recurring_expense(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_id_for_goal(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_household_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_member_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_household_with(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_household_created_by_current_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.household_has_no_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.category_belongs_to_household(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.household_id_for_expense(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.household_id_for_recurring_expense(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.household_id_for_goal(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Table privileges
-- Privilege + RLS together. Missing GRANT or missing policy both deny.
-- Physical DELETE is granted only where an explicit DELETE policy exists.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.households FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.household_members FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.household_invitations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.categories FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.recurring_incomes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.incomes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.recurring_expenses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.recurring_expense_splits FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.expenses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.expense_splits FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.budgets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.goals FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.goal_contributions FROM PUBLIC, anon;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.households TO authenticated;
GRANT SELECT, INSERT ON TABLE public.household_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.household_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.recurring_incomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.incomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.recurring_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_expense_splits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expense_splits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.budgets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goal_contributions TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.households TO service_role;
GRANT ALL ON TABLE public.household_members TO service_role;
GRANT ALL ON TABLE public.household_invitations TO service_role;
GRANT ALL ON TABLE public.categories TO service_role;
GRANT ALL ON TABLE public.recurring_incomes TO service_role;
GRANT ALL ON TABLE public.incomes TO service_role;
GRANT ALL ON TABLE public.recurring_expenses TO service_role;
GRANT ALL ON TABLE public.recurring_expense_splits TO service_role;
GRANT ALL ON TABLE public.expenses TO service_role;
GRANT ALL ON TABLE public.expense_splits TO service_role;
GRANT ALL ON TABLE public.budgets TO service_role;
GRANT ALL ON TABLE public.goals TO service_role;
GRANT ALL ON TABLE public.goal_contributions TO service_role;

-- -----------------------------------------------------------------------------
-- Enable RLS on every application table
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- profiles
-- Insert is performed by handle_new_user() (SECURITY DEFINER).
-- No client INSERT or DELETE policy.
-- -----------------------------------------------------------------------------

CREATE POLICY profiles_select_self_or_household_peers
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.shares_household_with(id));

CREATE POLICY profiles_update_self
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- households
-- SELECT: any membership, including historical.
-- INSERT: authenticated user; created_by must be the caller.
-- UPDATE: active members (name and similar household data).
-- DELETE: active owners only. Not a supported product path.
-- -----------------------------------------------------------------------------

CREATE POLICY households_select_members
  ON public.households
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(id)
    OR created_by = auth.uid()
  );

CREATE POLICY households_insert_own
  ON public.households
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY households_update_active_members
  ON public.households
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(id))
  WITH CHECK (public.is_active_household_member(id));

CREATE POLICY households_delete_owners
  ON public.households
  FOR DELETE
  TO authenticated
  USING (public.is_household_owner(id));

-- -----------------------------------------------------------------------------
-- household_members
-- SELECT: membership records of households the caller has ever joined.
-- INSERT: first owner of a household the caller just created.
-- No UPDATE/DELETE policies. Leave, join, role change, and transfer are
-- service_role / application operations. Leaving updates left_at; it
-- must not delete the row.
-- -----------------------------------------------------------------------------

CREATE POLICY household_members_select_members
  ON public.household_members
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_members_insert_creator_owner
  ON public.household_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND left_at IS NULL
    AND public.is_household_created_by_current_user(household_id)
    AND public.household_has_no_members(household_id)
  );

-- -----------------------------------------------------------------------------
-- household_invitations
-- Tokens are sensitive. Only active owners may read, create, or revoke.
-- No UPDATE policy: acceptance is an application/service operation.
-- -----------------------------------------------------------------------------

CREATE POLICY household_invitations_select_owners
  ON public.household_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_household_owner(household_id));

CREATE POLICY household_invitations_insert_owners
  ON public.household_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_household_owner(household_id)
    AND invited_by = auth.uid()
  );

CREATE POLICY household_invitations_delete_owners
  ON public.household_invitations
  FOR DELETE
  TO authenticated
  USING (public.is_household_owner(household_id));

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------

CREATE POLICY categories_select_members
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY categories_insert_active_members
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  );

CREATE POLICY categories_update_active_members
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (public.is_active_household_member(household_id));

-- -----------------------------------------------------------------------------
-- recurring_incomes
-- Physical DELETE is not granted. Deactivate with is_active = false.
-- -----------------------------------------------------------------------------

CREATE POLICY recurring_incomes_select_members
  ON public.recurring_incomes
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY recurring_incomes_insert_active_members
  ON public.recurring_incomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND public.is_active_member_of(household_id, member_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY recurring_incomes_update_active_members
  ON public.recurring_incomes
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- incomes
-- Physical DELETE is not granted. Soft-delete with deleted_at.
-- UPDATE does not re-require member_id to still be active, so remaining
-- members can correct or soft-delete rows of people who have left.
-- Moving household_id to another Nido fails because the writer cannot
-- be an active member of two households.
-- -----------------------------------------------------------------------------

CREATE POLICY incomes_select_members
  ON public.incomes
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY incomes_insert_active_members
  ON public.incomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND public.is_active_member_of(household_id, member_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY incomes_update_active_members
  ON public.incomes
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- recurring_expenses
-- -----------------------------------------------------------------------------

CREATE POLICY recurring_expenses_select_members
  ON public.recurring_expenses
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY recurring_expenses_insert_active_members
  ON public.recurring_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND public.is_active_member_of(household_id, payer_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY recurring_expenses_update_active_members
  ON public.recurring_expenses
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- recurring_expense_splits
-- Access inherits the parent rule's household.
-- -----------------------------------------------------------------------------

CREATE POLICY recurring_expense_splits_select_members
  ON public.recurring_expense_splits
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(
      public.household_id_for_recurring_expense(recurring_expense_id)
    )
  );

CREATE POLICY recurring_expense_splits_insert_active_members
  ON public.recurring_expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(
      public.household_id_for_recurring_expense(recurring_expense_id)
    )
    AND public.is_active_member_of(
      public.household_id_for_recurring_expense(recurring_expense_id),
      member_id
    )
  );

CREATE POLICY recurring_expense_splits_update_active_members
  ON public.recurring_expense_splits
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(
      public.household_id_for_recurring_expense(recurring_expense_id)
    )
  )
  WITH CHECK (
    public.is_active_household_member(
      public.household_id_for_recurring_expense(recurring_expense_id)
    )
  );

CREATE POLICY recurring_expense_splits_delete_active_members
  ON public.recurring_expense_splits
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_household_member(
      public.household_id_for_recurring_expense(recurring_expense_id)
    )
  );

-- -----------------------------------------------------------------------------
-- expenses
-- -----------------------------------------------------------------------------

CREATE POLICY expenses_select_members
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY expenses_insert_active_members
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND public.is_active_member_of(household_id, payer_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY expenses_update_active_members
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- expense_splits
-- Access inherits the parent expense's household.
-- DELETE is allowed for active members so an edit can replace splits.
-- Split totals remain an application/service transaction rule.
-- -----------------------------------------------------------------------------

CREATE POLICY expense_splits_select_members
  ON public.expense_splits
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(public.household_id_for_expense(expense_id))
  );

CREATE POLICY expense_splits_insert_active_members
  ON public.expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_expense(expense_id))
    AND public.is_active_member_of(
      public.household_id_for_expense(expense_id),
      member_id
    )
  );

CREATE POLICY expense_splits_update_active_members
  ON public.expense_splits
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_expense(expense_id))
  )
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_expense(expense_id))
  );

CREATE POLICY expense_splits_delete_active_members
  ON public.expense_splits
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_expense(expense_id))
  );

-- -----------------------------------------------------------------------------
-- budgets
-- Personal: member_id must be an active member of the household on INSERT.
-- Household: member_id IS NULL. Any active member may create or edit.
-- -----------------------------------------------------------------------------

CREATE POLICY budgets_select_members
  ON public.budgets
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY budgets_insert_active_members
  ON public.budgets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
    AND (
      member_id IS NULL
      OR public.is_active_member_of(household_id, member_id)
    )
    AND public.category_belongs_to_household(category_id, household_id)
  );

CREATE POLICY budgets_update_active_members
  ON public.budgets
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND public.category_belongs_to_household(category_id, household_id)
  );

-- -----------------------------------------------------------------------------
-- goals
-- Physical DELETE is not granted. Archive with status = archived.
-- -----------------------------------------------------------------------------

CREATE POLICY goals_select_members
  ON public.goals
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY goals_insert_active_members
  ON public.goals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  );

CREATE POLICY goals_update_active_members
  ON public.goals
  FOR UPDATE
  TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (public.is_active_household_member(household_id));

-- -----------------------------------------------------------------------------
-- goal_contributions
-- Access inherits the parent goal's household.
-- -----------------------------------------------------------------------------

CREATE POLICY goal_contributions_select_members
  ON public.goal_contributions
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(public.household_id_for_goal(goal_id))
  );

CREATE POLICY goal_contributions_insert_active_members
  ON public.goal_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
    AND created_by = auth.uid()
    AND public.is_active_member_of(
      public.household_id_for_goal(goal_id),
      member_id
    )
  );

CREATE POLICY goal_contributions_update_active_members
  ON public.goal_contributions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
  )
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
  );

CREATE POLICY goal_contributions_delete_active_members
  ON public.goal_contributions
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_household_member(public.household_id_for_goal(goal_id))
  );
