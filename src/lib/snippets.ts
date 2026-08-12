import { supabase } from "@/integrations/supabase/client";

export type Snippet = {
  id: string;
  title: string;
  language: string;
  code: string;
  icon_name: string | null;
  color: string;
  stroke: number;
  size: number;
  created_at: string;
  updated_at?: string;
};

export type SnippetDraft = Omit<Snippet, "id" | "created_at" | "updated_at">;

const COLUMNS = "id,title,language,code,icon_name,color,stroke,size,created_at,updated_at";

export async function listSnippets(): Promise<Snippet[]> {
  const { data, error } = await supabase
    .from("snippets")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Snippet[];
}

export async function createSnippet(draft: SnippetDraft, userId: string): Promise<Snippet> {
  const { data, error } = await supabase
    .from("snippets")
    .insert({ ...draft, user_id: userId })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Snippet;
}

export async function updateSnippet(id: string, patch: Partial<SnippetDraft>): Promise<Snippet> {
  const { data, error } = await supabase
    .from("snippets")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Snippet;
}

export async function deleteSnippet(id: string): Promise<void> {
  const { error } = await supabase.from("snippets").delete().eq("id", id);
  if (error) throw error;
}
