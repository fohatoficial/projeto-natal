import { createFileRoute } from "@tanstack/react-router";
import { PipocaFlow } from "@/components/pipoca/PipocaFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pipoca & Cena — Projeto Natal" },
      {
        name: "description",
        content:
          "Experiência interativa: escolha um filme brasileiro, tire sua foto e entre em cena com inteligência artificial.",
      },
      { property: "og:title", content: "Pipoca & Cena — Projeto Natal" },
      {
        property: "og:description",
        content:
          "Escolha uma obra do catálogo, tire sua foto e veja a IA transformar você em personagem de uma cena inspirada no filme.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <PipocaFlow />;
}
