-- Add optional emoji to purchases for richer movement rows.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS emoji text;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_emoji_len;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_emoji_len
  CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16);

COMMENT ON COLUMN public.purchases.emoji IS
  'Optional emoji shown on purchase rows in Compras a plazos.';

DROP FUNCTION IF EXISTS public.create_purchase(
  uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb, jsonb
);

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
    IF p_msi_months IS NULL OR p_msi_months < 2 OR p_msi_months > 48 OR p_card_id IS NULL THEN
      RAISE EXCEPTION 'nido.invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    p_msi_months := NULL;
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

REVOKE ALL ON FUNCTION public.create_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid, text, text, text, date, numeric, public.purchase_payment_method, int, uuid, date, jsonb, jsonb, text) TO authenticated;
