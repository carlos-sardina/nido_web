-- =============================================================================
-- Compras a plazos — audit trail
--
-- Append-only log for purchases, payments, installments, bonuses, and cards.
-- Clients SELECT only. Triggers write via SECURITY DEFINER helper.
-- Does not touch household Actividad / household_mutation_events.
-- =============================================================================

CREATE TYPE public.purchase_audit_action AS ENUM (
  'created',
  'updated',
  'deleted',
  'undone',
  'marked_paid',
  'marked_unpaid',
  'received',
  'unreceived'
);

CREATE TYPE public.purchase_audit_entity AS ENUM (
  'purchase',
  'payment_card',
  'purchase_payment',
  'purchase_installment',
  'purchase_bonus'
);

CREATE TABLE public.purchase_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchases (id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  action public.purchase_audit_action NOT NULL,
  entity_type public.purchase_audit_entity NOT NULL,
  entity_id uuid NOT NULL,
  label text NOT NULL,
  amount numeric(12, 2),
  icon text,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_audit_events_label_chk CHECK (btrim(label) <> '')
);

COMMENT ON TABLE public.purchase_audit_events IS
  'Append-only audit log for the compras a plazos module. Written by triggers; clients cannot insert.';

COMMENT ON COLUMN public.purchase_audit_events.meta IS
  'Structured snapshot: payer, paid_at, kind, notes, installment number, before/after amounts, etc.';

CREATE INDEX purchase_audit_events_household_occurred_idx
  ON public.purchase_audit_events (household_id, occurred_at DESC);

CREATE INDEX purchase_audit_events_purchase_occurred_idx
  ON public.purchase_audit_events (purchase_id, occurred_at DESC)
  WHERE purchase_id IS NOT NULL;

ALTER TABLE public.purchase_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_audit_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.purchase_audit_events TO authenticated;
GRANT ALL ON TABLE public.purchase_audit_events TO service_role;

