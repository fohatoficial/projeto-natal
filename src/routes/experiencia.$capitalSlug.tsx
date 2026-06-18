import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PipocaFlow } from "@/components/pipoca/PipocaFlow";
import { listActiveCapitals } from "@/lib/pipoca/capitals.functions";
import {
  clearStoredCapital,
  readValidStoredCapital,
  writeStoredCapital,
} from "@/lib/pipoca/capital-storage";

export const Route = createFileRoute("/experiencia/$capitalSlug")({
  head: () => ({
    meta: [
      { title: "Pipoca & Cena — Tela Brasil" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExperienceByCapital,
});

function ExperienceByCapital() {
  const { capitalSlug } = useParams({ from: "/experiencia/$capitalSlug" });
  const listFn = useServerFn(listActiveCapitals);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; slug: string }
    | { kind: "invalid" }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await listFn({});
        if (!alive) return;
        const match = r.capitals.find((c) => c.slug === capitalSlug);
        if (!match) {
          console.warn("[PIPOCA_CAPITAL]", "CAPITAL_INVALID", { capital_slug: capitalSlug });
          clearStoredCapital();
          setState({ kind: "invalid" });
          return;
        }
        // Mantém a seleção do dia em sincronia com a URL.
        const stored = readValidStoredCapital();
        if (!stored || stored.capital_slug !== match.slug) {
          writeStoredCapital({
            capital_id: match.id,
            capital_name: match.name,
            capital_slug: match.slug,
          });
        }
        setState({ kind: "ok", slug: match.slug });
      } catch {
        if (!alive) return;
        setState({ kind: "invalid" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [capitalSlug, listFn]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold animate-spin" />
      </div>
    );
  }

  if (state.kind === "invalid") {
    if (typeof window !== "undefined") {
      const search = window.location.search ?? "";
      window.location.replace(`/${search}`);
    }
    return null;
  }

  return <PipocaFlow capitalSlug={state.slug} />;
}
