CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  admin_flag boolean := (m->>'phone') = '0941815119';
BEGIN
  IF admin_flag THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, username, phone, balance, referred_by, ref_code, telegram_id, is_admin, first_deposit_done)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(m->>'username', ''), 'user' || substr(NEW.id::text, 1, 6)),
    m->>'phone',
    CASE WHEN admin_flag THEN 0 ELSE 20 END,
    NULLIF(m->>'referred_by', ''),
    NULLIF(m->>'ref_code', ''),
    NULLIF(m->>'telegram_id', '')::bigint,
    admin_flag,
    false
  );
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "kv delete admin" ON public.app_kv;
CREATE POLICY "kv delete shared" ON public.app_kv FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR key IN ('fk_stop_signal','fk_pause_signal','fk_restart_signal','fk_force','fk_force_winner'));