CREATE POLICY purchase_audit_events_select_members
  ON public.purchase_audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- Insert helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_purchase_audit_event(
  p_household_id uuid,
  p_actor_id uuid,
  p_action public.purchase_audit_action,
  p_entity_type public.purchase_audit_entity,
  p_entity_id uuid,
  p_label text,
  p_amount numeric DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_purchase_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
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
    v_label := 'movimiento de compras';
  END IF;

  INSERT INTO public.purchase_audit_events (
    household_id,
    purchase_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    label,
    amount,
    icon,
    detail,
    meta
  ) VALUES (
    p_household_id,
    p_purchase_id,
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    v_label,
    p_amount,
    nullif(btrim(coalesce(p_icon, '')), ''),
    nullif(btrim(coalesce(p_detail, '')), ''),
    coalesce(p_meta, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.insert_purchase_audit_event(
  uuid, uuid, public.purchase_audit_action, public.purchase_audit_entity,
  uuid, text, numeric, text, text, uuid, jsonb
) IS
  'Inserts one compras audit event. Called from AFTER INSERT/UPDATE triggers. Clients have no INSERT grant.';

REVOKE ALL ON FUNCTION public.insert_purchase_audit_event(
  uuid, uuid, public.purchase_audit_action, public.purchase_audit_entity,
  uuid, text, numeric, text, text, uuid, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_purchase_audit_event(
  uuid, uuid, public.purchase_audit_action, public.purchase_audit_entity,
  uuid, text, numeric, text, text, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_audit_profile_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(btrim(coalesce(display_name, '')), '')
  FROM public.profiles
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.purchase_audit_profile_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_audit_profile_name(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- purchases
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_purchases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action public.purchase_audit_action;
  v_detail text;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'payment_method', NEW.payment_method,
      'msi_months', NEW.msi_months,
      'card_id', NEW.card_id,
      'purchased_at', NEW.purchased_at,
      'store', NEW.store,
      'created_by', NEW.created_by
    );
    v_detail := format(
      'Alta · %s · %s',
      CASE WHEN NEW.payment_method = 'msi'
        THEN coalesce(NEW.msi_months::text, '?') || ' MSI'
        ELSE 'contado'
      END,
      NEW.purchased_at::text
    );
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'created', 'purchase', NEW.id,
      NEW.name, NEW.gross_amount, NEW.emoji, v_detail, NEW.id, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_meta := jsonb_build_object(
      'payment_method', NEW.payment_method,
      'msi_months', NEW.msi_months,
      'gross_amount', NEW.gross_amount,
      'purchased_at', NEW.purchased_at
    );
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'deleted', 'purchase', NEW.id,
      NEW.name, NEW.gross_amount, NEW.emoji, 'Compra eliminada', NEW.id, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.emoji IS DISTINCT FROM OLD.emoji
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.store IS DISTINCT FROM OLD.store
     OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at
     OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.msi_months IS DISTINCT FROM OLD.msi_months
     OR NEW.card_id IS DISTINCT FROM OLD.card_id
  THEN
    v_meta := jsonb_build_object(
      'before', jsonb_build_object(
        'name', OLD.name,
        'gross_amount', OLD.gross_amount,
        'payment_method', OLD.payment_method,
        'msi_months', OLD.msi_months,
        'card_id', OLD.card_id,
        'purchased_at', OLD.purchased_at,
        'store', OLD.store
      ),
      'after', jsonb_build_object(
        'name', NEW.name,
        'gross_amount', NEW.gross_amount,
        'payment_method', NEW.payment_method,
        'msi_months', NEW.msi_months,
        'card_id', NEW.card_id,
        'purchased_at', NEW.purchased_at,
        'store', NEW.store
      )
    );
    v_detail := 'Datos de la compra actualizados';
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'updated', 'purchase', NEW.id,
      NEW.name, NEW.gross_amount, NEW.emoji, v_detail, NEW.id, v_meta
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchases_audit_insert
  AFTER INSERT ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_purchases();

CREATE TRIGGER purchases_audit_update
  AFTER UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_purchases();

-- -----------------------------------------------------------------------------
-- purchase_payments (day, payer, amount, kind, notes, actor)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_household uuid;
  v_purchase_name text;
  v_purchase_emoji text;
  v_payer_name text;
  v_actor_name text;
  v_kind_label text;
  v_detail text;
  v_meta jsonb;
  v_link_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT p.household_id, p.name, p.emoji
    INTO v_household, v_purchase_name, v_purchase_emoji
  FROM public.purchases p
  WHERE p.id = coalesce(NEW.purchase_id, OLD.purchase_id);

  IF v_household IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  v_payer_name := public.purchase_audit_profile_name(coalesce(NEW.member_id, OLD.member_id));
  v_actor_name := public.purchase_audit_profile_name(v_actor);
  v_kind_label := CASE coalesce(NEW.kind, OLD.kind)
    WHEN 'installment' THEN 'cuota(s)'
    WHEN 'payoff' THEN 'desparcializar / contado'
    WHEN 'capital' THEN 'abono a capital'
    ELSE coalesce(NEW.kind, OLD.kind)::text
  END;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_link_count
      FROM public.purchase_payment_installments
     WHERE payment_id = NEW.id;

    v_meta := jsonb_build_object(
      'paid_at', NEW.paid_at,
      'kind', NEW.kind,
      'notes', NEW.notes,
      'member_id', NEW.member_id,
      'member_name', v_payer_name,
      'created_by', NEW.created_by,
      'registered_by_name', v_actor_name,
      'installment_link_count', v_link_count
    );
    v_detail := format(
      'Pago · %s · depositó %s · día %s%s%s',
      v_kind_label,
      coalesce(v_payer_name, 'miembro'),
      NEW.paid_at::text,
      CASE WHEN v_link_count > 0 THEN ' · ' || v_link_count::text || ' cuota(s)' ELSE '' END,
      CASE WHEN NEW.notes IS NOT NULL AND btrim(NEW.notes) <> '' THEN ' · ' || left(btrim(NEW.notes), 80) ELSE '' END
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'created', 'purchase_payment', NEW.id,
      coalesce(v_purchase_name, 'Compra'), NEW.amount, v_purchase_emoji,
      v_detail, NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT count(*) INTO v_link_count
      FROM public.purchase_payment_installments
     WHERE payment_id = NEW.id;

    v_meta := jsonb_build_object(
      'paid_at', NEW.paid_at,
      'kind', NEW.kind,
      'notes', NEW.notes,
      'member_id', NEW.member_id,
      'member_name', v_payer_name,
      'created_by', NEW.created_by,
      'undone_by_name', v_actor_name,
      'original_amount', NEW.amount,
      'installment_link_count', v_link_count
    );
    v_detail := format(
      'Deshacer pago · %s · había depositado %s · día %s · monto %s',
      v_kind_label,
      coalesce(v_payer_name, 'miembro'),
      NEW.paid_at::text,
      NEW.amount::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'undone', 'purchase_payment', NEW.id,
      coalesce(v_purchase_name, 'Compra'), NEW.amount, v_purchase_emoji,
      v_detail, NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_payments_audit_insert
  AFTER INSERT ON public.purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_payments();

CREATE TRIGGER purchase_payments_audit_update
  AFTER UPDATE ON public.purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_payments();

-- -----------------------------------------------------------------------------
-- purchase_installments (mark paid / unpaid / amount changes from capital)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_household uuid;
  v_purchase_name text;
  v_purchase_emoji text;
  v_action public.purchase_audit_action;
  v_detail text;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.household_id, p.name, p.emoji
    INTO v_household, v_purchase_name, v_purchase_emoji
  FROM public.purchases p
  WHERE p.id = NEW.purchase_id;

  IF v_household IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
      v_action := 'marked_paid';
      v_detail := format(
        'Cuota %s marcada pagada · vence %s · día pago %s',
        NEW.installment_number, NEW.due_date::text, NEW.paid_at::text
      );
    ELSIF NEW.paid_at IS NULL AND OLD.paid_at IS NOT NULL THEN
      v_action := 'marked_unpaid';
      v_detail := format(
        'Cuota %s marcada pendiente · vence %s · antes pagada %s',
        NEW.installment_number, NEW.due_date::text, OLD.paid_at::text
      );
    ELSE
      v_action := 'updated';
      v_detail := format(
        'Cuota %s · fecha de pago %s → %s',
        NEW.installment_number, OLD.paid_at::text, NEW.paid_at::text
      );
    END IF;

    v_meta := jsonb_build_object(
      'installment_number', NEW.installment_number,
      'due_date', NEW.due_date,
      'amount', NEW.amount,
      'paid_at_before', OLD.paid_at,
      'paid_at_after', NEW.paid_at
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, v_action, 'purchase_installment', NEW.id,
      coalesce(v_purchase_name, 'Compra') || ' · cuota ' || NEW.installment_number::text,
      NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
    );
  ELSIF NEW.amount IS DISTINCT FROM OLD.amount THEN
    v_meta := jsonb_build_object(
      'installment_number', NEW.installment_number,
      'due_date', NEW.due_date,
      'amount_before', OLD.amount,
      'amount_after', NEW.amount,
      'paid_at', NEW.paid_at
    );
    v_detail := format(
      'Cuota %s · monto %s → %s',
      NEW.installment_number, OLD.amount::text, NEW.amount::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'updated', 'purchase_installment', NEW.id,
      coalesce(v_purchase_name, 'Compra') || ' · cuota ' || NEW.installment_number::text,
      NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_installments_audit_update
  AFTER UPDATE ON public.purchase_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_installments();

-- -----------------------------------------------------------------------------
-- purchase_bonuses
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_bonuses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_household uuid;
  v_purchase_name text;
  v_purchase_emoji text;
  v_purchase_deleted timestamptz;
  v_detail text;
  v_meta jsonb;
  v_type_label text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT p.household_id, p.name, p.emoji, p.deleted_at
    INTO v_household, v_purchase_name, v_purchase_emoji, v_purchase_deleted
  FROM public.purchases p
  WHERE p.id = coalesce(NEW.purchase_id, OLD.purchase_id);

  IF v_household IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Soft-deleting a purchase cascades bonus deletes; keep one purchase-level event.
  IF TG_OP = 'UPDATE'
     AND NEW.deleted_at IS NOT NULL
     AND OLD.deleted_at IS NULL
     AND v_purchase_deleted IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  v_type_label := CASE coalesce(NEW.bonus_type, OLD.bonus_type)
    WHEN 'cashback' THEN 'cashback'
    WHEN 'deferred_discount' THEN 'descuento diferido'
    ELSE coalesce(NEW.bonus_type, OLD.bonus_type)::text
  END;

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'bonus_type', NEW.bonus_type,
      'expected_at', NEW.expected_at,
      'received_at', NEW.received_at,
      'notes', NEW.notes,
      'created_by', NEW.created_by
    );
    v_detail := format('Bonificación · %s · espera %s', v_type_label, NEW.expected_at::text);
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'created', 'purchase_bonus', NEW.id,
      NEW.label, NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_meta := jsonb_build_object(
      'bonus_type', NEW.bonus_type,
      'expected_at', NEW.expected_at,
      'received_at', NEW.received_at,
      'notes', NEW.notes
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'deleted', 'purchase_bonus', NEW.id,
      NEW.label, NEW.amount, v_purchase_emoji, 'Bonificación eliminada', NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    IF NEW.received_at IS NOT NULL AND OLD.received_at IS NULL THEN
      v_detail := format('Bonificación recibida · %s', NEW.received_at::text);
      v_meta := jsonb_build_object(
        'bonus_type', NEW.bonus_type,
        'expected_at', NEW.expected_at,
        'received_at', NEW.received_at
      );
      PERFORM public.insert_purchase_audit_event(
        v_household, v_actor, 'received', 'purchase_bonus', NEW.id,
        NEW.label, NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
      );
    ELSIF NEW.received_at IS NULL AND OLD.received_at IS NOT NULL THEN
      v_detail := format('Bonificación marcada pendiente · antes %s', OLD.received_at::text);
      v_meta := jsonb_build_object(
        'bonus_type', NEW.bonus_type,
        'expected_at', NEW.expected_at,
        'received_at_before', OLD.received_at
      );
      PERFORM public.insert_purchase_audit_event(
        v_household, v_actor, 'unreceived', 'purchase_bonus', NEW.id,
        NEW.label, NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.label IS DISTINCT FROM OLD.label
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.expected_at IS DISTINCT FROM OLD.expected_at
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.bonus_type IS DISTINCT FROM OLD.bonus_type
  THEN
    v_meta := jsonb_build_object(
      'before', jsonb_build_object(
        'label', OLD.label,
        'amount', OLD.amount,
        'expected_at', OLD.expected_at,
        'bonus_type', OLD.bonus_type,
        'notes', OLD.notes
      ),
      'after', jsonb_build_object(
        'label', NEW.label,
        'amount', NEW.amount,
        'expected_at', NEW.expected_at,
        'bonus_type', NEW.bonus_type,
        'notes', NEW.notes
      )
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'updated', 'purchase_bonus', NEW.id,
      NEW.label, NEW.amount, v_purchase_emoji, 'Bonificación editada', NEW.purchase_id, v_meta
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_bonuses_audit_insert
  AFTER INSERT ON public.purchase_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_bonuses();

CREATE TRIGGER purchase_bonuses_audit_update
  AFTER UPDATE ON public.purchase_bonuses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_bonuses();

-- -----------------------------------------------------------------------------
-- payment_cards
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_cards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_detail text;
  v_meta jsonb;
  v_owner_name text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  v_owner_name := public.purchase_audit_profile_name(coalesce(NEW.owner_member_id, OLD.owner_member_id));

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'owner_member_id', NEW.owner_member_id,
      'owner_name', v_owner_name,
      'bank', NEW.bank,
      'last_four', NEW.last_four,
      'cut_day', NEW.cut_day,
      'payment_day', NEW.payment_day
    );
    v_detail := format(
      'Tarjeta · titular %s · corte %s · pago %s',
      coalesce(v_owner_name, 'miembro'),
      NEW.cut_day::text,
      NEW.payment_day::text
    );
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'created', 'payment_card', NEW.id,
      NEW.label, NULL, '💳', v_detail, NULL, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    v_meta := jsonb_build_object(
      'owner_member_id', NEW.owner_member_id,
      'owner_name', v_owner_name,
      'bank', NEW.bank,
      'last_four', NEW.last_four,
      'cut_day', NEW.cut_day,
      'payment_day', NEW.payment_day
    );
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'deleted', 'payment_card', NEW.id,
      NEW.label, NULL, '💳', 'Tarjeta eliminada', NULL, v_meta
    );
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.label IS DISTINCT FROM OLD.label
     OR NEW.bank IS DISTINCT FROM OLD.bank
     OR NEW.last_four IS DISTINCT FROM OLD.last_four
     OR NEW.cut_day IS DISTINCT FROM OLD.cut_day
     OR NEW.payment_day IS DISTINCT FROM OLD.payment_day
     OR NEW.owner_member_id IS DISTINCT FROM OLD.owner_member_id
  THEN
    v_meta := jsonb_build_object(
      'before', jsonb_build_object(
        'label', OLD.label,
        'bank', OLD.bank,
        'last_four', OLD.last_four,
        'cut_day', OLD.cut_day,
        'payment_day', OLD.payment_day,
        'owner_member_id', OLD.owner_member_id
      ),
      'after', jsonb_build_object(
        'label', NEW.label,
        'bank', NEW.bank,
        'last_four', NEW.last_four,
        'cut_day', NEW.cut_day,
        'payment_day', NEW.payment_day,
        'owner_member_id', NEW.owner_member_id
      )
    );
    PERFORM public.insert_purchase_audit_event(
      NEW.household_id, v_actor, 'updated', 'payment_card', NEW.id,
      NEW.label, NULL, '💳', 'Tarjeta editada', NULL, v_meta
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_cards_audit_insert
  AFTER INSERT ON public.payment_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_cards();

CREATE TRIGGER payment_cards_audit_update
  AFTER UPDATE ON public.payment_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_cards();
