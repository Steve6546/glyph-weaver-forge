/**
 * Single export pipeline for the studio: every download and clipboard action
 * goes through one normalized SVG string so SVG / PNG / JPG never disagree.
 */

export type ExportFormat = "svg" | "png" | "jpg";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Serializes a live <svg> node into a standalone, correctly namespaced file. */
export function normalizeSvg(source: SVGSVGElement, size: number): string {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", "0 0 24 24");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  clone.removeAttribute("style");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  // The anchor must live in the document for Firefox/Safari to honor the click,
  // and the object URL must outlive the click for Chrome to finish writing.
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

export function downloadSvgFile(svg: string, name: string) {
  triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

/** Rasterizes the same SVG string at any pixel size, transparent by default. */
export async function rasterize(
  svg: string,
  pixels: number,
  background: string | null,
): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The icon could not be rendered as an image."));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, pixels, pixels);
  }
  ctx.drawImage(image, 0, 0, pixels, pixels);

  const type = background ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.95));
  if (!blob) throw new Error("The image could not be encoded.");
  return blob;
}

export async function downloadRaster(
  svg: string,
  name: string,
  pixels: number,
  format: Exclude<ExportFormat, "svg">,
) {
  const blob = await rasterize(svg, pixels, format === "jpg" ? "#ffffff" : null);
  triggerDownload(blob, `${name}-${pixels}.${format}`);
}

export async function copySvgToClipboard(svg: string) {
  await navigator.clipboard.writeText(svg);
}

export async function copyPngToClipboard(svg: string, pixels: number) {
  const blob = await rasterize(svg, pixels, null);
  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}
