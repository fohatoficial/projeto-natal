// WhatsApp helpers — Brazilian format only.
// Mask: (00) 00000-0000  →  E.164: +55DDDXXXXXXXXX

const DDDS = new Set([
  11,12,13,14,15,16,17,18,19,
  21,22,24,27,28,
  31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,
  51,53,54,55,
  61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,
  81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99,
]);

export function onlyDigits(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

export function formatWhatsappMask(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidBrWhatsapp(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return false;
  // Mobile must start with 9.
  if (d[2] !== "9") return false;
  return true;
}

export function toE164Br(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 11) throw new Error("WhatsApp inválido");
  return `+55${d}`;
}

export function last4FromE164(e164: string): string {
  const d = onlyDigits(e164);
  return d.slice(-4);
}
