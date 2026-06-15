import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getPublicPipocaResult, type PublicResult } from "@/lib/pipoca/public-result.functions";
import { requestPipocaPrint } from "@/lib/pipoca/print-queue.functions";

const LOGO_URL =
  "/__l5e/assets-v1/ebc60a74-6a98-4a67-97b1-950064f94104/logo_tela_brasil_light.svg";

export const Route = createFileRoute("/resultado/$publicToken")({
  head: () => ({
    meta: [
      { title: "Sua cena Pipoca & Cena — Tela Brasil" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Sua cena cinematográfica gerada na experiência Pipoca & Cena.",
      },
    ],
  }),
  component: PublicResultPage,
});

type Status =
  | { kind: "loading" }
  | { kind: "ready"; data: PublicResult }
  | { kind: "missing" }
  | { kind: "pending" }
  | { kind: "imageUnavailable" }
  | { kind: "error"; message: string };

type PrintState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; alreadyQueued: boolean }
  | { kind: "error"; message: string };

function PublicResultPage() {
  const { publicToken } = useParams({ from: "/resultado/$publicToken" });
  const normalizedPublicToken = publicToken.trim();
  const fetchPublic = useServerFn(getPublicPipocaResult);
  const requestPrint = useServerFn(requestPipocaPrint);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [print, setPrint] = useState<PrintState>({ kind: "idle" });
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fetchedTokenRef = useRef<string | null>(null);

  // Release any kiosk scroll-lock that may be inherited and ensure mobile
  // scroll works on this public page. Restore prior styles on unmount.
  useEffect(() => {
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      bodyPosition: document.body.style.position,
    };
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.body.style.position = "static";
    document.body.classList.add("pipoca-public-result-page");
    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height = prev.bodyHeight;
      document.body.style.position = prev.bodyPosition;
      document.body.classList.remove("pipoca-public-result-page");
    };
  }, []);

  useEffect(() => {
    if (fetchedTokenRef.current === normalizedPublicToken) return;
    fetchedTokenRef.current = normalizedPublicToken;
    setStatus({ kind: "loading" });
    (async () => {
      try {
        const data = await fetchPublic({ data: { publicToken: normalizedPublicToken } });
        setStatus({ kind: "ready", data });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro";
        if (msg.includes("processando")) setStatus({ kind: "pending" });
        else if (msg.includes("Imagem") || msg.includes("URL")) {
          setStatus({ kind: "imageUnavailable" });
        } else if (msg.includes("não encontrado") || msg.includes("Token") || msg.includes("uuid")) {
          setStatus({ kind: "missing" });
        } else setStatus({ kind: "error", message: msg });
      }
    })();
  }, [fetchPublic, normalizedPublicToken]);

  async function handleDownload() {
    if (status.kind !== "ready" || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(status.data.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = status.data.downloadFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      window.open(status.data.imageUrl, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    if (status.kind !== "ready") return;
    const shareUrl = window.location.href;
    const title = "Minha cena — Pipoca & Cena";
    const text = "Inspirado em cinema brasileiro · Pipoca & Cena";
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {/* user cancelled */}
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {/* noop */}
  }

  async function handleRequestPrint() {
    if (print.kind === "loading" || print.kind === "ok") return;
    setPrint({ kind: "loading" });
    try {
      const res = await requestPrint({ data: { publicToken: normalizedPublicToken } });
      setPrint({ kind: "ok", alreadyQueued: res.alreadyQueued });
    } catch (e) {
      setPrint({
        kind: "error",
        message: e instanceof Error ? e.message : "Não foi possível solicitar a impressão",
      });
    }
  }

  return (
    <div
      className="min-h-[100dvh] w-full bg-[#000C20] text-white"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)",
        paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
      }}
    >
      <div className="mx-auto w-full max-w-md px-5 flex flex-col items-center">
        <img src={LOGO_URL} alt="Tela Brasil" className="h-9 w-auto" />
        <span className="mt-2 text-[10px] uppercase tracking-[0.3em] text-gold">
          Pipoca &amp; Cena
        </span>

        {status.kind === "loading" && (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-transparent border-t-gold animate-spin" />
            <p className="text-white/70 text-sm">Carregando sua cena…</p>
          </div>
        )}

        {status.kind === "missing" && (
          <ErrorBlock
            title="RESULTADO NÃO ENCONTRADO"
            body="Este link não corresponde a nenhuma cena. Verifique o QR Code e tente novamente."
          />
        )}
        {status.kind === "pending" && (
          <ErrorBlock
            title="SUA CENA AINDA ESTÁ SENDO PREPARADA"
            body="Aguarde alguns instantes e atualize a página."
          />
        )}
        {status.kind === "imageUnavailable" && (
          <ErrorBlock
            title="NÃO FOI POSSÍVEL CARREGAR SUA CENA"
            body="A imagem desta cena não está disponível no momento."
          />
        )}
        {status.kind === "error" && (
          <ErrorBlock title="Algo deu errado" body={status.message} />
        )}

        {status.kind === "ready" && (
          <>
            <h1 className="font-display text-3xl sm:text-4xl text-center mt-6 leading-[0.95]">
              SUA CENA ESTÁ <span className="text-gold">PRONTA</span>
            </h1>
            <p className="mt-2 text-center text-sm text-white/70">
              Inspirado em <span className="text-white">{status.data.filmTitle}</span>
            </p>

            <div className="mt-5 w-full rounded-xl overflow-hidden border border-white/15 bg-black shadow-2xl">
              <img
                src={status.data.imageUrl}
                alt={`Cena inspirada em ${status.data.filmTitle}`}
                className="block w-full h-auto"
              />
            </div>

            <div className="mt-5 w-full flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="w-full bg-gold text-[#000C20] font-semibold tracking-wider uppercase rounded-md py-3.5 text-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              >
                {downloading ? "Baixando…" : "Baixar imagem"}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="w-full border border-white/30 text-white font-medium tracking-wider uppercase rounded-md py-3.5 text-sm hover:bg-white/5 active:scale-[0.99] transition"
              >
                {copied ? "Link copiado!" : "Compartilhar"}
              </button>

              <button
                type="button"
                onClick={handleRequestPrint}
                disabled={print.kind === "loading" || print.kind === "ok"}
                className="w-full border border-gold/60 text-gold font-semibold tracking-wider uppercase rounded-md py-3.5 text-sm hover:bg-gold/10 active:scale-[0.99] transition disabled:opacity-70"
              >
                {print.kind === "loading"
                  ? "Solicitando…"
                  : print.kind === "ok"
                    ? print.alreadyQueued
                      ? "Sua impressão já está na fila"
                      : "Impressão solicitada"
                    : "Solicitar impressão"}
              </button>

              {print.kind === "ok" && (
                <p className="text-xs text-white/70 text-center">
                  Informe seu nome à recepcionista para retirar sua foto.
                </p>
              )}
              {print.kind === "error" && (
                <p className="text-xs text-red-300 text-center">{print.message}</p>
              )}
            </div>

            <p className="mt-6 text-[10px] uppercase tracking-[0.3em] text-white/40 text-center">
              Tela Brasil · {new Date(status.data.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ErrorBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 text-center max-w-sm">
      <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
      <p className="text-white/70 text-sm">{body}</p>
    </div>
  );
}
