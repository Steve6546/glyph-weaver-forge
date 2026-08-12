import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import {
  icons as lucideIcons,
  ArrowLeft,
  Check,
  Copy,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { deleteSnippet, listSnippets, updateSnippet, type Snippet } from "@/lib/snippets";
import { detectLanguage, labelFor } from "@/lib/detect-language";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "My Snippet Library — Lucide Icon Studio" },
      {
        name: "description",
        content:
          "Browse, search, sort, edit and delete every icon snippet you saved in Lucide Icon Studio.",
      },
      { property: "og:title", content: "My Snippet Library — Lucide Icon Studio" },
      {
        property: "og:description",
        content: "Search, sort, edit and delete your saved icon snippets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

const toPascal = (kebab: string) =>
  kebab
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

type SortKey = "newest" | "oldest" | "title" | "language";

function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSnippets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listSnippets()
      .then(setSnippets)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? snippets.filter((s) =>
          [s.title, s.language, s.icon_name ?? "", s.code].some((f) =>
            f.toLowerCase().includes(q),
          ),
        )
      : snippets;
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "language") return a.language.localeCompare(b.language);
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sort === "oldest" ? da - db : db - da;
    });
    return sorted;
  }, [snippets, query, sort]);

  const startEdit = (s: Snippet) => {
    setEditing(s);
    setDraftTitle(s.title);
    setDraftCode(s.code);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await updateSnippet(editing.id, {
        title: draftTitle.trim() || editing.title,
        code: draftCode,
        language: detectLanguage(draftCode),
      });
      setSnippets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id: string) => {
    const previous = snippets;
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    if (editing?.id === id) setEditing(null);
    try {
      await deleteSnippet(id);
    } catch (e) {
      setSnippets(previous);
      setError((e as Error).message);
    }
  };

  const copy = async (s: Snippet) => {
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied(s.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-studio-line pb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">My library</h1>
            <p className="mt-1 text-sm text-studio-muted">
              {snippets.length} saved snippet{snippets.length === 1 ? "" : "s"} · search, sort, edit
              or delete.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-studio-line bg-studio-panel px-4 py-2 text-sm font-medium transition-colors hover:bg-studio-elevated"
          >
            <ArrowLeft size={16} />
            Studio
          </Link>
        </header>

        {!authLoading && !user && (
          <p className="mt-8 text-sm text-studio-muted">
            <Link to="/auth" className="underline">
              Sign in
            </Link>{" "}
            to see your saved snippets.
          </p>
        )}

        {user && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-studio-line bg-studio-elevated px-3 py-2">
                <Search size={15} className="shrink-0 text-studio-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, icon, language or code…"
                  aria-label="Search snippets"
                  className="w-full min-w-0 bg-transparent text-sm outline-none"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort snippets"
                className="rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
                <option value="language">Language</option>
              </select>
            </div>

            {error && <p className="mt-4 text-sm text-studio-accent">{error}</p>}
            {loading && <p className="mt-8 text-sm text-studio-muted">Loading…</p>}
            {!loading && visible.length === 0 && (
              <p className="mt-8 text-sm text-studio-muted">
                Nothing here yet — save a snippet from the studio.
              </p>
            )}

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((s) => {
                const Comp =
                  lucideIcons[toPascal(s.icon_name ?? "") as keyof typeof lucideIcons] ?? null;
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 rounded-2xl border border-studio-line bg-studio-panel p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-studio-line bg-studio-elevated">
                        {Comp ? (
                          <Comp size={22} color={s.color} strokeWidth={Number(s.stroke)} />
                        ) : (
                          <span className="text-xs text-studio-muted">svg</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold">{s.title}</h2>
                        <p className="mt-0.5 truncate text-xs text-studio-muted">
                          {labelFor(s.language)} · {s.size}px · stroke {s.stroke} · {s.color}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-studio-muted">
                          {new Date(s.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <pre className="max-h-28 overflow-auto rounded-lg bg-studio-elevated p-3 text-xs leading-5">
                      <code>{s.code}</code>
                    </pre>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-studio-line px-3 py-1.5 text-xs font-medium hover:bg-studio-elevated"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => copy(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-studio-line px-3 py-1.5 text-xs font-medium hover:bg-studio-elevated"
                      >
                        {copied === s.id ? <Check size={13} /> : <Copy size={13} />}
                        {copied === s.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        aria-label={`Delete ${s.title}`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-studio-line px-3 py-1.5 text-xs font-medium text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-studio-line bg-studio-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Edit snippet</h2>
              <button
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="rounded-md p-1.5 text-studio-muted hover:bg-studio-elevated hover:text-studio-text"
              >
                <X size={16} />
              </button>
            </div>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              aria-label="Snippet title"
              className="mt-4 w-full rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none"
            />
            <textarea
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              aria-label="Snippet code"
              rows={12}
              className="mt-3 w-full rounded-lg border border-studio-line bg-studio-elevated p-3 font-mono text-xs leading-5 outline-none"
            />
            <p className="mt-2 text-xs text-studio-muted">
              Detected language: {labelFor(detectLanguage(draftCode))}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-studio-line px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
