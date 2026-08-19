import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Brain, Loader2, Save, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_SETTINGS,
  STYLE_OPTIONS,
  loadAgentSettings,
  saveAgentSettings,
  type AgentSettings,
  type AgentStyle,
} from "@/lib/agent-settings";
import { clearMemory, recallMemory, type MemoryRow } from "@/lib/agent-memory";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Design & Agent Settings — Lucide Icon Studio" },
      {
        name: "description",
        content:
          "Set the design rules, style options and standing edit plan that every Glyph Agent generation follows, and manage the agent's 24-hour memory.",
      },
      { property: "og:title", content: "Design & Agent Settings — Lucide Icon Studio" },
      {
        property: "og:description",
        content: "Design rules, style presets and agent memory for every icon you generate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [memory, setMemory] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [loaded, rows] = await Promise.all([loadAgentSettings(), recallMemory(20)]);
        if (!alive) return;
        setSettings(loaded);
        setMemory(rows);
      } catch (e) {
        if (alive) setMessage((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const patch = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveAgentSettings(settings, user.id);
      setSettings(saved);
      setMessage("Settings saved — every generation now follows them.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none";

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <header className="flex items-center gap-3 border-b border-studio-line pb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-studio-line bg-studio-panel px-3 py-2 text-sm"
          >
            <ArrowLeft size={16} /> Studio
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Design & Agent settings</h1>
            <p className="mt-1 text-sm text-studio-muted">
              These rules are stored in your account and injected into every generation task.
            </p>
          </div>
        </header>

        {loading ? (
          <p className="mt-8 flex items-center gap-2 text-sm text-studio-muted">
            <Loader2 size={15} className="animate-spin" /> Loading your settings…
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-studio-line bg-studio-panel p-5">
              <h2 className="text-base font-semibold">Style</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => patch("style", option.value as AgentStyle)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      settings.style === option.value
                        ? "border-studio-accent bg-studio-elevated"
                        : "border-studio-line hover:bg-studio-elevated"
                    }`}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="mt-1 block text-xs text-studio-muted">{option.hint}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium" htmlFor="s-color">
                    Default colour
                  </label>
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-studio-line bg-studio-elevated p-2">
                    <input
                      id="s-color"
                      type="color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(settings.default_color)
                          ? settings.default_color
                          : "#ffffff"
                      }
                      onChange={(e) => patch("default_color", e.target.value)}
                      className="size-7 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
                    />
                    <input
                      value={settings.default_color}
                      onChange={(e) => patch("default_color", e.target.value)}
                      className="w-full min-w-0 bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="s-size">
                    Default size ({settings.default_size}px)
                  </label>
                  <input
                    id="s-size"
                    type="range"
                    min={16}
                    max={1024}
                    value={settings.default_size}
                    onChange={(e) => patch("default_size", Number(e.target.value))}
                    className="studio-range mt-3"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="s-stroke">
                    Default stroke ({settings.default_stroke})
                  </label>
                  <input
                    id="s-stroke"
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.25}
                    value={settings.default_stroke}
                    onChange={(e) => patch("default_stroke", Number(e.target.value))}
                    className="studio-range mt-3"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="s-radius">
                    Corner radius ({settings.corner_radius})
                  </label>
                  <input
                    id="s-radius"
                    type="range"
                    min={0}
                    max={8}
                    step={0.5}
                    value={settings.corner_radius}
                    onChange={(e) => patch("corner_radius", Number(e.target.value))}
                    className="studio-range mt-3"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="s-complexity">
                    Complexity ({settings.complexity}/5)
                  </label>
                  <input
                    id="s-complexity"
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.complexity}
                    onChange={(e) => patch("complexity", Number(e.target.value))}
                    className="studio-range mt-3"
                  />
                  <p className="mt-2 text-xs text-studio-muted">
                    1 = minimal glyph · 5 = layered illustration with fine filaments and bevels.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {(
                  [
                    ["allow_layers", "Layered groups", "Let the agent split artwork into editable layers"],
                    ["allow_multicolor", "Multicolor", "Allow a harmonious 2–3 colour palette"],
                    [
                      "transparent_background",
                      "Transparent background",
                      "Never draw a background plate behind the icon",
                    ],
                    ["memory_enabled", "24h memory", "Pass recent notes as context to every task"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <span className="text-sm font-medium">{label}</span>
                      <span className="block text-xs text-studio-muted">{hint}</span>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings[key]}
                      aria-label={label}
                      onClick={() => patch(key, !settings[key])}
                      className={`relative h-6 w-11 shrink-0 rounded-full border border-studio-line transition-colors ${
                        settings[key] ? "bg-studio-accent" : "bg-studio-elevated"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 size-4 rounded-full bg-studio-text transition-all ${
                          settings[key] ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-studio-line bg-studio-panel p-5">
              <h2 className="text-base font-semibold">Design rules</h2>
              <p className="mt-1 text-xs text-studio-muted">
                Written in any language. The agent treats these as hard constraints.
              </p>
              <textarea
                value={settings.design_rules}
                onChange={(e) => patch("design_rules", e.target.value)}
                rows={6}
                maxLength={4000}
                placeholder="e.g. Always keep 2px padding, never use diagonal text, prefer circular motifs…"
                className={`${field} mt-3 resize-y`}
              />

              <h2 className="mt-6 text-base font-semibold">Standing edit plan</h2>
              <p className="mt-1 text-xs text-studio-muted">
                Applied after every generation — a checklist the agent must satisfy before answering.
              </p>
              <textarea
                value={settings.edit_plan}
                onChange={(e) => patch("edit_plan", e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="e.g. 1) verify optical centering 2) check 16px legibility 3) name each layer"
                className={`${field} mt-3 resize-y`}
              />

              <label className="mt-6 block text-sm font-medium" htmlFor="s-lang">
                Reply language
              </label>
              <select
                id="s-lang"
                value={settings.language}
                onChange={(e) => patch("language", e.target.value)}
                className={`${field} mt-2`}
              >
                <option value="auto">Match my message</option>
                <option value="Arabic">العربية</option>
                <option value="English">English</option>
                <option value="French">Français</option>
                <option value="Spanish">Español</option>
              </select>
            </section>

            <section className="rounded-2xl border border-studio-line bg-studio-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-base font-semibold">
                  <Brain size={16} /> Agent memory (24h)
                </h2>
                <button
                  onClick={async () => {
                    await clearMemory();
                    setMemory([]);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-studio-line px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-elevated"
                >
                  <Trash2 size={14} /> Clear
                </button>
              </div>
              {memory.length === 0 ? (
                <p className="mt-3 text-sm text-studio-muted">
                  Nothing remembered yet. Notes expire automatically 24 hours after they are stored.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {memory.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-xs"
                    >
                      <span className="text-studio-muted">{row.role} · </span>
                      {row.content}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-studio-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save settings
              </button>
              {message && <p className="text-xs text-studio-muted">{message}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
