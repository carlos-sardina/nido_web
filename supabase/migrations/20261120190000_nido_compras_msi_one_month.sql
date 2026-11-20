-- Allow MSI of 1 month: single installment due on the card's next payment day.

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_msi_months_valid;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_msi_months_valid CHECK (
    (payment_method = 'cash' AND msi_months IS NULL)
    OR (payment_method = 'msi' AND msi_months BETWEEN 1 AND 48)
  );

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

  IF p_card_id IS NULL OR p_msi_months IS NULL OR p_msi_months < 1 OR p_msi_months > 48 THEN
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
  p_bonuses jsonb,
  p_emoji text DEFAULT NULL
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
  v_emoji text;
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

  v_emoji := trim(both FROM coalesce(p_emoji, ''));
  IF v_emoji = '' THEN
    v_emoji := NULL;
  ELSIF char_length(v_emoji) > 16 THEN
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
    IF p_msi_months IS NULL OR p_msi_months < 1 OR p_msi_months > 48 OR p_card_id IS NULL THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_msi_months := NULL;
    p_card_id := NULL;
  END IF;

  INSERT INTO public.purchases (
    household_id, name, description, store, purchased_at, gross_amount,
    payment_method, msi_months, card_id, emoji, created_by
  ) VALUES (
    p_household_id, v_name, v_description, v_store, p_purchased_at, v_amount,
    p_payment_method, p_msi_months, p_card_id, v_emoji, v_user_id
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
    IF p_msi_months IS NULL OR p_msi_months < 1 OR p_msi_months > 48 OR p_card_id IS NULL THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_msi_months := NULL;
    p_card_id := NULL;
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
