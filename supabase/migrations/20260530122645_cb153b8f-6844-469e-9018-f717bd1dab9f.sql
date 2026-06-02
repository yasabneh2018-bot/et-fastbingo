
CREATE TABLE public.telegram_registrations (
  tg_id BIGINT PRIMARY KEY,
  phone TEXT NOT NULL,
  first_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_registrations TO service_role;

ALTER TABLE public.telegram_registrations ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (used by the bot webhook) can read/write.
