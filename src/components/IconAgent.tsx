import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Brain,
  ImagePlus,
  Loader2,
  Settings,
  Sparkles,
  Wand2,
  X,
  icons as lucideIcons,
} from "lucide-react";

import { assistIconCode } from "@/lib/icon-assistant.functions";
import { DESIGN_CHECKLIST } from "@/lib/agent-rules";
import { listSnippets } from "@/lib/snippets";
import { parseCode } from "@/lib/icon-code";
import { DEFAULT_SETTINGS, loadAgentSettings, type AgentSettings } from "@/lib/agent-settings";
import { recallMemory, rememberFact } from "@/lib/agent-memory";

type Turn = {
  id: string;
  request: string;
  summary: string;
  steps: string[];
  hadImage: boolean;
  code: string;
};

type Props = {
  code: string;
  color: string;
  size: number;
  stroke: number;
  onApply: (code: string) => void;
  enabled: boolean;
  open: boolean;
  onClose: () => void;
  onSave?: (code: string) => Promise<void> | void;
  userId?: string | undefined;
};

const PROMPTS = [
  "A minimal rocket icon",
  "Make the stroke lighter and rounder",
  "Turn this into a layered shield with a check",
  "Redraw this as a complex filament pattern",
  "Fix the broken code",
];

const IMAGE_PROMPT =
  "Replicate this reference image as an icon: match its silhouette, colours, shape count and outline weight as closely as the grid allows.";

