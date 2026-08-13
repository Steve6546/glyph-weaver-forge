import { icons as lucideIcons } from "lucide-react";
import { AGENT_SYSTEM_RULES } from "@/lib/agent-rules";

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_STEPS = 4;

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
};

export type AssistantResult = {
  summary: string;
  steps: string[];
  code: string;
  iconName: string | null;
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
          ? json.steps.filter((s): s is string => typeof s === "string").slice(0, 4)
          : [],
        code: stripFences(json.code),
        iconName: typeof json.iconName === "string" ? json.iconName : null,
      };
    }
  } catch {
    // fall through to raw-code handling
  }
  return { summary: "Updated the code.", steps: [], code: text, iconName: null };
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
  const userText = [
    `Request: ${input.request}`,
    context
      ? `Current settings: color ${context.color}, size ${context.size}px, stroke ${context.stroke}.`
      : "",
    `Current editor code:\n${input.code.slice(0, 6000)}`,
    input.imageDataUrl ? "An image reference is attached; base the icon on its silhouette." : "",
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
    { role: "system", content: AGENT_SYSTEM_RULES },
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
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result =
          call.function.name === "search_lucide_icons"
            ? searchIcons(String((args as { query?: string }).query ?? ""))
            : summarizeLibrary(input.library);
      } catch {
        result = { error: "Invalid tool arguments." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error("The agent used too many steps without producing an icon.");
}
