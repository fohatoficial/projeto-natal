// Cliente-only helpers para a seleção diária de capital do técnico.
// A validade expira pela mudança do dia em America/Sao_Paulo (não por 24h).

export type StoredCapital = {
  capital_id: string;
  capital_name: string;
  capital_slug: string;
  selected_date: string; // YYYY-MM-DD em America/Sao_Paulo
};

export const CAPITAL_STORAGE_KEY = "pipoca_selected_capital";

const SP_DATE_FORMATTER =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : null;

/** Data corrente em America/Sao_Paulo no formato YYYY-MM-DD. */
export function getSaoPauloDateKey(now: Date = new Date()): string {
  if (SP_DATE_FORMATTER) return SP_DATE_FORMATTER.format(now);
  // Fallback (SSR / sem Intl): UTC -3 sem horário de verão.
  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function isStoredCapital(value: unknown): value is StoredCapital {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.capital_id === "string" &&
    typeof v.capital_name === "string" &&
    typeof v.capital_slug === "string" &&
    typeof v.selected_date === "string"
  );
}

export function readStoredCapital(): StoredCapital | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CAPITAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isStoredCapital(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readValidStoredCapital(): StoredCapital | null {
  const stored = readStoredCapital();
  if (!stored) return null;
  if (stored.selected_date !== getSaoPauloDateKey()) return null;
  return stored;
}

export function writeStoredCapital(input: Omit<StoredCapital, "selected_date">): StoredCapital {
  const payload: StoredCapital = {
    ...input,
    selected_date: getSaoPauloDateKey(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CAPITAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }
  return payload;
}

export function clearStoredCapital(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CAPITAL_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
