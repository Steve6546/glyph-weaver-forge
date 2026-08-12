CREATE TABLE public.snippets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  language TEXT NOT NULL DEFAULT 'markup',
  code TEXT NOT NULL DEFAULT '',
  icon_name TEXT,
  color TEXT NOT NULL DEFAULT '#ffffff',
  stroke NUMERIC NOT NULL DEFAULT 2,
  size INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.snippets TO authenticated;
GRANT ALL ON public.snippets TO service_role;

ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own snippets"
ON public.snippets FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX snippets_user_created_idx ON public.snippets (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_snippets_updated_at
BEFORE UPDATE ON public.snippets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();