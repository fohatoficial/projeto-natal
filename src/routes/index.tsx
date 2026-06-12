import { createFileRoute } from "@tanstack/react-router";
import { PipocaFlow } from "@/components/pipoca/PipocaFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pipoca & Cena — Tela Brasil" },
      {
        name: "description",
        content:
          "Experiência interativa Tela Brasil: escolha um filme brasileiro, tire sua foto e entre em cena.",
      },
      { property: "og:title", content: "Pipoca & Cena — Tela Brasil" },
      {
        property: "og:description",
        content:
          "Escolha uma obra do catálogo Tela Brasil, tire sua foto e veja a IA transformar você em personagem de uma cena inspirada no filme.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <PipocaFlow />;
}
