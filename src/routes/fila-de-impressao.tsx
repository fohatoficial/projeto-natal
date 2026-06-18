import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loginPrintQueue,
  logoutPrintQueue,
  checkPrintQueueSession,
  listPrintQueue,
  startPrintingItem,
  markPrintedItem,
  cancelPrintItem,
  clearPrintQueue,
  countActivePrintQueue,
  type PrintQueueItem,
} from "@/lib/pipoca/print-queue.functions";

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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const checkFn = useServerFn(checkPrintQueueSession);

  useEffect(() => {
    (async () => {
      try {
        const r = await checkFn({});
        setAuthed(r.authenticated);
      } catch {
        setAuthed(false);
      }
    })();
  }, [checkFn]);

  if (authed === null) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white">
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-gold animate-spin" />
      </div>
    );
  }
  if (!authed) return <PinForm onAuthed={() => setAuthed(true)} />;
  return <QueueView onSignOut={() => setAuthed(false)} />;
}

function PinForm({ onAuthed }: { onAuthed: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useServerFn(loginPrintQueue);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ data: { pin } });
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] grid place-items-center bg-[#000C20] text-white px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border border-white/15 rounded-2xl p-6 flex flex-col gap-4"
      >
        <h1 className="font-display text-2xl text-center">
          FILA DE <span className="text-gold">IMPRESSÃO</span>
        </h1>
        <p className="text-sm text-white/70 text-center">
          Informe o PIN da recepcionista.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-3 text-center text-lg tracking-[0.5em]"
        />
        {error && <p className="text-red-300 text-sm text-center">{error}</p>}
        <button
          disabled={loading || pin.length === 0}
          className="w-full bg-gold text-[#000C20] font-semibold uppercase tracking-wider rounded-md py-3 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <Link to="/" className="text-xs text-center text-white/50 underline">
          Voltar para a experiência
        </Link>
      </form>
    </div>
  );
}

type StatusFilter = "active" | "pending" | "printing" | "printed" | "cleared" | "cancelled" | "all";

function QueueView({ onSignOut }: { onSignOut: () => void }) {
  const list = useServerFn(listPrintQueue);
  const startFn = useServerFn(startPrintingItem);
  const markFn = useServerFn(markPrintedItem);
  const cancelFn = useServerFn(cancelPrintItem);
  const clearFn = useServerFn(clearPrintQueue);
  const countFn = useServerFn(countActivePrintQueue);
  const logout = useServerFn(logoutPrintQueue);

  const [items, setItems] = useState<PrintQueueItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState<0 | 1 | 2>(0);
  const [activeCount, setActiveCount] = useState(0);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list({ data: { search: search || undefined, status: statusFilter } });
      setItems(r.items);
      const c = await countFn({});
      setActiveCount(c.count);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("unauthorized")) {
        onSignOut();
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [list, countFn, search, statusFilter, onSignOut]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function handleSignOut() {
    try { await logout({}); } catch { /* noop */ }
    onSignOut();
  }

  async function handleStart(item: PrintQueueItem) {
    setPrintingId(item.id);
    try {
      await startFn({ data: { queueId: item.id } });
      // open print window
      window.open(`/imprimir/${item.id}`, "_blank", "noopener,width=900,height=700");
      await refresh();
    } finally {
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

  const filteredCount = items.length;

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
        <button
          onClick={refresh}
          className="text-xs uppercase tracking-wider border border-white/20 px-3 py-2 rounded-md hover:bg-white/5"
        >
          Atualizar
        </button>
      </div>

      <div className="pipoca-print-queue-grid px-4 pb-10">
        {loading && items.length === 0 && (
          <p className="text-white/60 text-sm col-span-full">Carregando…</p>
        )}
        {!loading && filteredCount === 0 && (
          <p className="text-white/60 text-sm col-span-full">Nada na fila no momento.</p>
        )}
        {items.map((item) => (
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
    <div className="border border-white/15 rounded-xl p-3 flex gap-3 items-start bg-white/[0.02]">
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
        <div className="mt-2 flex flex-wrap gap-2">
          {(item.status === "pending" || item.status === "failed") && (
            <button
              onClick={() => onPrint(item)}
              disabled={busy}
              className="bg-gold text-[#000C20] font-semibold uppercase text-xs tracking-wider px-3 py-1.5 rounded-md disabled:opacity-60"
            >
              {busy ? "Abrindo…" : "Imprimir"}
            </button>
          )}
          {(item.status === "printing" || item.status === "pending") && (
            <button
              onClick={() => onMarkPrinted(item)}
              className="border border-white/30 uppercase text-xs tracking-wider px-3 py-1.5 rounded-md hover:bg-white/5"
            >
              Marcar como entregue
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
