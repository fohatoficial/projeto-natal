import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CapitalGate } from "@/components/pipoca/CapitalGate";
import { readValidStoredCapital } from "@/lib/pipoca/capital-storage";

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
  const [ready, setReady] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");

  useEffect(() => {
    const search = window.location.search ?? "";
    setForwardSearch(search);
    const stored = readValidStoredCapital();
    if (stored) {
      console.log("[PIPOCA_CAPITAL]", "CAPITAL_SELECTION_REUSED", {
        capital_slug: stored.capital_slug,
        selected_date: stored.selected_date,
      });
      window.location.replace(`/experiencia/${stored.capital_slug}${search}`);
      return;
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold animate-spin" />
      </div>
    );
  }

  return <CapitalGate forwardSearch={forwardSearch} />;
}
