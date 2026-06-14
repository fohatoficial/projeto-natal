const LOGO_URL =
  "/__l5e/assets-v1/ebc60a74-6a98-4a67-97b1-950064f94104/logo_tela_brasil_light.svg";

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="flex flex-col items-center gap-2 pt-8 pb-4">
      <img src={LOGO_URL} alt="Tela Brasil" className="h-8 opacity-90" />
      {subtitle ? (
        <span className="text-[11px] uppercase tracking-[0.32em] text-gold/80">
          {subtitle}
        </span>
      ) : null}
    </header>
  );
}
