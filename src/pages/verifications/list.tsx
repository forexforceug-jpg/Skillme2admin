import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { VerificationDrawer } from "./components/VerificationDrawer";
import { supabaseClient } from "../../providers/supabase-client";
import { notifyUser } from "../../lib/notify";

interface RECORD {
  id: string;
  teacher_id: string;
  status: string;
  documents: Record<string, unknown> | null;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  [key: string]: unknown;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export function VerificationsList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "verification_requests",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "submitted_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
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
        const haystack = `${r.id ?? ""} ${r.teacher_id ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rawRows, search, statusFilter]);

  const summary = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    rawRows.forEach(r => {
      if (r.status === "pending") pending++;
      else if (r.status === "approved") approved++;
      else if (r.status === "rejected") rejected++;
    });
    return { pending, approved, rejected };
  }, [rawRows]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function bulkApprove() {
    if (!selectedIds.length) return;
    if (!confirm(`Approve ${selectedIds.length} verification request(s)?`)) return;
    setBulkBusy(true);

    const targets = rawRows.filter(r => selectedIds.includes(r.id) && r.status === "pending");
    const now = new Date().toISOString();
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient
      .from("verification_requests")
      .update({ status: "approved", reviewed_at: now, reviewed_by: user?.id ?? null })
      .in("id", targets.map(t => t.id));
    if (error) { setBulkBusy(false); return showToast("Failed: " + error.message); }

    // Update each teacher profile + notify
    for (const t of targets) {
      await supabaseClient.from("profiles")
        .update({ verification: "verified" })
        .eq("id", t.teacher_id);

      await notifyUser({
        recipientId: t.teacher_id,
        type: "verification_approved",
        title: "Your Skillme2 verification was approved",
        body: "Congratulations — your verified teacher badge is now active. Your profile will show the badge on all lessons you publish.",
        sendEmail: true,
      });
    }

    setBulkBusy(false);
    showToast(`Approved ${targets.length} verification(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkReject() {
    if (!selectedIds.length) return;
    const reason = prompt("Reason for rejection (shown to all selected teachers):");
    if (!reason) return;
    if (!confirm(`Reject ${selectedIds.length} verification request(s)?`)) return;
    setBulkBusy(true);

    const targets = rawRows.filter(r => selectedIds.includes(r.id) && r.status === "pending");
    const now = new Date().toISOString();
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient
      .from("verification_requests")
      .update({ status: "rejected", reviewed_at: now, reviewed_by: user?.id ?? null, notes: reason })
      .in("id", targets.map(t => t.id));
    if (error) { setBulkBusy(false); return showToast("Failed: " + error.message); }

    for (const t of targets) {
      await supabaseClient.from("profiles")
        .update({ verification: "unverified" })
        .eq("id", t.teacher_id);

      await notifyUser({
        recipientId: t.teacher_id,
        type: "verification_rejected",
        title: "Your Skillme2 verification was not approved",
        body: `We were unable to approve your verification request.\n\nReason: ${reason}\n\nYou may re-submit with clearer documents.`,
        sendEmail: true,
      });
    }

    setBulkBusy(false);
    showToast(`Rejected ${targets.length} verification(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,teacher_id,status,submitted_at,reviewed_at,reviewed_by,notes\n";
    const body = selected.map(r =>
      [
        r.id, r.teacher_id, r.status, r.submitted_at,
        r.reviewed_at ?? "", r.reviewed_by ?? "",
        `"${(r.notes ?? "").replace(/"/g, '""')}"`,
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-verifications-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} request(s).`);
  }

  const columns: Column<RECORD>[] = [
    {
      key: "teacher_id",
      header: "Teacher",
      render: r => (
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }} className="admin-table__primary">
          {String(r.teacher_id ?? "—").slice(0, 8)}…
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
      key: "documents",
      header: "Documents",
      render: r => {
        const d = r.documents as any;
        if (!d) return <span style={{ color: "var(--text-muted)" }}>—</span>;
        if (Array.isArray(d.urls)) return <span>{d.urls.length} file(s)</span>;
        return <span>{Object.keys(d).length} field(s)</span>;
      },
    },
    {
      key: "submitted_at",
      header: "Submitted",
      sortable: true,
      render: r => new Date(String(r.submitted_at)).toLocaleString(),
    },
    {
      key: "reviewed_at",
      header: "Reviewed",
      sortable: true,
      render: r => r.reviewed_at ? new Date(String(r.reviewed_at)).toLocaleString() : "—",
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <span style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#C9A24A" }}>
          Review →
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Verifications</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} requests ·
            {" "}<span style={{ color: summary.pending > 0 ? "#C9A24A" : undefined }}>{summary.pending} pending</span> ·
            {" "}approved {summary.approved} · rejected {summary.rejected}
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by request ID, teacher, or notes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          {(["all", "pending", "approved", "rejected"] as const).map(s => (
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
            <button className="btn btn--ghost admin-bulk-bar__danger" disabled={bulkBusy} onClick={bulkReject}>
              Reject selected
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
        onRowClick={r => setSelectedRequestId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No verification requests yet."
            : "No requests match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedRequestId && (
        <VerificationDrawer
          requestId={selectedRequestId}
          onClose={() => setSelectedRequestId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
