import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  PRESET_MESSAGES,
  POSTCARD_MESSAGE_MAX,
  sanitizeMessage,
  type PostcardMessageType,
} from "@/lib/pipoca/postcard-messages";
import { renderPostcard } from "@/lib/pipoca/postcard-render";
import {
  preparePipocaPostcardUpload,
  confirmPipocaPostcard,
} from "@/lib/pipoca/postcard.functions";

const LOG = "[PIPOCA_POSTCARD_UI]";

type Mode = "choose" | "presets" | "custom" | "preview";

const IconCard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M6 9.5h7M6 13h9M6 16h5" />
  </svg>
);
const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z" />
  </svg>
);

export function PostcardComposer({
  photoUrl,
  generationId,
  firstName,
  onFinalized,
}: {
  photoUrl: string;
  generationId: string;
  firstName?: string;
  onFinalized: (postcardUrl: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<PostcardMessageType>("preset");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const previewRef = useRef<string | null>(null);

  const prepareFn = useServerFn(preparePipocaPostcardUpload);
  const confirmFn = useServerFn(confirmPipocaPostcard);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const buildPreview = useCallback(
    async (text: string, type: PostcardMessageType) => {
      setError(null);
      setRendering(true);
      try {
        const out = await renderPostcard(photoUrl, text);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = out.objectUrl;
        blobRef.current = out.blob;
        setPreviewUrl(out.objectUrl);
        setMessage(text);
        setMessageType(type);
        setMode("preview");
        console.log(`${LOG} preview composto`, { type, chars: text.length });
      } catch (e) {
        console.warn(`${LOG} falha ao compor`, e);
        setError("Não conseguimos montar seu cartão-postal. Tente novamente.");
      } finally {
        setRendering(false);
      }
    },
    [photoUrl],
  );

  async function finalize() {
    if (!blobRef.current || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { path, token } = await prepareFn({ data: { generationId } });
      const { error: upErr } = await supabase.storage
        .from("pipoca-generated-scenes")
        .uploadToSignedUrl(path, token, blobRef.current, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const res = await confirmFn({
        data: { generationId, path, messageType, messageText: message },
      });
      console.log(`${LOG} cartão finalizado`);
      onFinalized(res.postcardUrl);
    } catch (e) {
      console.warn(`${LOG} falha ao finalizar`, e);
      setError("Não conseguimos salvar seu cartão-postal. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const customValid = sanitizeMessage(custom).trim().length > 0;

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center gap-5 py-4 px-4">
      {mode === "choose" && (
        <>
          <h1 className="font-display text-3xl sm:text-5xl text-snow text-center leading-tight">
            {firstName ? `${firstName}, como ` : "Como "}você quer escrever sua{" "}
            <span className="text-gold">mensagem</span>?
          </h1>
          <div className="grid gap-4 sm:grid-cols-2 w-full mt-2">
            <button
              type="button"
              onClick={() => setMode("presets")}
              className="group rounded-2xl border border-gold/40 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] transition p-7 min-h-[190px] flex flex-col items-center justify-center gap-3 text-center"
            >
              <span className="w-14 h-14 text-gold"><IconCard /></span>
              <span className="font-display text-2xl text-snow">Escolher uma mensagem pronta</span>
              <span className="text-sm text-white/65">Cinco mensagens natalinas prontas para você.</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className="group rounded-2xl border border-gold/40 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] transition p-7 min-h-[190px] flex flex-col items-center justify-center gap-3 text-center"
            >
              <span className="w-14 h-14 text-gold"><IconPencil /></span>
              <span className="font-display text-2xl text-snow">Criar minha própria mensagem</span>
              <span className="text-sm text-white/65">
                Escreva algo especial com até {POSTCARD_MESSAGE_MAX} caracteres.
              </span>
            </button>
          </div>
        </>
      )}

      {mode === "presets" && (
        <>
          <h1 className="font-display text-3xl sm:text-4xl text-snow text-center">
            Escolha sua <span className="text-gold">mensagem</span>
          </h1>
          <div className="w-full grid gap-3">
            {PRESET_MESSAGES.map((m) => {
              const active = presetId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPresetId(m.id)}
                  className={`w-full text-left rounded-xl border px-5 py-4 transition text-base sm:text-lg ${
                    active
                      ? "border-gold bg-gold/15 text-snow"
                      : "border-white/20 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]"
                  }`}
                >
                  {m.text}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!presetId || rendering}
              onClick={() => {
                const found = PRESET_MESSAGES.find((m) => m.id === presetId);
                if (found) void buildPreview(found.text, "preset");
              }}
              className="bg-gold text-[#0A1A2F] font-semibold uppercase tracking-wider rounded-md px-8 py-4 text-sm disabled:opacity-40 hover:brightness-110 transition"
            >
              {rendering ? "Montando…" : "Ver meu cartão-postal"}
            </button>
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white py-2"
            >
              Voltar
            </button>
          </div>
        </>
      )}

      {mode === "custom" && (
        <>
          <h1 className="font-display text-3xl sm:text-4xl text-snow text-center">
            Escreva sua <span className="text-gold">mensagem</span>
          </h1>
          <div className="w-full max-w-xl">
            <textarea
              value={custom}
              onChange={(e) => setCustom(sanitizeMessage(e.target.value))}
              maxLength={POSTCARD_MESSAGE_MAX}
              rows={4}
              placeholder="Escreva algo especial…"
              className="w-full rounded-xl border border-white/25 bg-black/40 px-4 py-4 text-lg text-snow placeholder:text-white/35 focus:outline-none focus:border-gold"
            />
            <p className="mt-1 text-right text-xs text-white/55">
              {custom.length}/{POSTCARD_MESSAGE_MAX}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              disabled={!customValid || rendering}
              onClick={() => void buildPreview(sanitizeMessage(custom).trim(), "custom")}
              className="bg-gold text-[#0A1A2F] font-semibold uppercase tracking-wider rounded-md px-8 py-4 text-sm disabled:opacity-40 hover:brightness-110 transition"
            >
              {rendering ? "Montando…" : "Ver meu cartão-postal"}
            </button>
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white py-2"
            >
              Voltar
            </button>
          </div>
        </>
      )}

      {mode === "preview" && previewUrl && (
        <>
          <h1 className="font-display text-3xl sm:text-4xl text-snow text-center">
            Seu <span className="text-gold">cartão-postal</span>
          </h1>
          <div className="w-full max-w-3xl rounded-xl overflow-hidden border border-gold/30 shadow-2xl bg-black">
            <img src={previewUrl} alt="Prévia do cartão-postal natalino" className="block w-full h-auto" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setMode("choose")}
              disabled={saving}
              className="border border-white/30 text-white font-medium uppercase tracking-wider rounded-md px-7 py-4 text-sm hover:bg-white/5 transition disabled:opacity-50"
            >
              Trocar mensagem
            </button>
            <button
              type="button"
              onClick={() => void finalize()}
              disabled={saving}
              className="bg-gold text-[#0A1A2F] font-semibold uppercase tracking-wider rounded-md px-8 py-4 text-sm hover:brightness-110 transition disabled:opacity-50"
            >
              {saving ? "Finalizando…" : "Finalizar meu cartão-postal"}
            </button>
          </div>
          <p className="text-xs text-white/45">
            Trocar a mensagem não gera a fotografia novamente.
          </p>
        </>
      )}

      {error && (
        <p className="text-sm text-red-300 text-center max-w-md">{error}</p>
      )}
    </div>
  );
}
