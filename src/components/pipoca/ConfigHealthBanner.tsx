import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getConfigHealth } from "@/lib/pipoca/config-health.functions";

/**
 * Fixed banner shown when required server secrets are missing.
 * Only variable names are displayed — never their values.
 */
export function ConfigHealthBanner() {
  const check = useServerFn(getConfigHealth);
  const { data } = useQuery({
    queryKey: ["pipoca", "config-health"],
    queryFn: () => check({}),
    staleTime: 60_000,
    retry: false,
  });

  if (!data || data.ok) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[9999] border-b border-destructive/40 bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-lg"
    >
      <p className="font-semibold">Configuração incompleta do servidor</p>
      <p className="mt-1 opacity-90">
        As seguintes variáveis de ambiente estão faltando ou inválidas:{" "}
        <span className="font-mono">{data.missing.join(", ")}</span>. Geração de imagens, fila de
        impressão e acesso ao banco podem falhar até que sejam configuradas.
      </p>
    </div>
  );
}
