import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { PayoutDrawer } from "./components/PayoutDrawer";
import { supabaseClient } from "../../providers/supabase-client";
import { notifyUser } from "../../lib/notify";

interface RECORD {
  id: string;
  teacher_id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  requested_at: string;
  processed_at: string | null;
  [key: string]: unknown;
}

type StatusFilter = "all" | "requested" | "approved" | "paid" | "rejected";

export function PayoutsList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "payouts",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "requested_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
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
        const haystack = `${r.id ?? ""} ${r.teacher_id ?? ""} ${r.method ?? ""} ${r.reference ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rawRows, search, statusFilter]);

  const summary = useMemo(() => {
    let requested = 0, approved = 0, paid = 0, rejected = 0;
    let requestedAmt = 0, paidAmt = 0;
    rawRows.forEach(r => {
      const amt = Number(r.amount ?? 0);
      if (r.status === "requested") { requested++; requestedAmt += amt; }
      else if (r.status === "approved") { approved++; requestedAmt += amt; }
      else if (r.status === "paid") { paid++; paidAmt += amt; }
      else if (r.status === "rejected") rejected++;
    });
    return { requested, approved, paid, rejected, requestedAmt, paidAmt };
  }, [rawRows]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function bulkApprove() {
    if (!selectedIds.length) return;
    if (!confirm(`Approve ${selectedIds.length} payout request(s)?`)) return;
    setBulkBusy(true);

    const targets = rawRows.filter(r => selectedIds.includes(r.id) && r.status === "requested");
    const { error } = await supabaseClient
      .from("payouts")
      .update({ status: "approved" })
      .in("id", targets.map(t => t.id));

    if (error) { setBulkBusy(false); return showToast("Failed: " + error.message); }

    // Notify each teacher
    for (const t of targets) {
      await notifyUser({
        recipientId: t.teacher_id,
        type: "payout_processed",
        title: "Your payout request has been approved",
        body: `Your request for $${Number(t.amount).toFixed(2)} has been approved and will be processed shortly.`,
        sendEmail: true,
      });
    }

    setBulkBusy(false);
    showToast(`Approved ${targets.length} payout(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,teacher_id,amount,method,status,reference,requested_at,processed_at\n";
    const body = selected.map(r =>
      [
        r.id, r.teacher_id, r.amount, `"${r.method ?? ""}"`,
        r.status, r.reference ?? "",
        r.requested_at, r.processed_at ?? "",
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-payouts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} payout(s).`);
  }

  const columns: Column<RECORD>[] = [
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      align: "right",
      render: r => (
        <span className="admin-table__primary" style={{ fontFeatureSettings: '"tnum"', fontSize: 14 }}>
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
      key: "method",
      header: "Method",
      render: r => <span>{String(r.method ?? "—")}</span>,
    },
    {
      key: "teacher_id",
      header: "Teacher",
      render: r => (
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>
          {String(r.teacher_id ?? "—").slice(0, 8)}…
        </span>
      ),
    },
    {
      key: "requested_at",
      header: "Requested",
      sortable: true,
      render: r => new Date(String(r.requested_at)).toLocaleString(),
    },
    {
      key: "processed_at",
      header: "Processed",
      render: r => r.processed_at ? new Date(String(r.processed_at)).toLocaleString() : "—",
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
          <h1 className="page-head__title">Payouts</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} requests ·
            {" "}awaiting ${summary.requestedAmt.toFixed(2)} ({summary.requested + summary.approved}) ·
            {" "}paid ${summary.paidAmt.toFixed(2)} ({summary.paid})
            {summary.rejected > 0 && <> · rejected {summary.rejected}</>}
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by payout ID, teacher, method, or reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          {(["all", "requested", "approved", "paid", "rejected"] as const).map(s => (
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
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkApprove}>
              Approve selected
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkExport}>
              Export CSV
            </button>
            <button className="btn btn--ghost" onClick={() => setSelectedIds([])}>
              Clear
            </button>
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
        onRowClick={r => setSelectedPayoutId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No payout requests yet."
            : "No payouts match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedPayoutId && (
        <PayoutDrawer
          payoutId={selectedPayoutId}
          onClose={() => setSelectedPayoutId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
