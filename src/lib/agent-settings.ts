import { supabase } from "@/integrations/supabase/client";

export type AgentStyle =
  | "lucide-outline"
  | "rounded-soft"
  | "geometric-sharp"
  | "duotone"
  | "filled-solid"
  | "hand-drawn";

export type AgentSettings = {
  design_rules: string;
  style: AgentStyle;
  default_color: string;
  default_stroke: number;
  default_size: number;
  corner_radius: number;
  /** 1 = ultra minimal, 5 = highly detailed multi-layer artwork. */
  complexity: number;
  allow_layers: boolean;
  allow_multicolor: boolean;
  transparent_background: boolean;
  edit_plan: string;
  language: string;
  memory_enabled: boolean;
};

export const STYLE_OPTIONS: Array<{ value: AgentStyle; label: string; hint: string }> = [
  { value: "lucide-outline", label: "Lucide outline", hint: "24-grid, uniform 2px stroke" },
  { value: "rounded-soft", label: "Rounded soft", hint: "Generous radii, friendly curves" },
  { value: "geometric-sharp", label: "Geometric sharp", hint: "Rigid angles, 45° discipline" },
  { value: "duotone", label: "Duotone", hint: "Outline plus one tinted fill layer" },
  { value: "filled-solid", label: "Filled solid", hint: "Solid silhouettes, no strokes" },
  { value: "hand-drawn", label: "Hand drawn", hint: "Slightly irregular, organic paths" },
];

export const DEFAULT_SETTINGS: AgentSettings = {
  design_rules: "",
  style: "lucide-outline",
  default_color: "#ffffff",
  default_stroke: 2,
  default_size: 160,
  corner_radius: 2,
  complexity: 3,
  allow_layers: true,
  allow_multicolor: false,
  transparent_background: true,
  edit_plan: "",
  language: "auto",
  memory_enabled: true,
};

const COLUMNS =
  "design_rules,style,default_color,default_stroke,default_size,corner_radius,complexity,allow_layers,allow_multicolor,transparent_background,edit_plan,language,memory_enabled";

export async function loadAgentSettings(): Promise<AgentSettings> {
  const { data, error } = await supabase.from("agent_settings").select(COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(data as Partial<AgentSettings>) };
}

export async function saveAgentSettings(
  patch: Partial<AgentSettings>,
  userId: string,
): Promise<AgentSettings> {
  const { data, error } = await supabase
    .from("agent_settings")
    .upsert({ ...DEFAULT_SETTINGS, ...patch, user_id: userId }, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return { ...DEFAULT_SETTINGS, ...(data as Partial<AgentSettings>) };
}
