export type LangId =
  | "tsx"
  | "jsx"
  | "typescript"
  | "javascript"
  | "markup"
  | "svg"
  | "css"
  | "scss"
  | "json"
  | "python"
  | "bash"
  | "sql"
  | "yaml"
  | "markdown";

const LABELS: Record<LangId, string> = {
  tsx: "TSX / React",
  jsx: "JSX / React",
  typescript: "TypeScript",
  javascript: "JavaScript",
  markup: "HTML",
  svg: "SVG",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  python: "Python",
  bash: "Shell",
  sql: "SQL",
  yaml: "YAML",
  markdown: "Markdown",
};

/** Prism grammar name backing each detected language. */
const GRAMMARS: Record<LangId, string> = {
  tsx: "tsx",
  jsx: "jsx",
  typescript: "typescript",
  javascript: "javascript",
  markup: "markup",
  svg: "markup",
  css: "css",
  scss: "css",
  json: "json",
  python: "python",
  bash: "bash",
  sql: "javascript",
  yaml: "markup",
  markdown: "markup",
};

export const labelFor = (id: string) => LABELS[id as LangId] ?? id;
export const grammarFor = (id: string) => GRAMMARS[id as LangId] ?? "markup";

/**
 * Score-based language detection. Each rule adds weight to a candidate, and
 * the highest scoring candidate wins — far more stable than first-match rules
 * when a snippet mixes markup, types and JSX.
 */
export function detectLanguage(code: string): LangId {
  const c = code.trim();
  if (!c) return "markup";

  // Unambiguous shapes first.
  if (/^<svg[\s>]/i.test(c) || /<svg[\s>][\s\S]*<\/svg>\s*$/i.test(c)) return "svg";
  if (/^[[{]/.test(c) && /[\]}]$/.test(c)) {
    try {
      JSON.parse(c);
      return "json";
    } catch {
      /* keep scoring */
    }
  }
  if (/^#!.*\b(ba)?sh\b/.test(c)) return "bash";

  const score: Partial<Record<LangId, number>> = {};
  const add = (id: LangId, n: number) => (score[id] = (score[id] ?? 0) + n);
  const has = (re: RegExp, id: LangId, n = 1) => {
    if (re.test(c)) add(id, n);
  };

  has(/^\s*(#|--)?\s*(select|insert into|update .* set|create table|alter table)\b/im, "sql", 4);
  has(/\b(from|where|join|group by|order by)\b/i, "sql", 0.5);

  has(/^\s*(def |class \w+\(|from \w+ import |import \w+$)/m, "python", 3);
  has(/\bprint\(|\bself\b|elif |__name__/, "python", 1.5);

  has(/^\s*(npm|bun|yarn|pnpm|git|cd|sudo|docker|curl|echo|mkdir|rm) /m, "bash", 3);
  has(/\$\{?\w+\}?\s*=|\|\s*(grep|awk|sed)\b/, "bash", 1);

  has(/^\s*#{1,6}\s+\S|^\s*[-*]\s+\S.*\n\s*[-*]\s+/m, "markdown", 2);
  has(/```/, "markdown", 3);

  has(/^\s*[\w.-]+:\s*(\S|$)/m, "yaml", 0.8);
  has(/^---\s*$/m, "yaml", 1.5);

  has(/[.#&][\w-]+\s*\{[^}]*:[^}]*;/, "css", 3);
  has(/@media|@keyframes|:root\s*\{|--[\w-]+\s*:/, "css", 1.5);
  has(/\$[\w-]+\s*:|@mixin|@include|&:\w/, "scss", 3);

  has(/<\/?[a-z][\w-]*[\s/>]/, "markup", 1.5);
  has(/<!DOCTYPE|<html|<head|<body|<div\b/i, "markup", 3);

  has(/\b(const|let|var|function|=>|async|await)\b/, "javascript", 1.5);
  has(/\b(import|export)\b.*\bfrom\b/, "javascript", 1);
  has(
    /:\s*(string|number|boolean|any|unknown|void)\b|\binterface\s+\w+|\btype\s+\w+\s*=|\benum\s+\w+|<[A-Z]\w*>\(/,
    "typescript",
    3,
  );
  has(/<[A-Z][\w.]*[\s/>]|<>[\s\S]*<\/>/, "jsx", 3);
  has(/className=|jsx|React\./, "jsx", 1.5);

  const best = (Object.entries(score) as [LangId, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 1) return "markup";

  const ts = score["typescript"] ?? 0;
  const jsx = score["jsx"] ?? 0;
  const js = score["javascript"] ?? 0;

  // React variants beat plain JS/TS when both signals are present.
  if (jsx >= 3 && ts >= 3) return "tsx";
  if (jsx >= 3 && js >= 1) return "jsx";
  if (ts >= 3 && ts >= best[1]) return "typescript";

  if (best[0] === "scss") return "scss";
  return best[0];
}
