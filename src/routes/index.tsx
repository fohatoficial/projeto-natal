import { createFileRoute } from "@tanstack/react-router";
import { PipocaFlow } from "@/components/pipoca/PipocaFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Projeto Natal — Cartões-postais natalinos com IA" },
      {
        name: "description",
        content:
          "Transforme sua foto em um cartão-postal natalino coberto de neve, tendo como cenário lugares icônicos do Brasil.",
      },
      { property: "og:title", content: "Projeto Natal — Cartões-postais natalinos com IA" },
      {
        property: "og:description",
        content:
          "Neste Natal, escolha onde a magia vai acontecer: sua foto vira um cartão-postal coberto de neve em cenários icônicos do Brasil.",
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
