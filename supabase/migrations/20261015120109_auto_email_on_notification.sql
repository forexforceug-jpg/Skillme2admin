-- Auto-email trigger for notifications
-- Whenever a row is inserted into public.notifications, call the
-- send-admin-email Edge Function with the recipient's email.
--
-- Requires the pg_net extension and the Supabase project URL + anon key
-- to be stored in Postgres settings. Set them once with:
--
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://yymywvqceswtdqiodhbk.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
--
-- (Do this in the Supabase SQL editor; the service role key never leaves the DB.)

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email    text;
  v_name     text;
  v_url      text;
  v_key      text;
BEGIN
  -- Only send when the notification is new and has a recipient
  IF NEW.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the recipient
  SELECT email, name INTO v_email, v_name
  FROM public.profiles
  WHERE id = NEW.profile_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip the email if the user has no email on file
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Pull project settings from the database config
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'app.settings.supabase_url or service_role_key not set; skipping email';
    RETURN NEW;
  END IF;

  -- Fire and forget: pg_net is async, so this does not block the insert
  PERFORM extensions.http_post(
    url     := v_url || '/functions/v1/send-admin-email',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'to',      v_email,
                 'toName',  COALESCE(v_name, v_email),
                 'subject', COALESCE(NEW.title, 'Skillme2 notification'),
                 'body',    COALESCE(NEW.body, '')
               )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_user_email ON public.notifications;

CREATE TRIGGER trg_notify_user_email
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_email();
