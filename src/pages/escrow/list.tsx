import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { EscrowDrawer } from "./components/EscrowDrawer";

interface RECORD {
  id: string;
  booking_id: string;
  student_id: string;
  teacher_id: string;
  amount: number;
  status: string;
  held_at: string;
  released_at: string | null;
  refunded_at: string | null;
  dispute_reason: string | null;
  [key: string]: unknown;
}

type StatusFilter = "all" | "held" | "released" | "refunded" | "disputed";

export function EscrowList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "escrow",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "held_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedEscrowId, setSelectedEscrowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rawRows = tableQuery?.data?.data ?? [];
  const total = tableQuery?.data?.total ?? 0;
  const currentPage = tableQuery?.data?.current ?? 1;
  const pageSize = tableQuery?.data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loading = tableQuery?.isLoading;

  const rows = useMemo(() => {
    return rawRows.filter(r => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${r.id ?? ""} ${r.booking_id ?? ""} ${r.student_id ?? ""} ${r.teacher_id ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rawRows, search, statusFilter]);

  // Summary totals for the page-head
  const summary = useMemo(() => {
    let held = 0, released = 0, refunded = 0, disputed = 0;
    rawRows.forEach(r => {
      const amt = Number(r.amount ?? 0);
      if (r.status === "held") held += amt;
      else if (r.status === "released") released += amt;
      else if (r.status === "refunded") refunded += amt;
      else if (r.status === "disputed") disputed += amt;
    });
    return { held, released, refunded, disputed };
  }, [rawRows]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,booking_id,student_id,teacher_id,amount,status,held_at,released_at,refunded_at\n";
    const body = selected.map(r =>
      [
        r.id, r.booking_id, r.student_id, r.teacher_id,
        r.amount, r.status, r.held_at,
        r.released_at ?? "", r.refunded_at ?? "",
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-escrow-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} escrow record(s).`);
  }

  const columns: Column<RECORD>[] = [
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      render: r => (
        <span className="admin-table__primary" style={{ fontFeatureSettings: '"tnum"' }}>
          ${Number(r.amount ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: r => (
        <span className={`badge badge--${String(r.status)}`}>{String(r.status)}</span>
      ),
    },
    {
      key: "booking_id",
      header: "Booking",
      render: r => (
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
          {String(r.booking_id ?? "—").slice(0, 8)}…
        </span>
      ),
    },
    {
      key: "held_at",
      header: "Held since",
      sortable: true,
      render: r => new Date(String(r.held_at)).toLocaleString(),
    },
    {
      key: "released_at",
      header: "Closed at",
      render: r => {
        const t = r.released_at || r.refunded_at;
        return t ? new Date(String(t)).toLocaleString() : "—";
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <span style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#C9A24A" }}>
          Manage →
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Escrow</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} escrow records · held ${summary.held.toFixed(2)} ·
            released ${summary.released.toFixed(2)} · refunded ${summary.refunded.toFixed(2)}
            {summary.disputed > 0 && <> · <span style={{ color: "#FCA5A5" }}>disputed ${summary.disputed.toFixed(2)}</span></>}
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by escrow, booking, student, or teacher ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          {(["all", "held", "released", "refunded", "disputed"] as const).map(s => (
            <button
              key={s}
              className={`admin-filter-chip ${statusFilter === s ? "is-active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "Any Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-bar__count">{selectedIds.length} selected</span>
          <div className="admin-bulk-bar__actions">
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkExport}>Export CSV</button>
            <button className="btn btn--ghost" onClick={() => setSelectedIds([])}>Clear</button>
          </div>
        </div>
      )}

      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={r => setSelectedEscrowId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No escrow records yet."
            : "No escrow records match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedEscrowId && (
        <EscrowDrawer
          escrowId={selectedEscrowId}
          onClose={() => setSelectedEscrowId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
