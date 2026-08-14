import { createFileRoute } from "@tanstack/react-router";
import { PipocaFlow } from "@/components/pipoca/PipocaFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Natal em Brasília — Seu cartão-postal natalino" },
      {
        name: "description",
        content:
          "Tire sua foto e receba um cartão-postal natalino em frente à Catedral Metropolitana de Brasília, criado com inteligência artificial.",
      },
      { property: "og:title", content: "Natal em Brasília — Seu cartão-postal natalino" },
      {
        property: "og:description",
        content:
          "Sozinho, em casal ou com a família: viva uma Brasília coberta de neve e leve seu cartão-postal de Natal.",
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
