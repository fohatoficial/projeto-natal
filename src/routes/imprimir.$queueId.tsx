import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getPrintItemImage } from "@/lib/pipoca/print-queue.functions";

export const Route = createFileRoute("/imprimir/$queueId")({
  head: () => ({
    meta: [
      { title: "Imprimir — Pipoca & Cena" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintPage,
});

function PrintPage() {
  const { queueId } = useParams({ from: "/imprimir/$queueId" });
  const getImage = useServerFn(getPrintItemImage);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getImage({ data: { queueId } });
        setImageUrl(r.imageUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar imagem");
      }
    })();
  }, [getImage, queueId]);

  function handleImgLoad() {
    // Trigger the browser print dialog once the image is on-screen.
    setTimeout(() => window.print(), 300);
  }

  return (
    <>
      <style>{`
        @page { size: 100mm 150mm; margin: 4mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
        }
        html, body { background: #111; margin: 0; }
        .print-frame {
          width: 100mm; height: 150mm; background: white;
          display: flex; align-items: center; justify-content: center;
          margin: 1rem auto; box-shadow: 0 4px 30px rgba(0,0,0,0.3);
        }
        @media print { .print-frame { box-shadow: none; margin: 0; } }
        .print-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
      `}</style>
      <div className="no-print" style={{ padding: "1rem", color: "white", fontFamily: "sans-serif" }}>
        {error ? (
          <p style={{ color: "salmon" }}>{error}</p>
        ) : (
          <p>Preparando impressão… use o diálogo do navegador.</p>
        )}
        <button
          onClick={() => window.print()}
          style={{
            marginTop: 12,
            background: "#F8BA32",
            color: "#000C20",
            border: 0,
            padding: "0.5rem 1rem",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Imprimir agora
        </button>
      </div>
      <div className="print-frame">
        {imageUrl ? (
          <img src={imageUrl} alt="Cena" onLoad={handleImgLoad} />
        ) : null}
      </div>
    </>
  );
}
