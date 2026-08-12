import { icons as lucideIcons } from "lucide-react";

export type IconSpec = {
  pascal: string;
  color: string;
  size: number;
  stroke: number;
  absolute: boolean;
};

export type ParsedCode =
  | { kind: "icon"; spec: IconSpec }
  | { kind: "svg"; svg: string }
  | { kind: "empty" }
  | { kind: "unknown" }
  | { kind: "error"; message: string };

export const toKebab = (pascal: string) =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

const isIconName = (name: string) => Object.prototype.hasOwnProperty.call(lucideIcons, name);

function sanitizeSvg(source: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) return null;
  const svg = documentNode.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") return null;
  svg.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => node.remove());
  svg.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(svg);
}

/** Real, copy-pasteable lucide-react source for the current selection. */
export function buildIconCode(spec: IconSpec): string {
  const props = [
    `color="${spec.color}"`,
    `size={${spec.size}}`,
    `strokeWidth={${spec.stroke}}`,
    spec.absolute ? "absoluteStrokeWidth" : null,
  ].filter(Boolean);

  return `import { ${spec.pascal} } from 'lucide-react';

const App = () => (
  <${spec.pascal} ${props.join(" ")} />
);

export default App;
`;
}

const readString = (code: string, prop: string): string | null => {
  const m =
    code.match(new RegExp(`${prop}\\s*=\\s*"([^"]*)"`)) ??
    code.match(new RegExp(`${prop}\\s*=\\s*'([^']*)'`)) ??
    code.match(new RegExp(`${prop}\\s*=\\s*\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\}`));
  return m?.[1] ?? null;
};

const readNumber = (code: string, prop: string): number | null => {
  const m =
    code.match(new RegExp(`${prop}\\s*=\\s*\\{\\s*(-?[\\d.]+)\\s*\\}`)) ??
    code.match(new RegExp(`${prop}\\s*=\\s*"(-?[\\d.]+)"`));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Interprets the editor content: an SVG paste renders verbatim, a lucide JSX
 * tag drives the live preview, and an unknown component name is reported so
 * the canvas can explain itself instead of silently rendering nothing.
 */
export function parseCode(code: string, fallback: IconSpec): ParsedCode {
  const trimmed = code.trim();
  if (!trimmed) return { kind: "empty" };

  const svg = trimmed.match(/<svg[\s\S]*?<\/svg>/i);
  if (svg) {
    const safeSvg = sanitizeSvg(svg[0]);
    return safeSvg
      ? { kind: "svg", svg: safeSvg }
      : { kind: "error", message: "The SVG is invalid or could not be safely rendered." };
  }

  const tags = [...code.matchAll(/<\s*([A-Z][A-Za-z0-9]*)\b([^>]*?)\/?>/g)];
  const known = tags.find((t) => typeof t[1] === "string" && isIconName(t[1]));

  if (!known) {
    const unknownTag = tags.find((t) => typeof t[1] === "string" && !["App", "Fragment", "Icon"].includes(t[1]));
    if (unknownTag) {
      return {
        kind: "error",
        message: `"${unknownTag[1]}" is not a lucide icon — pick one from the list or paste an <svg> block.`,
      };
    }
    return { kind: "unknown" };
  }

  const iconComponent = known[1];
  if (!iconComponent) return { kind: "unknown" };
  const attrs = known[2] ?? "";
  const color = readString(attrs, "color") ?? readString(attrs, "stroke");
  const size = readNumber(attrs, "size");
  const stroke = readNumber(attrs, "strokeWidth");

  if (size !== null && (size < 1 || size > 2048)) {
    return { kind: "error", message: `size={${size}} is out of range — use 1–2048.` };
  }
  if (stroke !== null && (stroke <= 0 || stroke > 12)) {
    return { kind: "error", message: `strokeWidth={${stroke}} is out of range — use 0.1–12.` };
  }
  if (color && !/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\(|hsla?\()/i.test(color)) {
    return { kind: "error", message: `"${color}" is not a valid CSS color.` };
  }

  return {
    kind: "icon",
    spec: {
      pascal: iconComponent,
      color: color ?? fallback.color,
      size: size ?? fallback.size,
      stroke: stroke ?? fallback.stroke,
      absolute: /\babsoluteStrokeWidth\b/.test(attrs),
    },
  };
}
