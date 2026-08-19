import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getPrintItemImage } from "@/lib/pipoca/print-queue.functions";

export const Route = createFileRoute("/imprimir/$queueId")({
  head: () => ({
    meta: [
      { title: "Imprimir — Projeto Natal" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintPage,
});

// 15 x 10 cm (paisagem) a 300 dpi — cartão-postal final.
const CANVAS_W = 1772;
const CANVAS_H = 1181;

async function fetchAsObjectURL(url: string): Promise<string> {
  const r = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

async function composePrintImage(photoUrl: string, queueId: string): Promise<string> {
  let photoObj: string | null = null;
  try {
    photoObj = await fetchAsObjectURL(photoUrl).catch(() => {
      throw new Error("PHOTO_LOAD_FAILED");
    });
    const photo = await loadImage(photoObj);

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_CTX_FAILED");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // object-fit: cover, object-position: center for the full card
    const srcRatio = photo.naturalWidth / photo.naturalHeight;
    const dstRatio = CANVAS_W / CANVAS_H;
    let sx = 0,
      sy = 0,
      sw = photo.naturalWidth,
      sh = photo.naturalHeight;
    if (srcRatio > dstRatio) {
      // source wider → crop sides
      sw = photo.naturalHeight * dstRatio;
      sx = (photo.naturalWidth - sw) / 2;
    } else {
      // source taller → crop top/bottom
      sh = photo.naturalWidth / dstRatio;
      sy = (photo.naturalHeight - sh) / 2;
    }
    ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, CANVAS_W, CANVAS_H);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("BLOB_FAILED"))),
        "image/jpeg",
        0.95,
      ),
    );
    const blobUrl = URL.createObjectURL(blob);
    console.log("[PIPOCA_PRINT_COMPOSE]", {
      queueId,
      canvas: `${CANVAS_W}x${CANVAS_H}`,
      blobSize: blob.size,
    });
    return blobUrl;
  } finally {
    if (photoObj) URL.revokeObjectURL(photoObj);
  }
}

function PrintPage() {
  const { queueId } = useParams({ from: "/imprimir/$queueId" });
  const getImage = useServerFn(getPrintItemImage);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparando impressão…");
  const printedRef = useRef(false);

  async function prepare() {
    setError(null);
    setStatus("Preparando impressão…");
    try {
      const r = await getImage({ data: { queueId } });
      if (!r.imageUrl) throw new Error("PHOTO_LOAD_FAILED");
      const blobUrl = await composePrintImage(r.imageUrl, queueId);
      setComposedUrl(blobUrl);
      setStatus("Pronto. Use o diálogo de impressão.");
    } catch (e) {
      setError("Não foi possível preparar a foto para impressão.");
    }
  }

  useEffect(() => {
    void prepare();
    return () => {
      if (composedUrl) URL.revokeObjectURL(composedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId]);

  function handleImgLoad() {
    if (printedRef.current) return;
    printedRef.current = true;
    setTimeout(() => window.print(), 300);
  }

  return (
    <>
      <style>{`
        @page { size: 15cm 10cm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #111; }
        @media print {
          html, body { background: white !important; width: 15cm; height: 10cm; overflow: hidden; }
          .no-print { display: none !important; }
          .print-frame { width: 15cm !important; height: 10cm !important; margin: 0 !important; box-shadow: none !important; }
          .print-frame img { width: 100% !important; height: 100% !important; object-fit: fill !important; }
        }
        .print-frame {
          width: 15cm; height: 10cm; background: white;
          display: block; margin: 1rem auto;
          box-shadow: 0 4px 30px rgba(0,0,0,0.3);
          overflow: hidden;
        }
        .print-frame img { display: block; width: 100%; height: 100%; object-fit: fill; }
      `}</style>
      <div
        className="no-print"
        style={{ padding: "1rem", color: "white", fontFamily: "sans-serif", textAlign: "center" }}
      >
        {error ? (
          <>
            <p style={{ color: "salmon" }}>{error}</p>
            <button
              onClick={() => void prepare()}
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
              Tentar novamente
            </button>
          </>
        ) : (
          <p>{status}</p>
        )}
        {composedUrl && !error && (
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
        )}
      </div>
      <div className="print-frame">
        {composedUrl ? <img src={composedUrl} alt="Cartão-postal para impressão" onLoad={handleImgLoad} /> : null}
      </div>
    </>
  );
}
