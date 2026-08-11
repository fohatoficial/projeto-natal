import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PRINT_QUEUE_PAGE_SIZE = 10;
import {
  logoutPrintQueue,
  listPrintQueue,
  listPrintQueueCapitals,
  markPrintedItem,
  cancelPrintItem,
  clearPrintQueue,
  countActivePrintQueue,
  type PrintQueueItem,
} from "@/lib/pipoca/print-queue.functions";

type QueueCapitalOption = { id: string; name: string; isSystem: boolean };

export const Route = createFileRoute("/fila-de-impressao")({
  head: () => ({
    meta: [
      { title: "Fila de impressão — Pipoca & Cena" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintQueuePage,
});

function PrintQueuePage() {
  // PIN removido: acesso liberado à fila de impressão.
  return <QueueView onSignOut={() => { /* noop */ }} />;
}

type StatusFilter = "active" | "pending" | "printing" | "printed" | "cleared" | "cancelled" | "all";

function getPageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function QueueView({ onSignOut }: { onSignOut: () => void }) {
  const list = useServerFn(listPrintQueue);
  const listCaps = useServerFn(listPrintQueueCapitals);
  const markFn = useServerFn(markPrintedItem);
  const cancelFn = useServerFn(cancelPrintItem);
  const clearFn = useServerFn(clearPrintQueue);
  const countFn = useServerFn(countActivePrintQueue);
  const logout = useServerFn(logoutPrintQueue);

  const [items, setItems] = useState<PrintQueueItem[]>([]);
  const [capitalOptions, setCapitalOptions] = useState<QueueCapitalOption[]>([]);
  const [capitalFilter, setCapitalFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState<0 | 1 | 2>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list({
        data: {
          search: search || undefined,
          status: statusFilter,
          capitalId: capitalFilter !== "all" ? capitalFilter : undefined,
        },
      });
      setItems(r.items);
      const c = await countFn({});
      setActiveCount(c.count);
      setLoadError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("unauthorized")) {
        onSignOut();
        return;
      }
      setLoadError(
        /ausente|Missing env/i.test(msg)
          ? `Configuração do servidor incompleta: ${msg}`
          : msg || "Não foi possível carregar a fila de impressão.",
      );
    } finally {
      setLoading(false);
    }
  }, [list, countFn, search, statusFilter, capitalFilter, onSignOut]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Carrega capitais que existem na fila (uma vez, com refresh periódico leve).
  useEffect(() => {
    let alive = true;
    async function loadCaps() {
      try {
        const r = await listCaps({});
        if (!alive) return;
        setCapitalOptions(r.capitals);
      } catch {
        /* noop */
      }
    }
    void loadCaps();
    const t = window.setInterval(loadCaps, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [listCaps]);

  async function handleSignOut() {
    try { await logout({}); } catch { /* noop */ }
    onSignOut();
  }

  async function handleStart(item: PrintQueueItem) {
    // Do NOT mutate status here. "Imprimir" only opens the print window;
    // status changes exclusively via "Marcar como impresso".
    setPrintingId(item.id);
    try {
      window.open(`/imprimir/${item.id}`, "_blank", "noopener,width=900,height=700");
    } finally {
      // Re-enable the button as soon as the window is dispatched so the
      // operator can reprint immediately if needed.
      setPrintingId(null);
    }
  }

  async function handleMark(item: PrintQueueItem) {
    await markFn({ data: { queueId: item.id } });
    await refresh();
  }
  async function handleCancel(item: PrintQueueItem) {
    if (!confirm(`Cancelar pedido de ${item.visitorFirstName}?`)) return;
    await cancelFn({ data: { queueId: item.id } });
    await refresh();
  }

  async function handleClear() {
    await clearFn({});
    setConfirmClear(0);
    await refresh();
  }

  // Sort: most recent first (stable by id desc as tiebreaker)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.requestedAt).getTime();
      const dateB = new Date(b.requestedAt).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [items]);

  const filteredCount = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PRINT_QUEUE_PAGE_SIZE));

  // Reset to page 1 when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, capitalFilter]);

  // Clamp page if it no longer exists after data refresh
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * PRINT_QUEUE_PAGE_SIZE;
  const visibleQueueItems = sortedItems.slice(startIndex, startIndex + PRINT_QUEUE_PAGE_SIZE);
  const rangeStart = filteredCount === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + PRINT_QUEUE_PAGE_SIZE, filteredCount);


  function goToPage(p: number) {
    const next = Math.min(Math.max(1, p), totalPages);
    setCurrentPage(next);
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  return (
    <div className="min-h-[100dvh] bg-[#000C20] text-white">
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <h1 className="font-display text-xl">
          FILA <span className="text-gold">{activeCount}</span>
        </h1>
        <div className="flex-1" />
        <button
          onClick={() => setConfirmClear(1)}
          className="text-xs uppercase tracking-wider border border-red-400/40 text-red-200 px-3 py-2 rounded-md hover:bg-red-500/10"
        >
          Zerar fila
        </button>
        <button
          onClick={handleSignOut}
          className="text-xs uppercase tracking-wider border border-white/20 px-3 py-2 rounded-md hover:bg-white/5"
        >
          Sair
        </button>
      </header>

      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou últimos 4 do WhatsApp"
          className="flex-1 min-w-[200px] bg-black/40 border border-white/20 rounded-md px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-black/40 border border-white/20 rounded-md px-3 py-2 text-sm"
        >
          <option value="active">Ativos</option>
          <option value="pending">Pendentes</option>
          <option value="printing">Imprimindo</option>
          <option value="printed">Impressos</option>
          <option value="cleared">Zerados</option>
          <option value="cancelled">Cancelados</option>
          <option value="all">Todos</option>
        </select>
        <select
          value={capitalFilter}
          onChange={(e) => setCapitalFilter(e.target.value)}
          className="bg-black/40 border border-white/20 rounded-md px-3 py-2 text-sm"
          aria-label="Filtrar por capital"
        >
          <option value="all">Todas as capitais</option>
          {capitalOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={refresh}
          className="text-xs uppercase tracking-wider border border-white/20 px-3 py-2 rounded-md hover:bg-white/5"
        >
          Atualizar
        </button>
      </div>

      <div ref={listRef} className="pipoca-print-queue-grid px-4 pb-4">
        {loading && items.length === 0 && (
          <p className="text-white/60 text-sm col-span-full">Carregando…</p>
        )}
        {!loading && filteredCount === 0 && (
          <p className="text-white/60 text-sm col-span-full">Nada na fila no momento.</p>
        )}
        {visibleQueueItems.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            busy={printingId === item.id}
            onPrint={handleStart}
            onMarkPrinted={handleMark}
            onCancel={handleCancel}
          />
        ))}
      </div>

      {filteredCount > 0 && (
        <div className="px-4 pb-10 flex flex-col items-center gap-3">
          <p className="text-xs text-white/60">
            {filteredCount === 0
              ? "0 registros na fila"
              : `Exibindo ${rangeStart}–${rangeEnd} de ${filteredCount} registros`}
          </p>
          {totalPages > 1 && (
            <nav className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-xs uppercase tracking-wider border border-white/20 rounded-md hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              {pageNumbers.map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-2 text-white/40 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    aria-current={p === currentPage ? "page" : undefined}
                    className={`min-w-[2.5rem] px-3 py-2 text-sm rounded-md border ${
                      p === currentPage
                        ? "bg-gold text-[#000C20] border-gold font-semibold"
                        : "border-white/20 hover:bg-white/5"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-xs uppercase tracking-wider border border-white/20 rounded-md hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </nav>
          )}
          {totalPages > 1 && (
            <p className="text-[11px] text-white/45">Página {currentPage} de {totalPages}</p>
          )}
        </div>
      )}

      {confirmClear > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center px-5">
          <div className="bg-[#0A1730] border border-white/15 rounded-2xl p-6 max-w-sm w-full text-center">
            <h2 className="font-display text-xl">Zerar fila</h2>
            <p className="text-sm text-white/70 mt-2">
              {confirmClear === 1
                ? `Isso vai retirar ${activeCount} item(ns) ativo(s) da visualização padrão (histórico preservado). Confirma?`
                : "Tem certeza? Esta ação não pode ser desfeita."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => (confirmClear === 1 ? setConfirmClear(2) : handleClear())}
                className="bg-red-500/90 hover:bg-red-500 text-white font-semibold uppercase tracking-wider rounded-md py-3"
              >
                {confirmClear === 1 ? "Continuar" : "Sim, zerar fila"}
              </button>
              <button
                onClick={() => setConfirmClear(0)}
                className="border border-white/20 rounded-md py-3 uppercase tracking-wider text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  busy,
  onPrint,
  onMarkPrinted,
  onCancel,
}: {
  item: PrintQueueItem;
  busy: boolean;
  onPrint: (i: PrintQueueItem) => void;
  onMarkPrinted: (i: PrintQueueItem) => void;
  onCancel: (i: PrintQueueItem) => void;
}) {
  const requested = useMemo(
    () => new Date(item.requestedAt).toLocaleString("pt-BR"),
    [item.requestedAt],
  );
  return (
    <div className="pipoca-print-queue-card border border-white/15 rounded-xl p-3 bg-white/[0.02]">
      <div className="flex gap-3 items-start">
      <div className="w-16 h-20 rounded-md overflow-hidden bg-black/60 shrink-0">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold truncate">{item.visitorFullName}</h3>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-white/60 truncate">
          {item.filmTitle} · WhatsApp ****{item.visitorWhatsappLast4}
        </p>
        <p className="text-[11px] text-white/45 mt-0.5">{requested}</p>
        <p className="text-[11px] text-white/55 mt-0.5">
          Capital: <span className="text-white/80">{item.capitalName}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => onPrint(item)}
            disabled={busy}
            className="bg-gold text-[#000C20] font-semibold uppercase text-xs tracking-wider px-3 py-1.5 rounded-md disabled:opacity-60"
          >
            {busy ? "Preparando impressão…" : "Imprimir"}
          </button>
          {(item.status === "printing" || item.status === "pending" || item.status === "failed") && (
            <button
              onClick={() => onMarkPrinted(item)}
              className="border border-white/30 uppercase text-xs tracking-wider px-3 py-1.5 rounded-md hover:bg-white/5"
            >
              Marcar como impresso
            </button>
          )}
          {(item.status === "pending" || item.status === "printing") && (
            <button
              onClick={() => onCancel(item)}
              className="border border-red-400/40 text-red-200 uppercase text-xs tracking-wider px-3 py-1.5 rounded-md hover:bg-red-500/10"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-200",
    printing: "bg-blue-500/20 text-blue-200",
    printed: "bg-green-500/20 text-green-200",
    failed: "bg-red-500/20 text-red-200",
    cleared: "bg-white/10 text-white/60",
    cancelled: "bg-white/10 text-white/60",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${map[status] ?? "bg-white/10 text-white/60"}`}>
      {status}
    </span>
  );
}
