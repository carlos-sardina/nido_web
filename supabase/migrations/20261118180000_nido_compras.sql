-- Compras compartidas del Nido: tarjetas, MSI, cooperación y bonificaciones.
-- Visible a todos los miembros del Nido activo. No participa en balance mensual
-- ni en presupuestos/gastos del dashboard financiero.

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.purchase_payment_method AS ENUM ('cash', 'msi');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_bonus_type AS ENUM ('cashback', 'deferred_discount');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- payment_cards
-- -----------------------------------------------------------------------------

CREATE TABLE public.payment_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  owner_member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  label text NOT NULL,
  bank text,
  last_four text,
  cut_day smallint NOT NULL,
  payment_day smallint NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT payment_cards_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 60),
  CONSTRAINT payment_cards_bank_len CHECK (bank IS NULL OR char_length(trim(bank)) BETWEEN 1 AND 40),
  CONSTRAINT payment_cards_last_four CHECK (last_four IS NULL OR last_four ~ '^\d{4}$'),
  CONSTRAINT payment_cards_cut_day CHECK (cut_day BETWEEN 1 AND 28),
  CONSTRAINT payment_cards_payment_day CHECK (payment_day BETWEEN 1 AND 28)
);

COMMENT ON TABLE public.payment_cards IS
  'Tarjetas del Nido para compras MSI/contado. cut_day y payment_day son días calendario 1–28.';

CREATE TRIGGER payment_cards_set_updated_at
  BEFORE UPDATE ON public.payment_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX payment_cards_household_live_idx
  ON public.payment_cards (household_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_payment_cards_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.household_id IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.owner_member_id);
  PERFORM public.assert_active_household_member(NEW.household_id, NEW.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_cards_integrity
  BEFORE INSERT OR UPDATE ON public.payment_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payment_cards_integrity();

CREATE OR REPLACE FUNCTION public.household_id_for_payment_card(p_card_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.payment_cards WHERE id = p_card_id;
$$;

-- -----------------------------------------------------------------------------
-- purchases
-- -----------------------------------------------------------------------------

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  store text,
  purchased_at date NOT NULL,
  gross_amount numeric(12, 2) NOT NULL,
  payment_method public.purchase_payment_method NOT NULL,
  msi_months smallint,
  card_id uuid REFERENCES public.payment_cards (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT purchases_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  CONSTRAINT purchases_description_len CHECK (
    description IS NULL OR char_length(trim(description)) BETWEEN 1 AND 200
  ),
  CONSTRAINT purchases_store_len CHECK (
    store IS NULL OR char_length(trim(store)) BETWEEN 1 AND 80
  ),
  CONSTRAINT purchases_gross_positive CHECK (
    gross_amount > 0 AND gross_amount <= 9999999999.99
  ),
  CONSTRAINT purchases_msi_months_valid CHECK (
    (payment_method = 'cash' AND msi_months IS NULL)
    OR (payment_method = 'msi' AND msi_months BETWEEN 2 AND 48)
  ),
  CONSTRAINT purchases_msi_requires_card CHECK (
    payment_method = 'cash' OR card_id IS NOT NULL
  )
);

COMMENT ON TABLE public.purchases IS
  'Compras compartidas del Nido (muebles, electrodomésticos, etc.). Fuera del balance mensual.';

CREATE TRIGGER purchases_set_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX purchases_household_live_idx
  ON public.purchases (household_id, purchased_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX purchases_card_id_idx
  ON public.purchases (card_id)
  WHERE deleted_at IS NULL AND card_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_purchases_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_household uuid;
  v_card_deleted timestamptz;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.household_id IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_active_household_member(NEW.household_id, NEW.created_by);

  IF NEW.card_id IS NOT NULL THEN
    SELECT household_id, deleted_at
      INTO v_card_household, v_card_deleted
      FROM public.payment_cards
     WHERE id = NEW.card_id;

    IF v_card_household IS NULL THEN
      RAISE EXCEPTION 'nido.card_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_card_household IS DISTINCT FROM NEW.household_id THEN
      RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
    END IF;
    IF v_card_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'nido.card_deleted' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchases_integrity
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchases_integrity();

CREATE OR REPLACE FUNCTION public.household_id_for_purchase(p_purchase_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.purchases WHERE id = p_purchase_id;
$$;

-- -----------------------------------------------------------------------------
-- purchase_shares
-- -----------------------------------------------------------------------------

CREATE TABLE public.purchase_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  percent numeric(5, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_shares_percent_range CHECK (percent > 0 AND percent <= 100),
  CONSTRAINT purchase_shares_unique_member UNIQUE (purchase_id, member_id)
);

CREATE INDEX purchase_shares_purchase_id_idx
  ON public.purchase_shares (purchase_id);

CREATE OR REPLACE FUNCTION public.trg_purchase_shares_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id
    FROM public.purchases
   WHERE id = NEW.purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.assert_active_household_member(v_household_id, NEW.member_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_shares_integrity
  BEFORE INSERT OR UPDATE ON public.purchase_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_shares_integrity();

-- -----------------------------------------------------------------------------
-- purchase_installments
-- -----------------------------------------------------------------------------

CREATE TABLE public.purchase_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  installment_number smallint NOT NULL,
  due_date date NOT NULL,
  amount numeric(12, 2) NOT NULL,
  paid_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_installments_number_positive CHECK (installment_number >= 1),
  CONSTRAINT purchase_installments_amount_positive CHECK (amount > 0),
  CONSTRAINT purchase_installments_unique_number UNIQUE (purchase_id, installment_number)
);

CREATE INDEX purchase_installments_purchase_id_idx
  ON public.purchase_installments (purchase_id);

CREATE INDEX purchase_installments_due_date_idx
  ON public.purchase_installments (due_date);

-- -----------------------------------------------------------------------------
-- purchase_bonuses
-- -----------------------------------------------------------------------------

CREATE TABLE public.purchase_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  bonus_type public.purchase_bonus_type NOT NULL,
  label text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  expected_at date NOT NULL,
  received_at date,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT purchase_bonuses_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 80),
  CONSTRAINT purchase_bonuses_amount_positive CHECK (
    amount > 0 AND amount <= 9999999999.99
  ),
  CONSTRAINT purchase_bonuses_notes_len CHECK (
    notes IS NULL OR char_length(trim(notes)) BETWEEN 1 AND 200
  )
);

CREATE TRIGGER purchase_bonuses_set_updated_at
  BEFORE UPDATE ON public.purchase_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX purchase_bonuses_purchase_live_idx
  ON public.purchase_bonuses (purchase_id)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bonuses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_cards FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchases FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchase_shares FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchase_installments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchase_bonuses FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_installments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.purchase_bonuses TO authenticated;

CREATE POLICY payment_cards_select_members
  ON public.payment_cards FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY payment_cards_insert_active
  ON public.payment_cards FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  );

CREATE POLICY payment_cards_update_active
  ON public.payment_cards FOR UPDATE TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (public.is_active_household_member(household_id));

CREATE POLICY purchases_select_members
  ON public.purchases FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY purchases_insert_active
  ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_household_member(household_id)
    AND created_by = auth.uid()
  );

