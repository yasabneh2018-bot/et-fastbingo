CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE SEQUENCE public.profile_seq;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  phone text,
  balance numeric NOT NULL DEFAULT 0,
  seq integer NOT NULL DEFAULT nextval('public.profile_seq'),
  games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  referred_by text,
  first_deposit_done boolean NOT NULL DEFAULT false,
  ref_code text,
  telegram_id bigint,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "update own or admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Users cannot grant themselves admin via the profile flag
CREATE OR REPLACE FUNCTION public.protect_profile_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_admin := public.has_role(NEW.id, 'admin');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin();

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
    COALESCE((m->>'balance')::numeric, 0),
    NULLIF(m->>'referred_by', ''),
    NULLIF(m->>'ref_code', ''),
    NULLIF(m->>'telegram_id', '')::bigint,
    admin_flag,
    false
  );
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Referral credit without exposing other players' data
CREATE OR REPLACE FUNCTION public.credit_referrer(_ref text, _amount numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname text;
BEGIN
  IF auth.uid() IS NULL OR _amount <= 0 OR _amount > 50 THEN RETURN NULL; END IF;
  UPDATE public.profiles SET balance = balance + _amount
   WHERE (username = _ref OR ref_code = _ref) AND id <> auth.uid()
   RETURNING username INTO uname;
  RETURN uname;
END $$;
GRANT EXECUTE ON FUNCTION public.credit_referrer(text, numeric) TO authenticated;

-- Shared game/app state (signals, settings, history, chat, requests)
CREATE TABLE public.app_kv (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_kv TO authenticated;
GRANT ALL ON public.app_kv TO service_role;
ALTER TABLE public.app_kv ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kv read" ON public.app_kv FOR SELECT TO authenticated USING (true);
CREATE POLICY "kv write shared" ON public.app_kv FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR key IN ('fk_tx','fk_history','fk_chat','fk_activity','fk_coupons','fk_profit','fk_stop_signal','fk_pause_signal','fk_resume_signal','fk_restart_signal'));
CREATE POLICY "kv update shared" ON public.app_kv FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR key IN ('fk_tx','fk_history','fk_chat','fk_activity','fk_coupons','fk_profit','fk_stop_signal','fk_pause_signal','fk_resume_signal','fk_restart_signal'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR key IN ('fk_tx','fk_history','fk_chat','fk_activity','fk_coupons','fk_profit','fk_stop_signal','fk_pause_signal','fk_resume_signal','fk_restart_signal'));
CREATE POLICY "kv delete admin" ON public.app_kv FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR key IN ('fk_stop_signal','fk_pause_signal','fk_restart_signal'));

-- Live presence
CREATE TABLE public.presence (
  username text PRIMARY KEY,
  user_id uuid NOT NULL,
  stake numeric NOT NULL DEFAULT 0,
  joined boolean NOT NULL DEFAULT false,
  game_no integer NOT NULL DEFAULT 0,
  at bigint NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO authenticated;
GRANT ALL ON public.presence TO service_role;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence read" ON public.presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "presence own insert" ON public.presence FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "presence own update" ON public.presence FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "presence own delete" ON public.presence FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_kv;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;