import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getPublicPipocaResult, type PublicResult } from "@/lib/pipoca/public-result.functions";

import { EXPERIENCE_NAME, SPONSOR } from "@/lib/pipoca/branding";

export const Route = createFileRoute("/resultado/$publicToken")({
  head: () => ({
    meta: [
      { title: "Seu cartão-postal natalino" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Seu cartão-postal natalino gerado com inteligência artificial.",
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

function PublicResultPage() {
  const { publicToken } = useParams({ from: "/resultado/$publicToken" });
  const normalizedPublicToken = publicToken.trim();
  const fetchPublic = useServerFn(getPublicPipocaResult);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
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
    const title = "Meu cartão-postal natalino";
    const text = "Criei meu cartão-postal de Natal com inteligência artificial.";
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


  return (
    <div
      className="min-h-[100dvh] w-full bg-cinema text-white"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)",
        paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
      }}
    >
      <div className="mx-auto w-full max-w-md px-5 flex flex-col items-center">
        {SPONSOR.sponsorLogoUrl ? (
          <img
            src={SPONSOR.sponsorLogoUrl}
            alt={SPONSOR.sponsorName ?? "Patrocinador"}
            className="h-8 w-auto opacity-95"
          />
        ) : null}
        {SPONSOR.actionName ?? EXPERIENCE_NAME ? (
          <span className="font-display text-2xl text-snow">
            {SPONSOR.actionName ?? EXPERIENCE_NAME}
          </span>
        ) : null}
        <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold">
          Cartão-postal natalino
        </span>

        {status.kind === "loading" && (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-transparent border-t-gold animate-spin" />
            <p className="text-white/70 text-sm">Carregando seu cartão-postal…</p>
          </div>
        )}

        {status.kind === "missing" && (
          <ErrorBlock
            title="Resultado não encontrado"
            body="Este link não corresponde a nenhum cartão-postal. Verifique o QR Code e tente novamente."
          />
        )}
        {status.kind === "pending" && (
          <ErrorBlock
            title="Seu cartão-postal ainda está sendo preparado"
            body="Aguarde alguns instantes e atualize a página."
          />
        )}
        {status.kind === "imageUnavailable" && (
          <ErrorBlock
            title="Não foi possível carregar seu cartão-postal"
            body="A imagem não está disponível no momento."
          />
        )}
        {status.kind === "error" && (
          <ErrorBlock title="Algo deu errado" body={status.message} />
        )}

        {status.kind === "ready" && (
          <>
            <h1 className="font-display text-3xl sm:text-4xl text-center mt-6 leading-[0.95]">
              Seu cartão-postal está <span className="text-gold">pronto</span>
            </h1>
            <p className="mt-2 text-center text-sm text-white/70">
              {status.data.filmTitle}
            </p>

            <div className="mt-5 w-full rounded-xl overflow-hidden border border-white/15 bg-black shadow-2xl">
              <img
                src={status.data.imageUrl}
                alt={`Cartão-postal natalino — ${status.data.filmTitle}`}
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

              <div className="rounded-md border border-gold/40 bg-gold/5 p-3 text-center">
                <p className="font-display text-sm uppercase tracking-wider text-gold">
                  Seu cartão-postal já foi enviado para impressão
                </p>
                <p className="mt-1 text-[11px] text-white/75">
                  Dirija-se ao balcão para retirar sua foto.
                </p>
              </div>
            </div>

            {/* Área reservada para o patrocinador (a definir). */}
            {SPONSOR.institutionalMessage || SPONSOR.sponsorName ? (
              <div className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                {SPONSOR.institutionalMessage ? (
                  <p className="text-sm text-white/80">{SPONSOR.institutionalMessage}</p>
                ) : null}
                {SPONSOR.sponsorName ? (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/50">
                    Oferecido por {SPONSOR.sponsorName}
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="mt-6 text-[10px] uppercase tracking-[0.3em] text-white/40 text-center">
              {new Date(status.data.createdAt).toLocaleDateString("pt-BR")}
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
