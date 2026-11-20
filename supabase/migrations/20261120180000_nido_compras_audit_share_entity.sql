-- Add purchase_share to audit entity enum (own migration so the value
-- is committed before functions in the next migration reference it).

ALTER TYPE public.purchase_audit_entity ADD VALUE IF NOT EXISTS 'purchase_share';