CREATE POLICY purchases_update_active
  ON public.purchases FOR UPDATE TO authenticated
  USING (public.is_active_household_member(household_id))
  WITH CHECK (public.is_active_household_member(household_id));

CREATE POLICY purchase_shares_select_members
  ON public.purchase_shares FOR SELECT TO authenticated
  USING (public.is_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_shares_insert_active
  ON public.purchase_shares FOR INSERT TO authenticated
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_shares_update_active
  ON public.purchase_shares FOR UPDATE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)))
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_shares_delete_active
  ON public.purchase_shares FOR DELETE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_installments_select_members
  ON public.purchase_installments FOR SELECT TO authenticated
  USING (public.is_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_installments_insert_active
  ON public.purchase_installments FOR INSERT TO authenticated
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_installments_update_active
  ON public.purchase_installments FOR UPDATE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)))
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_installments_delete_active
  ON public.purchase_installments FOR DELETE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_bonuses_select_members
  ON public.purchase_bonuses FOR SELECT TO authenticated
  USING (public.is_household_member(public.household_id_for_purchase(purchase_id)));

CREATE POLICY purchase_bonuses_insert_active
  ON public.purchase_bonuses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_household_member(public.household_id_for_purchase(purchase_id))
    AND created_by = auth.uid()
  );

CREATE POLICY purchase_bonuses_update_active
  ON public.purchase_bonuses FOR UPDATE TO authenticated
  USING (public.is_active_household_member(public.household_id_for_purchase(purchase_id)))
  WITH CHECK (public.is_active_household_member(public.household_id_for_purchase(purchase_id)));

