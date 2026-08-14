import { supabase } from "@/integrations/supabase/client";

/**
 * Short-term agent memory. Rows carry a 24h `expires_at`; expired rows are
 * pruned opportunistically on every read so context never goes stale.
 */
export type MemoryRow = {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function rememberFact(
  userId: string,
  content: string,
  role = "note",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!content.trim()) return;
  await supabase.from("agent_memory").insert({
    user_id: userId,
    role,
    content: content.slice(0, 4000),
    metadata,
  });
}

export async function recallMemory(limit = 12): Promise<MemoryRow[]> {
  await supabase.from("agent_memory").delete().lt("expires_at", new Date().toISOString());
  const { data, error } = await supabase
    .from("agent_memory")
    .select("id,role,content,metadata,created_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as MemoryRow[];
}

export async function clearMemory(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) return;
  await supabase.from("agent_memory").delete().eq("user_id", id);
}
