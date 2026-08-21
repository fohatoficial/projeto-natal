import { useMemo, useRef, useState } from "react";
import {
  PRESET_MESSAGES,
  POSTCARD_MESSAGE_MAX,
  FONT_STYLES,
  DIVIDER_STYLES,
  sanitizeMessage,
  type PostcardFontStyle,
  type PostcardDividerStyle,
  type PostcardSelection,
} from "@/lib/pipoca/postcard-messages";

const LOG = "[PIPOCA_POSTCARD_UI]";

/**
 * Jornada da mensagem em etapas curtas (totem-friendly):
 *   choose  → presets ───────────────────────┐
 *   choose  → write (conteúdo) → style (toque) ─┴→ onReady(seleção)
 *
 * Este componente NÃO renderiza o cartão nem fala com o servidor: ele apenas
 * coleta mensagem, fonte e divisor. Isso permite que a geração da fotografia
 * rode em background desde o fim da captura, usando o tempo de personalização
 * para esconder o delay da IA. Quem verifica o status da geração e monta o
 * cartão é o fluxo principal (PipocaFlow), ao receber onReady.
 */
type Mode = "choose" | "presets" | "write" | "style";

/* ---------------------------- ícones refinados ---------------------------- */

const IconCard = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="w-full h-full">
    <rect x="3" y="7" width="26" height="18" rx="2" />
    <path d="M8 13h9M8 17h13M8 21h7" />
    <path d="M24 11.5v3M22.5 13h3" />
  </svg>
);
const IconPencil = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M5 27h9" />
    <path d="M22 4.5a2.8 2.8 0 0 1 4 4L11 23.5 5.5 25.5 7.5 20Z" />
    <path d="M20 6.5 24 10.5" />
  </svg>
);
const Arrow = ({ dir }: { dir: -1 | 1 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d={dir === -1 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

/** Miniaturas reais dos divisores (mesmo desenho do template). */
function DividerGlyph({ style }: { style: PostcardDividerStyle }) {
  const line = (x1: number, x2: number) => (
    <line x1={x1} y1="12" x2={x2} y2="12" stroke="currentColor" strokeWidth="1" opacity="0.7" />
  );
  return (
    <svg viewBox="0 0 110 24" className="w-[104px] h-6 text-gold">
      {style !== "branch" && line(4, 40)}
      {style !== "branch" && line(70, 106)}
      {style === "snowflake" &&
        [0, 1, 2, 3, 4, 5].map((i) => {
          const a = (Math.PI / 3) * i;
          return (
            <line
              key={i}
              x1="55"
              y1="12"
              x2={55 + Math.cos(a) * 9}
              y2={12 + Math.sin(a) * 9}
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          );
        })}
      {style === "star" && (
        <path
          d="M55 3l2.2 6.3L63.5 12l-6.3 2.7L55 21l-2.2-6.3L46.5 12l6.3-2.7Z"
          fill="currentColor"
        />
      )}
      {style === "branch" && (
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none">
          <path d="M8 12h38M104 12H66" />
          <path d="M18 12l-4-4M18 12l-4 4M28 12l-4-4M28 12l-4 4M38 12l-4-4M38 12l-4 4" />
          <path d="M94 12l4-4M94 12l4 4M84 12l4-4M84 12l4 4M74 12l4-4M74 12l4 4" />
          <circle cx="55" cy="12" r="3" fill="#8F1520" stroke="none" />
          <circle cx="49" cy="16" r="2" fill="#8F1520" stroke="none" />
          <circle cx="61" cy="16" r="2" fill="#8F1520" stroke="none" />
        </g>
      )}
      {style === "ornament" && (
        <g stroke="currentColor" strokeWidth="1.2" fill="none">
          <path d="M55 3l8 9-8 9-8-9Z" />
          <path d="M55 8.5l3.6 3.5-3.6 3.5-3.6-3.5Z" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

/* -------------------------------- componente ------------------------------ */

export function PostcardComposer({
  initial,
  onReady,
}: {
  /**
   * Seleção anterior, usada para restaurar o estado quando o visitante volta
   * da prévia do cartão para trocar a mensagem. Nada é perdido.
   */
  initial?: PostcardSelection | null;
  /** Disparado ao tocar em "Ver meu cartão-postal" (fim da personalização). */
  onReady: (selection: PostcardSelection) => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [index, setIndex] = useState(() => {
    if (initial?.messageType === "preset") {
      const i = PRESET_MESSAGES.findIndex((m) => m.text === initial.message);
      return i >= 0 ? i : 0;
    }
    return 0;
  });
  const [custom, setCustom] = useState(
    initial?.messageType === "custom" ? initial.message : "",
  );
  const [fontStyle, setFontStyle] = useState<PostcardFontStyle>(
    initial?.fontStyle ?? "classic",
  );
  const [dividerStyle, setDividerStyle] = useState<PostcardDividerStyle>(
    initial?.dividerStyle ?? "snowflake",
  );
  const touchX = useRef<number | null>(null);

  const current = PRESET_MESSAGES[index]!;
  const currentFontCss = useMemo(
    () => FONT_STYLES.find((f) => f.id === current.font)?.css,
    [current.font],
  );
  const move = (delta: number) =>
    setIndex((i) => (i + delta + PRESET_MESSAGES.length) % PRESET_MESSAGES.length);

  const cleanCustom = sanitizeMessage(custom).trim();

  return (
    <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center gap-6 py-4 px-5">
      {/* ---------------------------- escolha inicial --------------------------- */}
      {mode === "choose" && (
        <div className="w-full flex flex-col items-center gap-8 animate-fade-up">
          <div className="text-center">
            <p className="natal-eyebrow">Seu cartão-postal</p>
            <h1 className="mt-3 font-display text-4xl sm:text-6xl text-snow leading-[1.05]">
              Como você quer escrever sua{" "}
              <span className="font-script text-gold text-[1.25em] leading-none">mensagem</span>?
            </h1>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 w-full max-w-3xl">
            {[
              {
                key: "presets" as const,
                icon: <IconCard />,
                title: "Escolher uma mensagem pronta",
                hint: "Cinco mensagens curadas",
              },
              {
                key: "write" as const,
                icon: <IconPencil />,
                title: "Criar minha própria mensagem",
                hint: "Do seu jeito, em duas etapas",
              },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setMode(o.key)}
                className="natal-card p-9 min-h-[210px] flex flex-col items-center justify-center gap-4 text-center"
              >
                <span className="w-14 h-14 text-gold">{o.icon}</span>
                <span className="font-display text-2xl sm:text-3xl text-snow leading-tight">
                  {o.title}
                </span>
                <span className="natal-eyebrow">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------- carrossel editorial -------------------------- */}
      {mode === "presets" && (
        <div className="w-full flex flex-col items-center gap-6 animate-fade-up">
          <p className="natal-eyebrow">Sua mensagem de Natal</p>
          <div
            className="w-full max-w-3xl flex items-center gap-3 sm:gap-6"
            onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const start = touchX.current;
              const end = e.changedTouches[0]?.clientX ?? null;
              if (start != null && end != null && Math.abs(end - start) > 45) {
                move(end < start ? 1 : -1);
              }
              touchX.current = null;
            }}
          >
            <button
              type="button"
              aria-label="Mensagem anterior"
              onClick={() => move(-1)}
              className="shrink-0 w-12 h-12 rounded-full grid place-items-center text-gold border border-gold/35 hover:bg-gold/10 transition"
            >
              <Arrow dir={-1} />
            </button>
            <div className="flex-1 min-h-[220px] grid place-items-center px-2">
              <p
                key={current.id}
                className="story-pop text-center text-ivory text-[1.7rem] sm:text-[2.4rem] leading-[1.35]"
                style={{ fontFamily: currentFontCss }}
              >
                {current.text}
              </p>
            </div>
            <button
              type="button"
              aria-label="Próxima mensagem"
              onClick={() => move(1)}
              className="shrink-0 w-12 h-12 rounded-full grid place-items-center text-gold border border-gold/35 hover:bg-gold/10 transition"
            >
              <Arrow dir={1} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {PRESET_MESSAGES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                aria-label={`Mensagem ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-gold" : "w-2 bg-ivory/30"
                }`}
              />
            ))}
          </div>
          <p className="text-xs tracking-[0.3em] uppercase text-ivory/50">
            {index + 1} de {PRESET_MESSAGES.length}
          </p>
          <div className="flex flex-col items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                console.log(`${LOG} mensagem pronta escolhida`, { id: current.id });
                onReady({
                  message: current.text,
                  messageType: "preset",
                  fontStyle: current.font,
                  dividerStyle: current.divider,
                });
              }}
              className="natal-btn natal-btn-primary text-sm"
            >
              Ver meu cartão-postal
            </button>
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-[0.65rem] uppercase tracking-[0.35em] text-ivory/55 hover:text-ivory py-2"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* -------------------- etapa A — escrever a mensagem -------------------- */}
      {mode === "write" && (
        <div className="w-full max-w-2xl flex flex-col items-center gap-7 animate-fade-up">
          <div className="text-center">
            <p className="natal-eyebrow">Mensagem personalizada</p>
            <h1 className="mt-2 font-display text-3xl sm:text-5xl text-snow leading-[1.05]">
              Escreva sua{" "}
              <span className="font-script text-gold text-[1.2em] leading-none">mensagem</span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-ivory/60 max-w-md mx-auto">
              Primeiro o conteúdo. O toque final vem na próxima etapa.
            </p>
          </div>

          <div className="w-full">
            <textarea
              value={custom}
              onChange={(e) => setCustom(sanitizeMessage(e.target.value))}
              maxLength={POSTCARD_MESSAGE_MAX}
              rows={3}
              autoFocus
              placeholder="Escreva algo especial…"
              className="natal-input w-full px-5 py-4 text-lg placeholder:text-ivory/35 resize-none"
            />
            <p className="mt-1 text-right text-xs tracking-[0.2em] text-ivory/50">
              {String(custom.length).padStart(2, "0")} / {POSTCARD_MESSAGE_MAX}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={!cleanCustom}
              onClick={() => setMode("style")}
              className="natal-btn natal-btn-primary text-sm disabled:opacity-40"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-[0.65rem] uppercase tracking-[0.35em] text-ivory/55 hover:text-ivory py-2"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* -------------------- etapa B — dê seu toque ao cartão ------------------ */}
      {mode === "style" && (
        <div className="w-full max-w-2xl flex flex-col items-center gap-7 animate-fade-up">
          <div className="text-center">
            <p className="natal-eyebrow">Toque final</p>
            <h1 className="mt-2 font-display text-3xl sm:text-5xl text-snow leading-[1.05]">
              Dê seu toque ao{" "}
              <span className="font-script text-gold text-[1.2em] leading-none">cartão</span>
            </h1>
            <p className="mt-3 text-sm text-ivory/55 italic max-w-md mx-auto">
              “{cleanCustom}”
            </p>
          </div>

          <div className="w-full">
            <p className="natal-eyebrow mb-3">Estilo da letra</p>
            <div className="grid grid-cols-3 gap-3">
              {FONT_STYLES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-selected={fontStyle === f.id}
                  onClick={() => setFontStyle(f.id)}
                  className="natal-card px-3 py-5 flex flex-col items-center gap-1 text-center"
                >
                  <span
                    className="text-ivory text-2xl leading-tight"
                    style={{ fontFamily: f.css }}
                  >
                    {f.label}
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-[0.2em] text-ivory/45">
                    {f.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="w-full">
            <p className="natal-eyebrow mb-3">Divisor decorativo</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DIVIDER_STYLES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  data-selected={dividerStyle === d.id}
                  onClick={() => setDividerStyle(d.id)}
                  className="natal-card px-3 py-4 flex flex-col items-center gap-2"
                >
                  <DividerGlyph style={d.id} />
                  <span className="text-[0.6rem] uppercase tracking-[0.25em] text-ivory/55">
                    {d.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={!cleanCustom}
              onClick={() => {
                console.log(`${LOG} mensagem personalizada concluída`, {
                  chars: cleanCustom.length,
                  font: fontStyle,
                  divider: dividerStyle,
                });
                onReady({
                  message: cleanCustom,
                  messageType: "custom",
                  fontStyle,
                  dividerStyle,
                });
              }}
              className="natal-btn natal-btn-primary text-sm disabled:opacity-40"
            >
              Ver meu cartão-postal
            </button>
            <button
              type="button"
              onClick={() => setMode("write")}
              className="text-[0.65rem] uppercase tracking-[0.35em] text-ivory/55 hover:text-ivory py-2"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
