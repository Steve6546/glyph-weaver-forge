import { createFileRoute } from "@tanstack/react-router";
import IconStudio from "@/components/IconStudio";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Lucide Icon Studio — Customize & Export Icons" },
      {
        name: "description",
        content:
          "Interactive icon customizer: tune color, stroke width and size, preview live, and copy code for React, Vue, Svelte, Solid, Angular and more.",
      },
      { property: "og:title", content: "Lucide Icon Studio — Customize & Export Icons" },
      {
        property: "og:description",
        content:
          "Tune color, stroke width and size, preview live, and copy framework-ready icon code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <IconStudio />;
}
