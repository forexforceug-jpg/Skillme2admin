import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { BookingDrawer } from "./components/BookingDrawer";

interface RECORD {
  id: string;
  lesson_id: string;
  student_id: string;
  teacher_id: string;
  lesson_title_snapshot: string;
  lesson_cover_snapshot: string;
  scheduled_at: string;
  duration_minutes: number;
  price_paid: number;
  status: string;
  is_group: boolean;
  created_at: string;
  [key: string]: unknown;
}

type StatusFilter = "all" | "pending" | "confirmed" | "completed" | "cancelled" | "disputed";

export function BookingsList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "bookings",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "scheduled_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
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
        const haystack = `${r.lesson_title_snapshot ?? ""} ${r.id ?? ""} ${r.student_id ?? ""} ${r.teacher_id ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rawRows, search, statusFilter]);

  const summary = useMemo(() => {
    let pending = 0, confirmed = 0, completed = 0, cancelled = 0, disputed = 0, revenue = 0;
    rawRows.forEach(r => {
      if (r.status === "pending") pending++;
      else if (r.status === "confirmed") confirmed++;
      else if (r.status === "completed") { completed++; revenue += Number(r.price_paid ?? 0); }
      else if (r.status === "cancelled") cancelled++;
      else if (r.status === "disputed") disputed++;
    });
    return { pending, confirmed, completed, cancelled, disputed, revenue };
  }, [rawRows]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,lesson,student_id,teacher_id,scheduled_at,duration,price_paid,status,is_group\n";
    const body = selected.map(r =>
      [
        r.id,
        `"${(r.lesson_title_snapshot ?? "").replace(/"/g, '""')}"`,
        r.student_id,
        r.teacher_id,
        r.scheduled_at,
        r.duration_minutes,
        r.price_paid,
        r.status,
        r.is_group ? "yes" : "no",
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-bookings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} booking(s).`);
  }

  const columns: Column<RECORD>[] = [
    {
      key: "lesson_title_snapshot",
      header: "Lesson",
      sortable: true,
      render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={(r.lesson_cover_snapshot as string) || `https://picsum.photos/seed/${r.id}/80/80`}
            alt=""
            style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="admin-table__primary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
              {String(r.lesson_title_snapshot ?? "—")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {r.is_group ? "Group session" : "1:1"} · {r.duration_minutes} min
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "scheduled_at",
      header: "Scheduled",
      sortable: true,
      render: r => new Date(String(r.scheduled_at)).toLocaleString(),
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
      key: "price_paid",
      header: "Paid",
      sortable: true,
      align: "right",
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>${Number(r.price_paid ?? 0).toFixed(2)}</span>,
    },
    {
      key: "created_at",
      header: "Booked",
      sortable: true,
      render: r => new Date(String(r.created_at)).toLocaleDateString(),
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
          <h1 className="page-head__title">Bookings</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} bookings · pending {summary.pending} ·
            confirmed {summary.confirmed} · completed {summary.completed} ·
            cancelled {summary.cancelled}
            {summary.disputed > 0 && <> · <span style={{ color: "#FCA5A5" }}>disputed {summary.disputed}</span></>}
            {" "}· completed revenue ${summary.revenue.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by lesson, booking ID, student, or teacher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          {(["all", "pending", "confirmed", "completed", "cancelled", "disputed"] as const).map(s => (
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
        onRowClick={r => setSelectedBookingId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No bookings yet."
            : "No bookings match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedBookingId && (
        <BookingDrawer
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