-- -----------------------------------------------------------------------------
-- Date helpers for MSI
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clamp_month_day(p_year int, p_month int, p_day int)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT make_date(
    p_year,
    p_month,
    LEAST(p_day, EXTRACT(DAY FROM (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day'))::int)
  );
$$;

CREATE OR REPLACE FUNCTION public.add_calendar_months(p_date date, p_months int)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.clamp_month_day(
    EXTRACT(YEAR FROM (p_date + (p_months || ' months')::interval))::int,
    EXTRACT(MONTH FROM (p_date + (p_months || ' months')::interval))::int,
    EXTRACT(DAY FROM p_date)::int
  );
$$;

-- First deposit/payment date after the statement cut that includes the purchase.
CREATE OR REPLACE FUNCTION public.msi_first_due_date(
  p_purchased_at date,
  p_cut_day int,
  p_payment_day int
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM p_purchased_at)::int;
  v_month int := EXTRACT(MONTH FROM p_purchased_at)::int;
  v_day int := EXTRACT(DAY FROM p_purchased_at)::int;
  v_cut date;
  v_due date;
BEGIN
  IF v_day <= p_cut_day THEN
    v_cut := public.clamp_month_day(v_year, v_month, p_cut_day);
  ELSE
    v_cut := public.add_calendar_months(public.clamp_month_day(v_year, v_month, p_cut_day), 1);
  END IF;

  IF p_payment_day > p_cut_day THEN
    v_due := public.clamp_month_day(
      EXTRACT(YEAR FROM v_cut)::int,
      EXTRACT(MONTH FROM v_cut)::int,
      p_payment_day
    );
  ELSE
    v_due := public.add_calendar_months(
      public.clamp_month_day(
        EXTRACT(YEAR FROM v_cut)::int,
        EXTRACT(MONTH FROM v_cut)::int,
        p_payment_day
      ),
      1
    );
  END IF;

  RETURN v_due;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_purchase_shares(
  p_purchase_id uuid,
  p_shares jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_member_id uuid;
  v_percent numeric(5, 2);
  v_total numeric(8, 2) := 0;
  v_count int := 0;
BEGIN
  IF p_shares IS NULL OR jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) < 1 THEN
    RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.purchase_shares WHERE purchase_id = p_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_member_id := (v_item->>'member_id')::uuid;
    v_percent := round((v_item->>'percent')::numeric, 2);
    IF v_member_id IS NULL OR v_percent IS NULL OR v_percent <= 0 OR v_percent > 100 THEN
      RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.purchase_shares (purchase_id, member_id, percent)
    VALUES (p_purchase_id, v_member_id, v_percent);
    v_total := v_total + v_percent;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < 1 OR round(v_total, 2) <> 100.00 THEN
    RAISE EXCEPTION 'nido.invalid_split' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_purchase_installments(
  p_purchase_id uuid,
  p_gross numeric,
  p_method public.purchase_payment_method,
  p_msi_months int,
  p_purchased_at date,
  p_card_id uuid,
  p_first_due_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cut smallint;
  v_pay smallint;
  v_first date;
  v_months int;
  v_cents bigint;
  v_base bigint;
  v_rem bigint;
  v_i int;
  v_amount numeric(12, 2);
BEGIN
  DELETE FROM public.purchase_installments WHERE purchase_id = p_purchase_id;

  IF p_method = 'cash' THEN
    RETURN;
  END IF;

  IF p_card_id IS NULL OR p_msi_months IS NULL OR p_msi_months < 2 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  SELECT cut_day, payment_day INTO v_cut, v_pay
    FROM public.payment_cards
   WHERE id = p_card_id AND deleted_at IS NULL;

  IF v_cut IS NULL THEN
    RAISE EXCEPTION 'nido.card_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_months := p_msi_months;
  IF p_first_due_date IS NOT NULL THEN
    v_first := p_first_due_date;
  ELSE
    v_first := public.msi_first_due_date(p_purchased_at, v_cut, v_pay);
  END IF;

  v_cents := round(p_gross * 100)::bigint;
  v_base := v_cents / v_months;
  v_rem := v_cents - (v_base * v_months);

  FOR v_i IN 1..v_months LOOP
    IF v_i = v_months THEN
      v_amount := (v_base + v_rem)::numeric / 100;
    ELSE
      v_amount := v_base::numeric / 100;
    END IF;

    INSERT INTO public.purchase_installments (
      purchase_id, installment_number, due_date, amount
    ) VALUES (
      p_purchase_id,
      v_i,
      public.add_calendar_months(v_first, v_i - 1),
      v_amount
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Card RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_payment_card(
  p_household_id uuid,
  p_owner_member_id uuid,
  p_label text,
  p_bank text,
  p_last_four text,
  p_cut_day int,
  p_payment_day int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_label text;
  v_bank text;
  v_last text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF p_household_id IS NULL OR NOT public.is_active_household_member(p_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_member_id IS NULL
     OR NOT public.is_active_member_of(p_household_id, p_owner_member_id) THEN
    RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
  END IF;

  v_label := trim(both FROM coalesce(p_label, ''));
  IF v_label = '' OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_bank := trim(both FROM coalesce(p_bank, ''));
  IF v_bank = '' THEN
    v_bank := NULL;
  ELSIF char_length(v_bank) > 40 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_last := trim(both FROM coalesce(p_last_four, ''));
  IF v_last = '' THEN
    v_last := NULL;
  ELSIF v_last !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_cut_day IS NULL OR p_cut_day < 1 OR p_cut_day > 28
     OR p_payment_day IS NULL OR p_payment_day < 1 OR p_payment_day > 28 THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payment_cards (
    household_id, owner_member_id, label, bank, last_four,
    cut_day, payment_day, created_by
  ) VALUES (
    p_household_id, p_owner_member_id, v_label, v_bank, v_last,
    p_cut_day, p_payment_day, v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment_card(
  p_card_id uuid,
  p_owner_member_id uuid,
  p_label text,
  p_bank text,
  p_last_four text,
  p_cut_day int,
  p_payment_day int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_deleted timestamptz;
  v_label text;
  v_bank text;
  v_last text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.payment_cards WHERE id = p_card_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.card_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.card_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_member_id IS NULL
     OR NOT public.is_active_member_of(v_household_id, p_owner_member_id) THEN
    RAISE EXCEPTION 'nido.forbidden' USING ERRCODE = 'P0001';
  END IF;

  v_label := trim(both FROM coalesce(p_label, ''));
  IF v_label = '' OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_bank := trim(both FROM coalesce(p_bank, ''));
  IF v_bank = '' THEN
    v_bank := NULL;
  ELSIF char_length(v_bank) > 40 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_last := trim(both FROM coalesce(p_last_four, ''));
  IF v_last = '' THEN
    v_last := NULL;
  ELSIF v_last !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_cut_day IS NULL OR p_cut_day < 1 OR p_cut_day > 28
     OR p_payment_day IS NULL OR p_payment_day < 1 OR p_payment_day > 28 THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payment_cards SET
    owner_member_id = p_owner_member_id,
    label = v_label,
    bank = v_bank,
    last_four = v_last,
    cut_day = p_cut_day,
    payment_day = p_payment_day
  WHERE id = p_card_id;

  RETURN p_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_payment_card(p_card_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_deleted timestamptz;
  v_live int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.payment_cards WHERE id = p_card_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.card_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.card_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::int INTO v_live
    FROM public.purchases
   WHERE card_id = p_card_id AND deleted_at IS NULL;

  IF v_live > 0 THEN
    RAISE EXCEPTION 'nido.conflict' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payment_cards
     SET deleted_at = now()
   WHERE id = p_card_id;

  RETURN p_card_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Purchase RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase(
  p_household_id uuid,
  p_name text,
  p_description text,
  p_store text,
  p_purchased_at date,
  p_gross_amount numeric,
  p_payment_method public.purchase_payment_method,
  p_msi_months int,
  p_card_id uuid,
  p_first_due_date date,
  p_shares jsonb,
  p_bonuses jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text;
  v_description text;
  v_store text;
  v_amount numeric(12, 2);
  v_id uuid;
  v_bonus jsonb;
  v_bonus_label text;
  v_bonus_notes text;
  v_bonus_amount numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF p_household_id IS NULL OR NOT public.is_active_household_member(p_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' THEN
    v_description := NULL;
  ELSIF char_length(v_description) > 200 THEN
    RAISE EXCEPTION 'nido.invalid_description' USING ERRCODE = 'P0001';
  END IF;

  v_store := trim(both FROM coalesce(p_store, ''));
  IF v_store = '' THEN
    v_store := NULL;
  ELSIF char_length(v_store) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_purchased_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  IF p_gross_amount IS NULL OR p_gross_amount <= 0 OR p_gross_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  v_amount := round(p_gross_amount, 2);

  IF p_payment_method IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  IF p_payment_method = 'msi' THEN
    IF p_msi_months IS NULL OR p_msi_months < 2 OR p_msi_months > 48 OR p_card_id IS NULL THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_msi_months := NULL;
  END IF;

  INSERT INTO public.purchases (
    household_id, name, description, store, purchased_at, gross_amount,
    payment_method, msi_months, card_id, created_by
  ) VALUES (
    p_household_id, v_name, v_description, v_store, p_purchased_at, v_amount,
    p_payment_method, p_msi_months, p_card_id, v_user_id
  )
  RETURNING id INTO v_id;

  PERFORM public.replace_purchase_shares(v_id, p_shares);
  PERFORM public.replace_purchase_installments(
    v_id, v_amount, p_payment_method, p_msi_months, p_purchased_at, p_card_id, p_first_due_date
  );

  IF p_bonuses IS NOT NULL AND jsonb_typeof(p_bonuses) = 'array' THEN
    FOR v_bonus IN SELECT * FROM jsonb_array_elements(p_bonuses)
    LOOP
      v_bonus_label := trim(both FROM coalesce(v_bonus->>'label', ''));
      IF v_bonus_label = '' OR char_length(v_bonus_label) > 80 THEN
        RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
      END IF;
      v_bonus_amount := round((v_bonus->>'amount')::numeric, 2);
      IF v_bonus_amount IS NULL OR v_bonus_amount <= 0 THEN
        RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
      END IF;
      IF (v_bonus->>'expected_at')::date IS NULL THEN
        RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
      END IF;
      v_bonus_notes := trim(both FROM coalesce(v_bonus->>'notes', ''));
      IF v_bonus_notes = '' THEN
        v_bonus_notes := NULL;
      END IF;

      INSERT INTO public.purchase_bonuses (
        purchase_id, bonus_type, label, amount, expected_at, notes, created_by
      ) VALUES (
        v_id,
        (v_bonus->>'bonus_type')::public.purchase_bonus_type,
        v_bonus_label,
        v_bonus_amount,
        (v_bonus->>'expected_at')::date,
        v_bonus_notes,
        v_user_id
      );
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_purchase(
  p_purchase_id uuid,
  p_name text,
  p_description text,
  p_store text,
  p_purchased_at date,
  p_gross_amount numeric,
  p_payment_method public.purchase_payment_method,
  p_msi_months int,
  p_card_id uuid,
  p_first_due_date date,
  p_shares jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_deleted timestamptz;
  v_name text;
  v_description text;
  v_store text;
  v_amount numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  v_name := trim(both FROM coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_description := trim(both FROM coalesce(p_description, ''));
  IF v_description = '' THEN
    v_description := NULL;
  ELSIF char_length(v_description) > 200 THEN
    RAISE EXCEPTION 'nido.invalid_description' USING ERRCODE = 'P0001';
  END IF;

  v_store := trim(both FROM coalesce(p_store, ''));
  IF v_store = '' THEN
    v_store := NULL;
  ELSIF char_length(v_store) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_purchased_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  IF p_gross_amount IS NULL OR p_gross_amount <= 0 OR p_gross_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  v_amount := round(p_gross_amount, 2);

  IF p_payment_method = 'msi' THEN
    IF p_msi_months IS NULL OR p_msi_months < 2 OR p_msi_months > 48 OR p_card_id IS NULL THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_msi_months := NULL;
  END IF;

  UPDATE public.purchases SET
    name = v_name,
    description = v_description,
    store = v_store,
    purchased_at = p_purchased_at,
    gross_amount = v_amount,
    payment_method = p_payment_method,
    msi_months = p_msi_months,
    card_id = p_card_id
  WHERE id = p_purchase_id;

  PERFORM public.replace_purchase_shares(p_purchase_id, p_shares);
  PERFORM public.replace_purchase_installments(
    p_purchase_id, v_amount, p_payment_method, p_msi_months,
    p_purchased_at, p_card_id, p_first_due_date
  );

  RETURN p_purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_purchase(p_purchase_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_deleted timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = p_purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchases SET deleted_at = now() WHERE id = p_purchase_id;
  UPDATE public.purchase_bonuses
     SET deleted_at = now()
   WHERE purchase_id = p_purchase_id AND deleted_at IS NULL;

  RETURN p_purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_purchase_installment_paid(
  p_installment_id uuid,
  p_paid_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_purchase_id uuid;
  v_household_id uuid;
  v_deleted timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT purchase_id INTO v_purchase_id
    FROM public.purchase_installments WHERE id = p_installment_id;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'nido.installment_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = v_purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchase_installments
     SET paid_at = p_paid_at
   WHERE id = p_installment_id;

  RETURN p_installment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_bonus(
  p_purchase_id uuid,
  p_bonus_type public.purchase_bonus_type,
  p_label text,
  p_amount numeric,
  p_expected_at date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_deleted timestamptz;
  v_label text;
  v_notes text;
  v_amount numeric(12, 2);
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = p_purchase_id;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  v_label := trim(both FROM coalesce(p_label, ''));
  IF v_label = '' OR char_length(v_label) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  v_amount := round(p_amount, 2);

  IF p_expected_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  IF p_bonus_type IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  v_notes := trim(both FROM coalesce(p_notes, ''));
  IF v_notes = '' THEN
    v_notes := NULL;
  ELSIF char_length(v_notes) > 200 THEN
    RAISE EXCEPTION 'nido.invalid_description' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.purchase_bonuses (
    purchase_id, bonus_type, label, amount, expected_at, notes, created_by
  ) VALUES (
    p_purchase_id, p_bonus_type, v_label, v_amount, p_expected_at, v_notes, v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_purchase_bonus(
  p_bonus_id uuid,
  p_label text,
  p_amount numeric,
  p_expected_at date,
  p_received_at date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_purchase_id uuid;
  v_household_id uuid;
  v_deleted timestamptz;
  v_bonus_deleted timestamptz;
  v_label text;
  v_notes text;
  v_amount numeric(12, 2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT purchase_id, deleted_at INTO v_purchase_id, v_bonus_deleted
    FROM public.purchase_bonuses WHERE id = p_bonus_id;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'nido.bonus_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_bonus_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.bonus_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = v_purchase_id;

  IF v_household_id IS NULL OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  v_label := trim(both FROM coalesce(p_label, ''));
  IF v_label = '' OR char_length(v_label) > 80 THEN
    RAISE EXCEPTION 'nido.invalid_name' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  v_amount := round(p_amount, 2);

  IF p_expected_at IS NULL THEN
    RAISE EXCEPTION 'nido.invalid_date' USING ERRCODE = 'P0001';
  END IF;

  v_notes := trim(both FROM coalesce(p_notes, ''));
  IF v_notes = '' THEN
    v_notes := NULL;
  ELSIF char_length(v_notes) > 200 THEN
    RAISE EXCEPTION 'nido.invalid_description' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchase_bonuses SET
    label = v_label,
    amount = v_amount,
    expected_at = p_expected_at,
    received_at = p_received_at,
    notes = v_notes
  WHERE id = p_bonus_id;

  RETURN p_bonus_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bonus(p_bonus_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_purchase_id uuid;
  v_household_id uuid;
  v_deleted timestamptz;
  v_bonus_deleted timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT purchase_id, deleted_at INTO v_purchase_id, v_bonus_deleted
    FROM public.purchase_bonuses WHERE id = p_bonus_id;

  IF v_purchase_id IS NULL OR v_bonus_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.bonus_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT household_id, deleted_at INTO v_household_id, v_deleted
    FROM public.purchases WHERE id = v_purchase_id;

  IF v_household_id IS NULL OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_household_member(v_household_id) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.purchase_bonuses SET deleted_at = now() WHERE id = p_bonus_id;
  RETURN p_bonus_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_card(uuid, uuid, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_card(uuid, uuid, text, text, text, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.update_payment_card(uuid, uuid, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_payment_card(uuid, uuid, text, text, text, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_payment_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment_card(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_purchase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_purchase_installment_paid(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_purchase_installment_paid(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.create_purchase_bonus(uuid, public.purchase_bonus_type, text, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_bonus(uuid, public.purchase_bonus_type, text, numeric, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_purchase_bonus(uuid, text, numeric, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_purchase_bonus(uuid, text, numeric, date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_purchase_bonus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_bonus(uuid) TO authenticated;
