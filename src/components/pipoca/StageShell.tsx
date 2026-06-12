import type { ReactNode } from "react";
import { BrandHeader } from "./BrandHeader";

type Props = {
  children: ReactNode;
  subtitle?: string;
  showStripe?: boolean;
};

export function StageShell({ children, subtitle = "Pipoca & Cena", showStripe = true }: Props) {
  return (
    <div className="min-h-screen w-full bg-cinema text-white relative overflow-hidden flex flex-col">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 brand-pattern opacity-[0.06]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(248,186,50,0.12),_transparent_60%)]" />

      <div className="relative z-10 flex-1 flex flex-col">
        <BrandHeader subtitle={subtitle} />
        <main className="flex-1 flex flex-col px-6 pb-10">{children}</main>
        {showStripe ? <div className="brand-stripe" /> : null}
      </div>
    </div>
  );
}
