import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Lucide Icon Studio" },
      {
        name: "description",
        content:
          "Sign in to save your icon designs and code snippets to your personal Icon Studio library.",
      },
      { property: "og:title", content: "Sign in — Lucide Icon Studio" },
      {
        property: "og:description",
        content: "Save your icon designs and code snippets to your personal library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
    const { error } = await fn;
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup") setMessage("Check your inbox to confirm your email.");
  };

  const google = async () => {
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setMessage("Google sign-in failed. Please try again.");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-studio-bg px-4 text-studio-text">
      <div className="w-full max-w-sm rounded-2xl border border-studio-line bg-studio-panel p-6">
        <div className="inline-flex items-center gap-2 text-sm text-studio-muted">
          <ArrowLeft size={15} /> Sign in to open the studio
        </div>
        <h1 className="mt-4 text-xl font-semibold">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-studio-muted">
          Save icons, snippets and settings to your own library.
        </p>

        <button
          onClick={google}
          className="mt-5 w-full rounded-lg border border-studio-line bg-studio-elevated px-4 py-2.5 text-sm font-medium transition-colors hover:bg-studio-line"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-studio-muted">
          <span className="h-px flex-1 bg-studio-line" /> or <span className="h-px flex-1 bg-studio-line" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-studio-line bg-studio-elevated px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-semibold text-studio-text disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-studio-muted">{message}</p>}

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-studio-muted hover:text-studio-text"
        >
          {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
