import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/resultado")({
  head: () => ({
    meta: [
      { title: "Seu cartão-postal natalino" },
      {
        name: "description",
        content:
          "Baixe e compartilhe o seu cartão-postal natalino criado com inteligência artificial.",
      },
      { property: "og:title", content: "Seu cartão-postal natalino" },
      {
        property: "og:description",
        content:
          "Seu cartão-postal natalino personalizado, pronto para baixar e compartilhar.",
      },
    ],
  }),
  component: () => <Outlet />,
});