export default function IconAgent({
  code,
  color,
  size,
  stroke,
  onApply,
  enabled,
  open,
  onClose,
  onSave,
  userId,
}: Props) {
  const run = useServerFn(assistIconCode);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [memoryCount, setMemoryCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const parsedPreview = generatedCode
    ? parseCode(generatedCode, { pascal: "Camera", color, size, stroke, absolute: false })
    : null;
  const PreviewIcon =
    parsedPreview?.kind === "icon"
      ? lucideIcons[parsedPreview.spec.pascal as keyof typeof lucideIcons]
      : null;

  useEffect(() => {
    if (!open || !enabled) return;
    inputRef.current?.focus();
    void (async () => {
      try {
        const [loaded, memory] = await Promise.all([loadAgentSettings(), recallMemory(12)]);
        setSettings(loaded);
        setMemoryCount(memory.length);
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    })();
  }, [open, enabled]);

  const attach = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4_000_000) {
      setError("That image is larger than 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage({ dataUrl: String(reader.result), name: file.name });
      // Suggest a replication brief so the user does not have to write one.
      setRequest((prev) => (prev.trim() ? prev : IMAGE_PROMPT));
    };
    reader.readAsDataURL(file);
  };

  /** Applying pushes the generated code straight into the editor as the single
   * source of truth, so clicking the result can never desync the studio state. */
  const applyToEditor = useCallback(
    (next: string) => {
      setGeneratedCode(next);
      onApply(next);
    },
    [onApply],
  );

  const send = async () => {
    const prompt = request.trim();
    if (prompt.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      let library: Array<{ title: string; iconName: string | null; code: string }> = [];
      try {
        library = (await listSnippets()).slice(0, 12).map((s) => ({
          title: s.title,
          iconName: s.icon_name,
          code: s.code.slice(0, 1500),
        }));
      } catch {
        library = [];
      }

      let memory: Array<{ role: string; content: string }> = [];
      if (settings.memory_enabled) {
        try {
          memory = (await recallMemory(12)).map((m) => ({ role: m.role, content: m.content }));
          setMemoryCount(memory.length);
        } catch {
          memory = [];
        }
      }

      const { memory_enabled: _memoryEnabled, ...prefs } = settings;

      const result = await run({
        data: {
          request: prompt,
          code,
          ...(image ? { imageDataUrl: image.dataUrl } : {}),
          library,
          context: { color, size, stroke },
          settings: prefs,
          memory,
        },
      });

      applyToEditor(result.code);
      setTurns((prev) => [
        {
          id: crypto.randomUUID(),
          request: prompt,
          summary: result.summary,
          steps: result.steps,
          hadImage: Boolean(image),
          code: result.code,
        },
        ...prev,
      ]);
      setRequest("");
      setImage(null);

      if (settings.memory_enabled && userId) {
        void rememberFact(userId, result.notes ?? `${prompt} → ${result.summary}`, "task", {
          iconName: result.iconName,
        }).then(() => setMemoryCount((c) => c + 1));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The agent could not complete this task.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-studio-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Glyph Agent"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-studio-line bg-studio-panel px-5 py-4">
        <Sparkles size={16} className="text-studio-accent" />
        <div>
          <h1 className="text-base font-semibold">Glyph Agent</h1>
          <p className="text-xs text-studio-muted">
            {settings.style} · complexity {settings.complexity}/5 ·{" "}
            {settings.memory_enabled ? `${memoryCount} memories` : "memory off"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-studio-line px-3 py-2 text-sm text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
          >
            <Settings size={16} /> <span className="hidden sm:inline">Settings</span>
          </Link>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-studio-line px-3 py-2 text-sm font-medium text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
          >
            <X size={16} /> <span>Back to Studio</span>
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="min-w-0 overflow-y-auto pr-1">
          {!enabled ? (
            <p className="text-sm text-studio-muted">Sign in to use the agent.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setRequest(p)}
                    className="rounded-full border border-studio-line px-3 py-1 text-xs text-studio-muted transition-colors hover:bg-studio-elevated hover:text-studio-text"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-studio-line bg-studio-elevated p-2">
                <textarea
                  ref={inputRef}
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  maxLength={800}
                  placeholder="Describe an icon in any language, attach a reference image, or ask for a fix…"
                  className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none"
                />
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => attach(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    aria-label="Attach reference image"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-studio-line px-2.5 py-1.5 text-xs text-studio-muted transition-colors hover:bg-studio-panel hover:text-studio-text"
                  >
                    <ImagePlus size={14} /> Image
                  </button>
                  {image && (
                    <span className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-lg bg-studio-panel px-2 py-1 text-xs">
                      <img src={image.dataUrl} alt="" className="size-4 rounded object-cover" />
                      <span className="truncate">{image.name}</span>
                      <button onClick={() => setImage(null)} aria-label="Remove image">
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={send}
                    disabled={busy || request.trim().length < 2}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    {busy ? "Thinking…" : "Run"}
                  </button>
                </div>
              </div>

              {image && (
                <button
                  onClick={() => setRequest(IMAGE_PROMPT)}
                  className="mt-2 w-full rounded-xl border border-dashed border-studio-line px-3 py-2 text-left text-xs text-studio-muted hover:bg-studio-elevated"
                >
                  Suggested brief: {IMAGE_PROMPT}
                </button>
              )}

              {busy && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-studio-line bg-studio-elevated px-3 py-2 text-xs text-studio-muted">
                  <Loader2 size={13} className="animate-spin" />
                  Reading your rules, memory and library, planning layers, drawing on the grid…
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-xl border border-studio-accent/60 bg-studio-elevated px-3 py-2 text-xs text-studio-accent">
                  {error}
                </p>
              )}

              {generatedCode && (
                <div className="mt-4 rounded-xl border border-studio-line bg-studio-elevated p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      Applied to the editor — edit it live below
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onApply(generatedCode);
                          onClose();
                        }}
                        className="rounded-lg bg-studio-accent px-3 py-1.5 text-xs font-semibold"
                      >
                        Open in studio
                      </button>
                      {onSave && (
                        <button
                          onClick={() => void onSave(generatedCode)}
                          className="rounded-lg border border-studio-line px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-panel"
                        >
                          Save to library
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={generatedCode}
                    onChange={(e) => applyToEditor(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    className="mt-3 w-full resize-y rounded-lg bg-studio-panel p-3 font-mono text-[11px] leading-5 text-studio-muted outline-none"
                  />
                </div>
              )}

              {turns.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {turns.map((turn) => (
                    <li key={turn.id} className="rounded-xl border border-studio-line bg-studio-elevated p-3">
                      <p className="truncate text-xs text-studio-muted">
                        {turn.hadImage ? "🖼 " : ""}
                        {turn.request}
                      </p>
                      <p className="mt-1 text-sm font-medium">{turn.summary}</p>
                      {turn.steps.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {turn.steps.map((step, i) => (
                            <span
                              key={`${turn.id}-${i}`}
                              className="rounded-md bg-studio-panel px-2 py-0.5 text-[11px] text-studio-muted"
                            >
                              {step}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => applyToEditor(turn.code)}
                        className="mt-2 rounded-md border border-studio-line px-2 py-1 text-[11px] text-studio-muted hover:bg-studio-panel"
                      >
                        Restore this version
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-studio-muted">
                <Brain size={12} /> Rules applied: {DESIGN_CHECKLIST.join(" · ")}
              </p>
            </>
          )}
        </div>
        <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-studio-line bg-studio-panel p-5">
          <p className="text-sm font-semibold">Live preview</p>
          <div className="mt-3 grid min-h-0 flex-1 place-items-center overflow-hidden rounded-lg studio-grid p-8">
            {!generatedCode && (
              <p className="text-xs text-studio-muted">Run the agent to preview a generated result.</p>
            )}
            {PreviewIcon && parsedPreview?.kind === "icon" && (
              <PreviewIcon
                size={Math.min(parsedPreview.spec.size, 220)}
                color={parsedPreview.spec.color}
                strokeWidth={parsedPreview.spec.stroke}
                absoluteStrokeWidth={parsedPreview.spec.absolute}
                aria-label="Generated icon preview"
              />
            )}
            {parsedPreview?.kind === "svg" && (
              <div
                className="max-h-56 max-w-full [&>svg]:h-auto [&>svg]:max-h-56 [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: parsedPreview.svg }}
              />
            )}
            {parsedPreview && ["error", "unknown", "empty"].includes(parsedPreview.kind) && (
              <p className="text-xs text-studio-muted">
                {parsedPreview.kind === "error"
                  ? parsedPreview.message
                  : "No renderable icon was found in this result."}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
