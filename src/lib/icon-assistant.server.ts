import { icons as lucideIcons } from "lucide-react";
import { buildSystemRules, type AgentPreferences } from "@/lib/agent-rules";

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_STEPS = 6;

const toKebab = (pascal: string) =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

const ICON_INDEX = Object.keys(lucideIcons).map((pascal) => ({ pascal, name: toKebab(pascal) }));

export type LibraryExample = {
  title: string;
  iconName: string | null;
  code: string;
};

export type AssistantInput = {
  request: string;
  code: string;
  imageDataUrl?: string | undefined;
  library?: LibraryExample[] | undefined;
  context?: { color: string; size: number; stroke: number } | undefined;
  settings?: Partial<AgentPreferences> | undefined;
  memory?: Array<{ role: string; content: string }> | undefined;
};

export type AssistantResult = {
  summary: string;
  steps: string[];
  code: string;
  iconName: string | null;
  notes: string | null;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_lucide_icons",
      description:
        "Search the installed lucide-react icon set by keyword. Use it to confirm a component name exists before writing code.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword, e.g. camera, arrow, shield" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspect_library",
      description:
        "Read the design conventions of the icons the user already saved in their library, to stay consistent.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_design_settings",
      description:
        "Read the user's saved design settings: style, colour, stroke, size, complexity, layer and colour permissions, custom rules and standing edit plan.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "recall_memory",
      description:
        "Read the user's short-term (24h) memory notes so this design stays consistent with earlier decisions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_image_brief",
      description:
        "Lock a replication plan for the attached reference image before drawing. Returns the geometry checklist to follow.",
      parameters: {
        type: "object",
        properties: {
          silhouette: { type: "string", description: "Overall outer shape in a few words" },
          colors: {
            type: "array",
            items: { type: "string" },
            description: "Dominant colours as hex values",
          },
          shapes: {
            type: "array",
            items: { type: "string" },
            description: "Primitive shapes that reconstruct the subject",
          },
          outline: {
            type: "string",
            description: "Outline character: thin, thick, filled, mixed",
          },
        },
        required: ["silhouette"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "plan_layers",
      description:
        "Declare the layer stack for a complex icon before writing SVG. Returns grid and spacing guidance for that stack.",
      parameters: {
        type: "object",
        properties: {
          layers: {
            type: "array",
            items: { type: "string" },
            description: "Layer names from back to front, e.g. base, detail, accent",
          },
          viewBox: { type: "string", description: "Chosen viewBox, e.g. 0 0 24 24" },
        },
        required: ["layers"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_svg",
      description:
        "Check a draft SVG string for the studio's safety and geometry rules before returning it.",
      parameters: {
        type: "object",
        properties: { svg: { type: "string" } },
        required: ["svg"],
      },
    },
  },
] as const;

function searchIcons(query: string) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  const hits = (q ? ICON_INDEX.filter((i) => i.name.includes(q)) : ICON_INDEX).slice(0, 40);
  return { count: hits.length, icons: hits.map((i) => ({ component: i.pascal, name: i.name })) };
}

function summarizeLibrary(library: LibraryExample[] | undefined) {
  if (!library?.length) return { count: 0, examples: [] as LibraryExample[] };
  return {
    count: library.length,
    examples: library.slice(0, 12).map((item) => ({
      title: item.title,
      iconName: item.iconName,
      code: item.code.slice(0, 400),
    })),
  };
}

function imageBrief(args: Record<string, unknown>) {
  return {
    accepted: true,
    plan: args,
    checklist: [
      "Rebuild the silhouette first as one closed path",
      "Place interior shapes on whole or half grid units",
      "Keep the outline weight uniform across the whole glyph",
      "Match the dominant colours; drop photographic noise",
      "Preserve orientation, proportion and negative space",
      "Verify the result reads at 16px before returning",
    ],
  };
}

function planLayers(args: { layers?: string[]; viewBox?: string }) {
  const layers = (args.layers ?? []).slice(0, 8);
  return {
    layers,
    viewBox: args.viewBox ?? "0 0 24 24",
    guidance: [
      "Wrap each layer in <g data-layer=\"name\"> so it stays editable",
      "Back layers carry the mass, front layers carry the detail",
      "Stroke hierarchy: base 2, secondary 1.5, accents 1",
      "Keep at least 2 units of clearance between adjacent strokes",
    ],
  };
}

const FORBIDDEN = /<\s*(script|foreignObject|iframe|object|embed|image)\b|on[a-z]+\s*=|javascript:/i;

function validateSvg(svg: string) {
  const issues: string[] = [];
  if (!/<svg[\s\S]*<\/svg>/i.test(svg)) issues.push("Not a complete <svg> element.");
  if (FORBIDDEN.test(svg)) issues.push("Contains a forbidden element, handler or URL.");
  if (!/viewBox\s*=/.test(svg)) issues.push("Missing a viewBox.");
  if (svg.replace(/\s/g, "").length < 60) issues.push("The artwork looks empty.");
  if (/<image\b/i.test(svg)) issues.push("Raster <image> is not allowed.");
  return { valid: issues.length === 0, issues };
}

function stripFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json|tsx|jsx|typescript|javascript|html|svg)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseResult(raw: string): AssistantResult {
  const text = stripFences(raw);
  try {
    const json = JSON.parse(text) as Partial<AssistantResult>;
    if (typeof json.code === "string" && json.code.trim()) {
      return {
        summary: (json.summary ?? "Done.").toString().slice(0, 160),
        steps: Array.isArray(json.steps)
          ? json.steps.filter((s): s is string => typeof s === "string").slice(0, 5)
          : [],
        code: stripFences(json.code),
        iconName: typeof json.iconName === "string" ? json.iconName : null,
        notes: typeof json.notes === "string" ? json.notes.slice(0, 400) : null,
      };
    }
  } catch {
    // fall through to raw-code handling
  }
  return { summary: "Updated the code.", steps: [], code: text, iconName: null, notes: null };
}

