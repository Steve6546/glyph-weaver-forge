type AssistantInput = {
  request: string;
  code: string;
};

export async function runIconAssistant(input: AssistantInput): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The assistant is not configured.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a concise Lucide React icon code assistant. Generate or repair one safe, valid, self-contained lucide-react TSX snippet. Use only a real lucide-react icon component and literal color, size, strokeWidth, and optional absoluteStrokeWidth props. Return code only, without markdown fences or explanation.",
        },
        {
          role: "user",
          content: `Request: ${input.request}\n\nCurrent code:\n${input.code}`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error("The assistant could not process this request.");
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("The assistant returned an empty result.");
  return content.replace(/^```(?:tsx|jsx|typescript|javascript)?\s*/i, "").replace(/\s*```$/, "");
}