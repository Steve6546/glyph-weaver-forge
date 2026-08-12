import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runIconAssistant } from "@/lib/icon-assistant.server";

export const assistIconCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ request: z.string().trim().min(2).max(500), code: z.string().max(20_000) }).parse(input),
  )
  .handler(async ({ data }) => ({ code: await runIconAssistant(data) }));