async function callGateway(apiKey: string, messages: ChatMessage[]) {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto" }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new Error("Too many requests — try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`The agent request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
}

export async function runIconAssistant(input: AssistantInput): Promise<AssistantResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The agent is not configured.");

  const context = input.context;
  const memory = input.memory ?? [];
  const userText = [
    `Request: ${input.request}`,
    context
      ? `Current settings: color ${context.color}, size ${context.size}px, stroke ${context.stroke}.`
      : "",
    memory.length
      ? `Memory from the last 24h:\n${memory
          .slice(0, 12)
          .map((m) => `- (${m.role}) ${m.content}`)
          .join("\n")}`
      : "",
    `Current editor code:\n${input.code.slice(0, 6000)}`,
    input.imageDataUrl
      ? "An image reference is attached. Call analyze_image_brief first, then replicate it as faithfully as the grid allows."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = input.imageDataUrl
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ]
    : userText;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemRules(input.settings) },
    { role: "user", content: userContent },
  ];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const body = await callGateway(apiKey, messages);
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("The agent returned an empty response.");

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const content = message.content?.trim();
      if (!content) throw new Error("The agent returned an empty result.");
      return parseResult(content);
    }

    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      let result: unknown;
      try {
        const args = (call.function.arguments ? JSON.parse(call.function.arguments) : {}) as Record<
          string,
          unknown
        >;
        switch (call.function.name) {
          case "search_lucide_icons":
            result = searchIcons(String(args["query"] ?? ""));
            break;
          case "inspect_library":
            result = summarizeLibrary(input.library);
            break;
          case "read_design_settings":
            result = input.settings ?? { note: "No saved settings; use the defaults." };
            break;
          case "recall_memory":
            result = { count: memory.length, memory: memory.slice(0, 12) };
            break;
          case "analyze_image_brief":
            result = imageBrief(args);
            break;
          case "plan_layers":
            result = planLayers(args as { layers?: string[]; viewBox?: string });
            break;
          case "validate_svg":
            result = validateSvg(String(args["svg"] ?? ""));
            break;
          default:
            result = { error: `Unknown tool ${call.function.name}` };
        }
      } catch {
        result = { error: "Invalid tool arguments." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error("The agent used too many steps without producing an icon.");
}
