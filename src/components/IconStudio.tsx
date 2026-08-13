import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  icons as lucideIcons,
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Library,
  LogOut,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import EditorModule from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/themes/prism-tomorrow.css";

import { useAuth } from "@/hooks/useAuth";
import { createSnippet } from "@/lib/snippets";
import { detectLanguage, grammarFor, labelFor } from "@/lib/detect-language";
import { buildIconCode, parseCode, toKebab, type IconSpec } from "@/lib/icon-code";
import IconAgent from "@/components/IconAgent";
import {
  copyPngToClipboard,
  downloadRaster,
  downloadSvgFile,
  normalizeSvg,
  type ExportFormat,
} from "@/lib/icon-export";

// Interop: some bundlers hand back the module namespace instead of the component.
const Editor = ((EditorModule as unknown as { default?: typeof EditorModule }).default ??
  EditorModule) as typeof EditorModule;

const ALL_ICONS = Object.keys(lucideIcons).map((pascal) => ({
  pascal,
  name: toKebab(pascal),
}));

const DEFAULT_SPEC: IconSpec = {
  pascal: "Camera",
  color: "#ffffff",
  size: 160,
  stroke: 2,
  absolute: false,
};
const PREVIEW_SIZES = [16, 32, 64, 128, 256];
const EXPORT_SIZES = [64, 128, 256, 512, 1024, 2048];
const MIN_SIZE = 8;
const MAX_SIZE = 1024;
const CANVAS_PAD = 40;
const MIN_CANVAS_SIZE = 480;
const MAX_CANVAS_SIZE = 1120;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));

