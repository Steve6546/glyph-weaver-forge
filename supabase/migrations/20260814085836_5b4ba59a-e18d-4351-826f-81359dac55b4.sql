CREATE TABLE public.agent_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  design_rules TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'lucide-outline',
  default_color TEXT NOT NULL DEFAULT '#ffffff',
  default_stroke NUMERIC NOT NULL DEFAULT 2,
  default_size INTEGER NOT NULL DEFAULT 160,
  corner_radius NUMERIC NOT NULL DEFAULT 2,
  complexity INTEGER NOT NULL DEFAULT 3,
  allow_layers BOOLEAN NOT NULL DEFAULT true,
  allow_multicolor BOOLEAN NOT NULL DEFAULT false,
  transparent_background BOOLEAN NOT NULL DEFAULT true,
  edit_plan TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'auto',
  memory_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_settings TO authenticated;
GRANT ALL ON public.agent_settings TO service_role;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own agent settings" ON public.agent_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.agent_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX agent_memory_user_created_idx ON public.agent_memory (user_id, created_at DESC);
CREATE INDEX agent_memory_expires_idx ON public.agent_memory (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own agent memory" ON public.agent_memory
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.purge_expired_agent_memory()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.agent_memory WHERE expires_at < now();
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_agent_memory() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_agent_settings_updated_at BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();