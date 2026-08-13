import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Sparkles, Wand2, X } from "lucide-react";

import { assistIconCode } from "@/lib/icon-assistant.functions";
import { DESIGN_CHECKLIST } from "@/lib/agent-rules";
import { listSnippets } from "@/lib/snippets";

type Turn = {
  id: string;
  request: string;
  summary: string;
  steps: string[];
  hadImage: boolean;
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
};

const PROMPTS = [
  "A minimal rocket icon",
  "Make the stroke lighter and rounder",
  "Turn this into an outlined shield with a check",
  "Fix the broken code",
];

export default function IconAgent({ code, color, size, stroke, onApply, enabled, open, onClose, onSave }: Props) {
  const run = useServerFn(assistIconCode);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && enabled) inputRef.current?.focus();
  }, [open, enabled]);

  const attach = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4_000_000) {
      setError("That image is larger than 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

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

      const result = await run({
        data: {
          request: prompt,
          code,
          ...(image ? { imageDataUrl: image.dataUrl } : {}),
          library,
          context: { color, size, stroke },
        },
      });

      setGeneratedCode(result.code);
      setTurns((prev) => [
        {
          id: crypto.randomUUID(),
          request: prompt,
          summary: result.summary,
          steps: result.steps,
          hadImage: Boolean(image),
        },
        ...prev,
      ]);
      setRequest("");
      setImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The agent could not complete this task.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-studio-line bg-studio-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-studio-line px-4 py-3">
        <Sparkles size={16} className="text-studio-accent" />
        <span className="text-sm font-semibold">Glyph Agent</span>
        <span className="hidden text-xs text-studio-muted sm:inline">
          designs, repairs and rewrites the code below
        </span>
        <button onClick={onClose} aria-label="Close Glyph Agent" className="ml-auto rounded-md p-1 text-studio-muted hover:bg-studio-elevated hover:text-studio-text"><X size={18} /></button>
      </div>
        <div className="grid max-h-[calc(90vh-56px)] gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="min-w-0">
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
                  placeholder="Describe an icon, attach a reference image, or ask for a fix…"
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

              {busy && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-studio-line bg-studio-elevated px-3 py-2 text-xs text-studio-muted">
                  <Loader2 size={13} className="animate-spin" />
                  Reading your library, checking the icon set, drawing on the 24-grid…
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-xl border border-studio-accent/60 bg-studio-elevated px-3 py-2 text-xs text-studio-accent">
                  {error}
                </p>
              )}

              {generatedCode && (
                <div className="mt-4 rounded-xl border border-studio-line bg-studio-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Generated result</span>
                    <div className="flex gap-2">
                      <button onClick={() => onApply(generatedCode)} className="rounded-lg bg-studio-accent px-3 py-1.5 text-xs font-semibold">Apply to editor</button>
                      {onSave && <button onClick={() => void onSave(generatedCode)} className="rounded-lg border border-studio-line px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-panel">Save to library</button>}
                    </div>
                  </div>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-studio-panel p-3 text-[11px] text-studio-muted">{generatedCode}</pre>
                </div>
              )}

              {turns.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {turns.map((turn) => (
                    <li
                      key={turn.id}
                      className="rounded-xl border border-studio-line bg-studio-elevated p-3"
                    >
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
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 text-[11px] text-studio-muted">
                Rules applied: {DESIGN_CHECKLIST.join(" · ")}
              </p>
            </>
          )}
          <div className="min-h-64 rounded-xl border border-studio-line bg-studio-elevated p-4">
          <p className="text-xs font-semibold">Live preview</p>
          <div className="mt-3 grid min-h-56 place-items-center rounded-lg studio-grid p-6">
            {generatedCode ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-studio-muted">{generatedCode}</pre> : <p className="text-xs text-studio-muted">Run the agent to preview a generated result.</p>}
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
