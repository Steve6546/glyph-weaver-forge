import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runIconAssistant } from "@/lib/icon-assistant.server";

const schema = z.object({
  request: z.string().trim().min(2).max(800),
  code: z.string().max(20_000),
  imageDataUrl: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/)
    .optional(),
  library: z
    .array(
      z.object({
        title: z.string().max(120),
        iconName: z.string().max(80).nullable(),
        code: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  context: z
    .object({ color: z.string().max(32), size: z.number(), stroke: z.number() })
    .optional(),
});

export const assistIconCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => runIconAssistant(data));