/** Measures a container so the preview can always fit its glyph exactly. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function IconStudio() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [spec, setSpec] = useState<IconSpec>(DEFAULT_SPEC);
  const [code, setCode] = useState(() => buildIconCode(DEFAULT_SPEC));
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPixels, setExportPixels] = useState(512);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [shellRef, shellWidth] = useElementWidth<HTMLDivElement>();

  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase().replace(/\s+/g, "-");
    const list = q ? ALL_ICONS.filter((i) => i.name.includes(q)) : ALL_ICONS;
    return list.slice(0, 240);
  }, [deferredQuery]);

  // The editor is the single source of truth: what you type is what renders.
  const parsed = useMemo(() => parseCode(code, spec), [code, spec]);

  useEffect(() => {
    if (parsed.kind !== "icon") return;
    const next = parsed.spec;
    setSpec((prev) =>
      prev.pascal === next.pascal &&
      prev.color === next.color &&
      prev.size === next.size &&
      prev.stroke === next.stroke &&
      prev.absolute === next.absolute
        ? prev
        : next,
    );
  }, [parsed]);

  // Keep oversized artwork centered when the scrollable preview grows.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      canvas.scrollLeft = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
      canvas.scrollTop = Math.max(0, (canvas.scrollHeight - canvas.clientHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [spec.size, zoom, parsed.kind]);

  const apply = useCallback(
    (patch: Partial<IconSpec>) => {
      const base = parsed.kind === "icon" ? parsed.spec : spec;
      const next = { ...base, ...patch };
      setSpec(next);
      // A pasted SVG is its own source of truth. Changing its export size
      // must not replace the user's SVG with the last Lucide JSX snippet.
      const onlySize = Object.keys(patch).every((key) => key === "size");
      if (parsed.kind !== "svg") setCode(buildIconCode(next));
      // Size presets and the size slider always start from a predictable fit.
      // This prevents a previous 400% zoom from making a newly selected
      // 1024px artwork overflow the viewport.
      if (onlySize) setZoom(1);
    },
    [parsed, spec],
  );

  const langId = useMemo(() => detectLanguage(code), [code]);

  const highlight = useCallback(
    (value: string) => {
      const grammarName = grammarFor(langId);
      const grammar = Prism.languages[grammarName] ?? Prism.languages["markup"];
      if (!grammar) return value;
      try {
        return Prism.highlight(value, grammar, grammarName);
      } catch {
        return value;
      }
    },
    [langId],
  );

  const Icon =
    parsed.kind === "icon" ? lucideIcons[parsed.spec.pascal as keyof typeof lucideIcons] : null;
  // Parsed code is authoritative for the rendered icon. The local spec is the
  // fallback used while editing invalid/empty code and for SVG metadata.
  const renderSpec = parsed.kind === "icon" ? parsed.spec : spec;
  const iconName = toKebab(renderSpec.pascal);

  // One sizing system: `spec.size` is the real export size, and the canvas only
  // scales the view. Nothing is clamped, so 512px and 1024px still behave.
  // Keep the preview frame stable while the artwork scales inside it. This
  // prevents the page columns and action panel from jumping during resizing.
  const canvasSize = Math.max(
    320,
    Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, shellWidth || 640)),
  );
  const inner = canvasSize - CANVAS_PAD * 2;
  const fitScale = Math.min(1, inner / renderSpec.size);
  // zoom is the user-facing multiplier; fitScale only compensates for large artwork.
  const viewScale = Math.max(0.02, fitScale * zoom);

  const previewError =
    parsed.kind === "error"
      ? parsed.message
      : parsed.kind === "empty"
        ? "The editor is empty — the preview has been cleared. Pick an icon or paste code."
        : parsed.kind === "unknown"
          ? "No renderable Lucide component or <svg> was found."
          : null;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  /** The one source every export reads from, so SVG and PNG always match. */
  const currentSvg = () => {
    const node = canvasRef.current?.querySelector("svg");
    if (!node) return null;
    return normalizeSvg(node as SVGSVGElement, renderSpec.size);
  };

  const copySvg = () => {
    const svg = currentSvg();
    if (svg) void copy(svg, "svg");
  };

  const exportAs = async (format: ExportFormat, pixels: number) => {
    const svg = currentSvg();
    if (!svg) {
      setExportError("There is nothing to export yet.");
      return;
    }
    setExportError(null);
    try {
      if (format === "svg") downloadSvgFile(svg, iconName || "icon");
      else await downloadRaster(svg, iconName || "icon", pixels, format);
      setCopied(format);
      setTimeout(() => setCopied(null), 1600);

    } catch (e) {
      setExportError(e instanceof Error ? e.message : "The export failed.");
    }
  };

  const copyPng = async () => {
    const svg = currentSvg();
    if (!svg) return;
    try {
      await copyPngToClipboard(svg, exportPixels);
      setCopied("png");
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setExportError("This browser does not allow copying images.");
    }
  };

  const resetAll = () => {
    setSpec(DEFAULT_SPEC);
    setCode(buildIconCode(DEFAULT_SPEC));
    setZoom(1);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await createSnippet(
        {
          title: title.trim() || iconName,
          language: langId,
          code,
          icon_name: iconName,
          color: renderSpec.color,
          stroke: renderSpec.stroke,
          size: renderSpec.size,
        },
        user.id,
      );
      setTitle("");
      setSaveMessage("Saved to your library.");
    } catch (e) {
      setSaveMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-studio-line pb-6">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Lucide Icon Studio</h1>
            <p className="mt-1 truncate text-sm text-studio-muted">
              {ALL_ICONS.length} icons · live two-way code preview.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!authLoading &&
              (user ? (
                <>
                  <Link
                    to="/library"
                    className="inline-flex items-center gap-2 rounded-full border border-studio-line bg-studio-panel px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-elevated"
                  >
                    <Library size={16} />
                    <span className="hidden sm:inline">Library</span>
                  </Link>
                  <button
                    onClick={async () => {
                      await signOut();
                      navigate({ to: "/auth", replace: true });
                    }}
                    aria-label="Sign out"
                    className="inline-flex items-center gap-2 rounded-full border border-studio-line bg-studio-panel px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-elevated"
                  >
                    <LogOut size={16} />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="inline-flex items-center rounded-full bg-studio-accent px-4 py-2 text-sm font-semibold"
                >
                  Sign in
                </Link>
              ))}
            <a
              href="https://lucide.dev/icons/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-studio-line bg-studio-panel px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-elevated"
            >
              <ExternalLink size={16} />
              <span className="hidden sm:inline">Docs</span>
            </a>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Customizer */}
          <aside className="h-fit rounded-2xl border border-studio-line bg-studio-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Customizer</h2>
              <button
                onClick={resetAll}
                aria-label="Reset customizer"
                className="rounded-full p-1.5 text-studio-muted transition-colors hover:bg-studio-elevated hover:text-studio-text"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-6">
              <div>
                <label className="text-sm font-medium" htmlFor="color-hex">
                  Color
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-studio-line bg-studio-elevated p-2">
                  <input
                    type="color"
                    aria-label="Pick color"
                          value={/^#[0-9a-f]{6}$/i.test(renderSpec.color) ? renderSpec.color : "#ffffff"}
                    onChange={(e) => apply({ color: e.target.value })}
                    className="size-7 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
                  />
                  <input
                    id="color-hex"
                    value={renderSpec.color}
                    onChange={(e) => apply({ color: e.target.value })}
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <label className="font-medium" htmlFor="stroke">
                    Stroke width
                  </label>
                  <span className="text-studio-muted">{renderSpec.stroke}px</span>
                </div>
                <input
                  id="stroke"
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.5}
                  value={renderSpec.stroke}
                  onChange={(e) => apply({ stroke: Number(e.target.value) })}
                  className="studio-range mt-3"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <label className="font-medium" htmlFor="size">
                    Size
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      aria-label="Icon size in pixels"
                      min={MIN_SIZE}
                      max={MAX_SIZE}
                      value={renderSpec.size}
                      onChange={(e) =>
                        apply({ size: clampSize(Number(e.target.value) || MIN_SIZE) })
                      }
                      className="w-16 rounded-md border border-studio-line bg-studio-elevated px-2 py-1 text-right text-xs tabular-nums outline-none"
                    />
                    <span className="text-xs text-studio-muted">px</span>
                  </div>
                </div>
                <input
                  id="size"
                  type="range"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  step={1}
                  value={renderSpec.size}
                  onChange={(e) => apply({ size: clampSize(Number(e.target.value)) })}
                  className="studio-range mt-3"
                />
                <p className="mt-2 text-xs text-studio-muted">
                  Size is the exported artwork size. The zoom below only changes the view.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Absolute stroke width</span>
                <button
                  role="switch"
                  aria-checked={renderSpec.absolute}
                  aria-label="Absolute stroke width"
                  onClick={() => apply({ absolute: !renderSpec.absolute })}
                  className={`relative h-6 w-11 shrink-0 rounded-full border border-studio-line transition-colors ${
                    renderSpec.absolute ? "bg-studio-accent" : "bg-studio-elevated"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-studio-text transition-all ${
                      renderSpec.absolute ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="text-sm font-medium" htmlFor="icon-search">
                  Icons
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-studio-line bg-studio-elevated px-3 py-2">
                  <Search size={15} className="shrink-0 text-studio-muted" />
                  <input
                    id="icon-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search all icons…"
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="mt-3 grid max-h-72 grid-cols-5 gap-2 overflow-y-auto pr-1">
                  {results.map(({ pascal, name }) => {
                    const Comp = lucideIcons[pascal as keyof typeof lucideIcons];
                    return (
                      <button
                        key={pascal}
                        onClick={() => apply({ pascal })}
                        aria-label={name}
                        title={`${name} — insert code`}
                        className={`grid aspect-square place-items-center rounded-lg border transition-colors ${
                          pascal === renderSpec.pascal
                            ? "border-studio-accent bg-studio-elevated"
                            : "border-studio-line hover:bg-studio-elevated"
                        }`}
                      >
                        <Comp size={18} />
                      </button>
                    );
                  })}
                  {results.length === 0 && (
                    <p className="col-span-5 py-4 text-center text-xs text-studio-muted">
                      No icons found.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Preview + code */}
          <section className="min-w-0 space-y-6">
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,800px)_minmax(320px,1fr)]">
              <div ref={shellRef} className="w-full max-w-[1120px]">
                <div
                  ref={canvasRef}
                  style={{ width: canvasSize, height: canvasSize, padding: CANVAS_PAD }}
                  className="studio-grid grid w-full max-w-full place-items-center overflow-auto rounded-2xl border border-studio-line bg-studio-panel transition-[width,height] duration-200"
                >
                  {parsed.kind === "svg" ? (
                    <div
                      style={{
                        width: inner * viewScale,
                        height: inner * viewScale,
                      }}
                      className="grid place-items-center transition-[width,height] duration-150 ease-out [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain"
                      dangerouslySetInnerHTML={{ __html: parsed.svg }}
                    />
                  ) : Icon && parsed.kind === "icon" ? (
                    <div
                      style={{ width: renderSpec.size * viewScale, height: renderSpec.size * viewScale }}
                      className="relative transition-[width,height] duration-150 ease-out"
                    >
                      <div
                        style={{
                          width: renderSpec.size,
                          height: renderSpec.size,
                          transform: `scale(${viewScale})`,
                          transformOrigin: "top left",
                          transition: "transform 150ms ease-out",
                        }}
                      >
                        <Icon
                          color={renderSpec.color}
                          size={renderSpec.size}
                          strokeWidth={renderSpec.stroke}
                          absoluteStrokeWidth={renderSpec.absolute}
                        />
                      </div>
                    </div>

                  ) : (
                    <div className="max-w-xs text-center text-sm text-studio-muted">
                      <AlertTriangle className="mx-auto mb-3" size={24} />
                      Nothing to preview
                    </div>
                  )}
                </div>

                {/* Zoom controls */}
                <div className="mt-4 flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-studio-line bg-studio-panel px-3 py-2">
                  <button
                    onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
                    aria-label="Zoom out"
                    className="shrink-0 rounded-md p-1.5 text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="studio-range min-w-[120px] flex-1"
                  />
                  <button
                    onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
                    aria-label="Zoom in"
                    className="shrink-0 rounded-md p-1.5 text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
                  >
                    <Plus size={15} />
                  </button>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-studio-muted">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom(1)}
                    aria-label="Fit icon"
                    title="Reset zoom so the whole icon fits"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-studio-line px-2 py-1 text-xs text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
                  >
                    <Maximize2 size={13} />
                    Fit
                  </button>
                  <button
                    onClick={() =>
                      setZoom(() =>
                        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(1 / Math.max(fitScale, 0.02)).toFixed(2))),
                      )
                    }
                    aria-label="View icon at one to one scale"
                    title="Show the artwork at its export size"
                    className="inline-flex shrink-0 items-center rounded-md border border-studio-line px-2 py-1 text-xs text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
                  >
                    1:1
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2">
                  {PREVIEW_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => apply({ size: s })}
                      title={`Use ${s}px`}
                      aria-label={`Set icon size to ${s} pixels`}
                      className={`grid aspect-square min-w-0 place-items-center overflow-hidden rounded-lg border bg-studio-elevated p-1 transition-colors ${renderSpec.size === s ? "border-studio-accent" : "border-studio-line hover:border-studio-muted"}`}
                    >
                      {parsed.kind === "svg" ? (
                        <div
                          className="grid size-full place-items-center [&>svg]:size-full [&>svg]:object-contain"
                          dangerouslySetInnerHTML={{ __html: parsed.svg }}
                        />
                      ) : Icon && parsed.kind === "icon" ? (
                        <Icon
                          color={renderSpec.color}
                          size={Math.min(s, 42)}
                          strokeWidth={renderSpec.stroke}
                          absoluteStrokeWidth={renderSpec.absolute}
                        />
                      ) : (
                        <span className="text-xs text-studio-muted">—</span>
                      )}
                      <span className="sr-only">{s}px</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <h2 className="text-3xl font-semibold lowercase">{iconName}</h2>
                <p className="mt-2 text-sm text-studio-muted">
                  {renderSpec.size}px export · stroke {renderSpec.stroke} · {renderSpec.color} · preview{" "}
                  {Math.round(zoom * 100)}%
                  {fitScale < 1 && ` (auto-fit ${Math.round(fitScale * 100)}%)`}
                </p>

                {previewError && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-studio-accent/60 bg-studio-elevated px-3 py-2 text-sm">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-studio-accent" />
                    <span>{previewError}</span>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={copySvg}
                    className="inline-flex items-center gap-2 rounded-full bg-studio-elevated px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-line"
                  >
                    {copied === "svg" ? <Check size={16} /> : <Copy size={16} />}
                    {copied === "svg" ? "Copied SVG" : "Copy SVG"}
                  </button>
                  <button
                    onClick={() => copy(code, "code")}
                    className="inline-flex items-center gap-2 rounded-full bg-studio-elevated px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-line"
                  >
                    {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
                    {copied === "code" ? "Copied code" : "Copy code"}
                  </button>
                  <button
                    onClick={() => setExportOpen((v) => !v)}
                    aria-expanded={exportOpen}
                    disabled={!Icon && parsed.kind !== "svg"}
                    className="inline-flex items-center gap-2 rounded-full bg-studio-accent px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
                  >
                    <Download size={16} /> Export
                  </button>
                </div>

                {exportOpen && (
                  <div className="mt-3 rounded-2xl border border-studio-line bg-studio-panel p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Raster size</span>
                      <span className="text-studio-muted">
                        {exportPixels}×{exportPixels}px
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {EXPORT_SIZES.map((px) => (
                        <button
                          key={px}
                          onClick={() => setExportPixels(px)}
                          className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                            exportPixels === px
                              ? "border-studio-accent bg-studio-elevated"
                              : "border-studio-line text-studio-muted hover:bg-studio-elevated"
                          }`}
                        >
                          {px}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => void exportAs("svg", exportPixels)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-studio-elevated px-3 py-2 text-sm font-medium hover:bg-studio-line"
                      >
                        <Download size={15} /> SVG (vector)
                      </button>
                      <button
                        onClick={() => void exportAs("png", exportPixels)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-studio-elevated px-3 py-2 text-sm font-medium hover:bg-studio-line"
                      >
                        <Download size={15} /> PNG (transparent)
                      </button>
                      <button
                        onClick={() => void exportAs("jpg", exportPixels)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-studio-elevated px-3 py-2 text-sm font-medium hover:bg-studio-line"
                      >
                        <Download size={15} /> JPG (white)
                      </button>
                      <button
                        onClick={() => void copyPng()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-studio-elevated px-3 py-2 text-sm font-medium hover:bg-studio-line"
                      >
                        {copied === "png" ? <Check size={15} /> : <Copy size={15} />} Copy PNG
                      </button>
                    </div>
                    {exportError && (
                      <p className="mt-2 text-xs text-studio-accent">{exportError}</p>
                    )}
                  </div>
                )}

                {/* Save */}
                <div className="mt-6 rounded-2xl border border-studio-line bg-studio-panel p-4">
                  <h3 className="text-base font-semibold">Save to library</h3>
                  {user ? (
                    <>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder={`Name (default: ${iconName})`}
                          className="w-full min-w-0 rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none"
                        />
                        <button
                          onClick={save}
                          disabled={saving}
                          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        >
                          <Save size={15} />
                          Save
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-studio-muted">
                        {saveMessage ?? "Manage everything you saved on the library page."}{" "}
                        <Link to="/library" className="underline">
                          Open library
                        </Link>
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-studio-muted">
                      <Link to="/auth" className="underline">
                        Sign in
                      </Link>{" "}
                      to save icons, code and settings to your own library.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Editable, highlighted code panel */}
            <div className="overflow-hidden rounded-2xl border border-studio-line bg-studio-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-line px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Code</span>
                  <span className="rounded-md bg-studio-elevated px-2 py-0.5 text-xs text-studio-muted">
                    {labelFor(langId)}
                  </span>
                </div>
                <button
                  onClick={() => copy(code, "code")}
                  aria-label="Copy code"
                  className="rounded-md p-2 text-studio-muted transition-colors hover:bg-studio-elevated hover:text-studio-text"
                >
                  {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <Editor
                value={code}
                onValueChange={setCode}
                highlight={highlight}
                padding={20}
                textareaClassName="outline-none"
                className="min-h-[300px] font-mono text-sm leading-6"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
              <p className="border-t border-studio-line px-4 py-2 text-xs text-studio-muted">
                Two-way: click an icon to insert its real code, or edit the props here and the
                preview follows. Paste an <code>&lt;svg&gt;</code> block to render it directly.
              </p>
            </div>

            <IconAgent
              code={code}
              color={renderSpec.color}
              size={renderSpec.size}
              stroke={renderSpec.stroke}
              enabled={Boolean(user)}
              onApply={setCode}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
