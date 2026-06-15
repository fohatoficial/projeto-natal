import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/resultado")({
  head: () => ({
    meta: [
      { title: "Sua cena Pipoca & Cena — Tela Brasil" },
      {
        name: "description",
        content:
          "Baixe e compartilhe a sua imagem personalizada criada na experiência Pipoca & Cena do Tela Brasil.",
      },
      { property: "og:title", content: "Sua cena — Pipoca & Cena" },
      {
        property: "og:description",
        content:
          "Sua imagem personalizada criada na experiência Pipoca & Cena do Tela Brasil.",
      },
    ],
  }),
  component: () => <Outlet />,
});
