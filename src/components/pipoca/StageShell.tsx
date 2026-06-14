import type { ReactNode } from "react";
import { BrandHeader } from "./BrandHeader";

type Props = {
  children: ReactNode;
  subtitle?: string;
  showStripe?: boolean;
};

export function StageShell({ children, subtitle = "Pipoca & Cena", showStripe = true }: Props) {
  return (
    <div className="h-[100dvh] w-screen bg-cinema text-white relative overflow-hidden flex flex-col">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 brand-pattern opacity-[0.06]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(248,186,50,0.12),_transparent_60%)]" />

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <BrandHeader subtitle={subtitle} />
        <main className="flex-1 flex flex-col px-8 pb-6 min-h-0 overflow-hidden">
          {children}
        </main>
        {showStripe ? <div className="brand-stripe shrink-0" /> : null}
      </div>
    </div>
  );
}
