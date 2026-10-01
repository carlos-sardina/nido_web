-- Calendar "today" follows the signed-in member, not a fixed Mexico City clock.
--
-- The browser detects an IANA timezone from the request IP (Vercel
-- x-vercel-ip-timezone) and, if that is missing, from the device clock.
-- It stores the result on profiles.timezone. SQL that used to call
-- timezone('America/Mexico_City', now()) now uses that column.
-- Existing rows keep America/Mexico_City until the app syncs.

ALTER TABLE public.profiles
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/Mexico_City';

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA timezone for this member''s calendar day. The app sets it from IP geolocation, then the device clock. America/Mexico_City is only the default before detection.';

CREATE OR REPLACE FUNCTION public.trg_profiles_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.timezone := btrim(NEW.timezone);
  BEGIN
    PERFORM timezone(NEW.timezone, now());
  EXCEPTION
    WHEN invalid_parameter_value THEN
      RAISE EXCEPTION 'nido.invalid_timezone'
        USING ERRCODE = 'P0001';
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_timezone();

CREATE OR REPLACE FUNCTION public.current_profile_timezone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.timezone
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    ),
    'America/Mexico_City'
  );
$$;

COMMENT ON FUNCTION public.current_profile_timezone() IS
  'IANA timezone of the signed-in profile. America/Mexico_City when there is no session or the column is empty.';

REVOKE ALL ON FUNCTION public.current_profile_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_timezone() TO authenticated, service_role;

-- Rewrite live function bodies. Later migrations replaced some of these
-- functions in place, so the source of truth is pg_proc, not an old file.
DO $$
DECLARE
  rec record;
  src text;
  old_expr text := 'timezone(''America/Mexico_City'', now())';
  new_expr text := 'timezone(public.current_profile_timezone(), now())';
BEGIN
  FOR rec IN
    SELECT p.oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND position(old_expr IN p.prosrc) > 0
  LOOP
    src := pg_get_functiondef(rec.oid);
    IF position(old_expr IN src) = 0 THEN
      RAISE EXCEPTION 'Could not patch timezone in %', rec.oid::regprocedure;
    END IF;
    EXECUTE replace(src, old_expr, new_expr);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.nido_today() IS
  'Current calendar date in the caller profile timezone. Falls back to America/Mexico_City. Used to decide whether next_occurrence is due.';

DO $$
DECLARE
  rec record;
  next_comment text;
BEGIN
  FOR rec IN
    SELECT p.oid, obj_description(p.oid, 'pg_proc') AS comment
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND obj_description(p.oid, 'pg_proc') LIKE '%America/Mexico_City%'
      AND p.proname <> 'nido_today'
      AND p.proname <> 'current_profile_timezone'
  LOOP
    next_comment := replace(rec.comment, 'America/Mexico_City', 'profile timezone');
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', rec.oid::regprocedure, next_comment);
  END LOOP;
END $$;
