-- =============================================================================
-- Compras a plazos — audit full coverage
--
-- Requires 20261120180000_nido_compras_audit_share_entity (purchase_share enum).
--
-- Gaps closed:
--   • purchase_shares create/delete/update
--   • purchase_installments INSERT / DELETE / due_date changes
--   • soft_delete_purchase_payment soft-deletes payment WHILE links still exist
--     so undone audit captures installment_link_count correctly
--   • Explicit deny of INSERT/UPDATE/DELETE for authenticated on audit table
-- =============================================================================

-- -----------------------------------------------------------------------------
-- soft_delete_purchase_payment: soft-delete first, then revert, then drop links
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_payment(
  p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household uuid;
  v_deleted timestamptz;
  v_link record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'nido.unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.household_id, pp.deleted_at
    INTO v_household, v_deleted
    FROM public.purchase_payments pp
    JOIN public.purchases p ON p.id = pp.purchase_id
   WHERE pp.id = p_payment_id;

  IF v_household IS NULL THEN
    RAISE EXCEPTION 'nido.purchase_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_deleted IS NOT NULL THEN
    RETURN p_payment_id;
  END IF;
  IF NOT public.is_active_household_member(v_household) THEN
    RAISE EXCEPTION 'nido.not_a_member' USING ERRCODE = 'P0001';
  END IF;

  -- Soft-delete while links still exist so the undone audit sees link_count.
  UPDATE public.purchase_payments
     SET deleted_at = now()
   WHERE id = p_payment_id;

  FOR v_link IN
    SELECT installment_id, applied_amount, reduced_remaining
      FROM public.purchase_payment_installments
     WHERE payment_id = p_payment_id
  LOOP
    IF v_link.reduced_remaining THEN
      UPDATE public.purchase_installments
         SET amount = round(amount + v_link.applied_amount, 2)
       WHERE id = v_link.installment_id;
    ELSE
      UPDATE public.purchase_installments pi
         SET paid_at = NULL
       WHERE pi.id = v_link.installment_id
         AND NOT EXISTS (
               SELECT 1
                 FROM public.purchase_payment_installments ppi
                 JOIN public.purchase_payments pp ON pp.id = ppi.payment_id
                WHERE ppi.installment_id = pi.id
                  AND ppi.payment_id <> p_payment_id
                  AND pp.deleted_at IS NULL
                  AND ppi.reduced_remaining = false
             );
    END IF;
  END LOOP;

  DELETE FROM public.purchase_payment_installments WHERE payment_id = p_payment_id;

  RETURN p_payment_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- purchase_installments: INSERT / UPDATE / DELETE
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
  v_purchase_deleted timestamptz;
  v_action public.purchase_audit_action;
  v_detail text;
  v_meta jsonb;
  v_row public.purchase_installments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  SELECT p.household_id, p.name, p.emoji, p.deleted_at
    INTO v_household, v_purchase_name, v_purchase_emoji, v_purchase_deleted
  FROM public.purchases p
  WHERE p.id = v_row.purchase_id;

  IF v_household IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Soft-deleting a purchase does not touch installments; no cascade suppress needed.
  -- Regenerating the plan (replace_purchase_installments) hard-deletes + inserts.

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'installment_number', NEW.installment_number,
      'due_date', NEW.due_date,
      'amount', NEW.amount,
      'paid_at', NEW.paid_at
    );
    v_detail := format(
      'Cuota %s creada · vence %s · monto %s%s',
      NEW.installment_number,
      NEW.due_date::text,
      NEW.amount::text,
      CASE WHEN NEW.paid_at IS NOT NULL THEN ' · ya pagada ' || NEW.paid_at::text ELSE '' END
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'created', 'purchase_installment', NEW.id,
      coalesce(v_purchase_name, 'Compra') || ' · cuota ' || NEW.installment_number::text,
      NEW.amount, v_purchase_emoji, v_detail, NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_meta := jsonb_build_object(
      'installment_number', OLD.installment_number,
      'due_date', OLD.due_date,
      'amount', OLD.amount,
      'paid_at', OLD.paid_at,
      'reason', CASE
        WHEN v_purchase_deleted IS NOT NULL THEN 'purchase_deleted'
        ELSE 'plan_regenerated_or_removed'
      END
    );
    v_detail := format(
      'Cuota %s eliminada · vencía %s · monto %s',
      OLD.installment_number, OLD.due_date::text, OLD.amount::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'deleted', 'purchase_installment', OLD.id,
      coalesce(v_purchase_name, 'Compra') || ' · cuota ' || OLD.installment_number::text,
      OLD.amount, v_purchase_emoji, v_detail, OLD.purchase_id, v_meta
    );
    RETURN OLD;
  END IF;

  -- UPDATE
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
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
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

  IF NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
  THEN
    v_meta := jsonb_build_object(
      'before', jsonb_build_object(
        'installment_number', OLD.installment_number,
        'due_date', OLD.due_date,
        'amount', OLD.amount
      ),
      'after', jsonb_build_object(
        'installment_number', NEW.installment_number,
        'due_date', NEW.due_date,
        'amount', NEW.amount
      )
    );
    v_detail := format(
      'Cuota %s · plan %s/%s → %s/%s',
      NEW.installment_number,
      OLD.installment_number::text, OLD.due_date::text,
      NEW.installment_number::text, NEW.due_date::text
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

DROP TRIGGER IF EXISTS purchase_installments_audit_update ON public.purchase_installments;
DROP TRIGGER IF EXISTS purchase_installments_audit_insert ON public.purchase_installments;
DROP TRIGGER IF EXISTS purchase_installments_audit_delete ON public.purchase_installments;

CREATE TRIGGER purchase_installments_audit_insert
  AFTER INSERT ON public.purchase_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_installments();

CREATE TRIGGER purchase_installments_audit_update
  AFTER UPDATE ON public.purchase_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_installments();

CREATE TRIGGER purchase_installments_audit_delete
  AFTER DELETE ON public.purchase_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_installments();

-- -----------------------------------------------------------------------------
-- purchase_shares
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_purchase_audit_shares()
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
  v_member_name text;
  v_detail text;
  v_meta jsonb;
  v_row public.purchase_shares%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  SELECT p.household_id, p.name, p.emoji, p.deleted_at
    INTO v_household, v_purchase_name, v_purchase_emoji, v_purchase_deleted
  FROM public.purchases p
  WHERE p.id = v_row.purchase_id;

  IF v_household IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Soft-delete purchase does not touch shares; hard CASCADE only on hard delete.
  IF TG_OP = 'DELETE' AND v_purchase_deleted IS NOT NULL THEN
    RETURN OLD;
  END IF;

  v_member_name := public.purchase_audit_profile_name(v_row.member_id);

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'member_id', NEW.member_id,
      'member_name', v_member_name,
      'percent', NEW.percent
    );
    v_detail := format(
      'Participación · %s · %s%%',
      coalesce(v_member_name, 'miembro'),
      NEW.percent::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'created', 'purchase_share', NEW.id,
      coalesce(v_purchase_name, 'Compra'), NULL, v_purchase_emoji,
      v_detail, NEW.purchase_id, v_meta
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_meta := jsonb_build_object(
      'member_id', OLD.member_id,
      'member_name', v_member_name,
      'percent', OLD.percent
    );
    v_detail := format(
      'Participación eliminada · %s · era %s%%',
      coalesce(v_member_name, 'miembro'),
      OLD.percent::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'deleted', 'purchase_share', OLD.id,
      coalesce(v_purchase_name, 'Compra'), NULL, v_purchase_emoji,
      v_detail, OLD.purchase_id, v_meta
    );
    RETURN OLD;
  END IF;

  IF NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.percent IS DISTINCT FROM OLD.percent
  THEN
    v_meta := jsonb_build_object(
      'before', jsonb_build_object(
        'member_id', OLD.member_id,
        'percent', OLD.percent
      ),
      'after', jsonb_build_object(
        'member_id', NEW.member_id,
        'member_name', v_member_name,
        'percent', NEW.percent
      )
    );
    v_detail := format(
      'Participación editada · %s · %s%% → %s%%',
      coalesce(v_member_name, 'miembro'),
      OLD.percent::text,
      NEW.percent::text
    );
    PERFORM public.insert_purchase_audit_event(
      v_household, v_actor, 'updated', 'purchase_share', NEW.id,
      coalesce(v_purchase_name, 'Compra'), NULL, v_purchase_emoji,
      v_detail, NEW.purchase_id, v_meta
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_shares_audit_insert ON public.purchase_shares;
DROP TRIGGER IF EXISTS purchase_shares_audit_update ON public.purchase_shares;
DROP TRIGGER IF EXISTS purchase_shares_audit_delete ON public.purchase_shares;

CREATE TRIGGER purchase_shares_audit_insert
  AFTER INSERT ON public.purchase_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_shares();

CREATE TRIGGER purchase_shares_audit_update
  AFTER UPDATE ON public.purchase_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_shares();

CREATE TRIGGER purchase_shares_audit_delete
  AFTER DELETE ON public.purchase_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_audit_shares();

-- -----------------------------------------------------------------------------
-- Read-only enforcement for clients (append-only via triggers only)
-- -----------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.purchase_audit_events
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS purchase_audit_events_no_insert ON public.purchase_audit_events;
DROP POLICY IF EXISTS purchase_audit_events_no_update ON public.purchase_audit_events;
DROP POLICY IF EXISTS purchase_audit_events_no_delete ON public.purchase_audit_events;

CREATE POLICY purchase_audit_events_no_insert
  ON public.purchase_audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY purchase_audit_events_no_update
  ON public.purchase_audit_events
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY purchase_audit_events_no_delete
  ON public.purchase_audit_events
  FOR DELETE
  TO authenticated
  USING (false);

COMMENT ON TABLE public.purchase_audit_events IS
  'Append-only audit log for compras a plazos. Triggers write via SECURITY DEFINER; clients SELECT only — create/edit/undo/delete/receive/mark paid all leave permanent rows.';
