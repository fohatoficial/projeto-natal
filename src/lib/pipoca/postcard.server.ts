/**
 * Helpers server-only do cartão-postal final.
 *
 * O caminho do postal é gravado na coluna `postcard_image_path` quando ela
 * existe; enquanto a migration não for aplicada, o mesmo valor fica em
 * `metadata.postcard_image_path`. A leitura aceita as duas formas.
 */

export type GenerationRowLike = {
  postcard_image_path?: string | null;
  postcard_message?: string | null;
  postcard_message_type?: string | null;
  final_image_path?: string | null;
  metadata?: unknown;
};

function meta(row: GenerationRowLike): Record<string, unknown> {
  return typeof row?.metadata === "object" && row.metadata !== null
    ? (row.metadata as Record<string, unknown>)
    : {};
}

export function resolvePostcardPath(row: GenerationRowLike): string | null {
  const direct = row?.postcard_image_path;
  if (typeof direct === "string" && direct.trim()) return direct;
  const fromMeta = meta(row)["postcard_image_path"];
  return typeof fromMeta === "string" && fromMeta.trim() ? fromMeta : null;
}

/** Caminho do postal se existir; caso contrário, a fotografia gerada. */
export function resolveDeliverablePath(row: GenerationRowLike): string | null {
  return resolvePostcardPath(row) ?? row?.final_image_path ?? null;
}

export function resolvePostcardMessage(row: GenerationRowLike): string | null {
  const direct = row?.postcard_message;
  if (typeof direct === "string" && direct.trim()) return direct;
  const fromMeta = meta(row)["postcard_message"];
  return typeof fromMeta === "string" && fromMeta.trim() ? fromMeta : null;
}
