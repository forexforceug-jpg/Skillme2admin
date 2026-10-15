import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { UserDrawer } from "./components/UserDrawer";
import { SendNotificationModal } from "../../components/SendNotificationModal";
import { supabaseClient } from "../../providers/supabase-client";

interface RECORD {
  id: string;
  name: string;
  email: string;
  role: string;
  is_teacher: boolean;
  verification: string;
  likes_count: number;
  lessons_taught: number;
  created_at: string;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  [key: string]: unknown;
}

type RoleFilter = "all" | "students" | "teachers";
type VerificationFilter = "all" | "verified" | "pending" | "unverified";

export function ProfilesList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "profiles",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Message modal state
  const [messageTargets, setMessageTargets] = useState<string[] | null>(null);
  const [messageLabel, setMessageLabel] = useState<string>("");

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
        const haystack = `${r.name ?? ""} ${r.email ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (roleFilter === "students" && r.is_teacher) return false;
      if (roleFilter === "teachers" && !r.is_teacher) return false;
      if (verificationFilter !== "all" && r.verification !== verificationFilter) return false;
      return true;
    });
  }, [rawRows, search, roleFilter, verificationFilter]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function openMessageFor(ids: string[], label: string) {
    if (!ids.length) return;
    setMessageTargets(ids);
    setMessageLabel(label);
  }

  async function bulkVerify() {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({ verification: "verified" })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Verified ${selectedIds.length} user(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkUnverify() {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({ verification: "unverified" })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Unverified ${selectedIds.length} user(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,name,email,account_type,verification,likes,lessons_taught,joined\n";
    const body = selected.map(r =>
      [
        r.id,
        `"${(r.name ?? "").replace(/"/g, '""')}"`,
        r.email,
        r.is_teacher ? "teacher" : "student",
        r.verification,
        r.likes_count ?? 0,
        r.lessons_taught ?? 0,
        r.created_at,
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-users-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} user(s) to CSV.`);
  }

  async function bulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm(`Permanently delete ${selectedIds.length} user(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .delete()
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Deleted ${selectedIds.length} user(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkSuspend() {
    if (!selectedIds.length) return;
    if (!confirm(`Suspend ${selectedIds.length} user(s)? They will not be able to book or teach until reinstated.`)) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({
        suspended_at: new Date().toISOString(),
        suspension_reason: "Suspended by admin",
      })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    // Auto-open the message modal so the admin can explain
    openMessageFor(selectedIds, `${selectedIds.length} suspended user(s)`);
  }

  async function bulkReinstate() {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("profiles")
      .update({ suspended_at: null, suspension_reason: null })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Reinstated ${selectedIds.length} user(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  const columns: Column<RECORD>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={(r.avatar_url as string) || `https://i.pravatar.cc/40?u=${r.id}`}
            alt=""
            style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
          />
          <div>
            <div className="admin-table__primary">{String(r.name ?? "—")}</div>
            {r.suspended_at && (
              <div style={{ fontSize: 10, color: "#FCA5A5", fontWeight: 700, marginTop: 2 }}>
                SUSPENDED
              </div>
            )}
          </div>
        </div>
      ),
    },
    { key: "email", header: "Email", sortable: true },
    {
      key: "is_teacher",
      header: "Account Type",
      sortable: true,
      render: r => (
        <span className={`badge badge--${r.is_teacher ? "completed" : "neutral"}`}>
          {r.is_teacher ? "Teacher" : "Student"}
        </span>
      ),
    },
    {
      key: "verification",
      header: "Verification",
      sortable: true,
      render: r => (
        <span className={`badge badge--${String(r.verification)}`}>
          {String(r.verification)}
        </span>
      ),
    },
    {
      key: "likes_count",
      header: "Likes",
      sortable: true,
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>{r.likes_count ?? 0}</span>,
    },
    {
      key: "lessons_taught",
      header: "Lessons",
      sortable: true,
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>{r.lessons_taught ?? 0}</span>,
    },
    {
      key: "created_at",
      header: "Joined",
      sortable: true,
      render: r => new Date(String(r.created_at)).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: r => (
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button
            className="btn btn--ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
            onClick={e => {
              e.stopPropagation();
              openMessageFor([r.id], String(r.name ?? r.email));
            }}
          >
            Message
          </button>
          <span style={{ padding: "4px 8px", fontSize: 12, fontWeight: 600, color: "#C9A24A" }}>
            Manage →
          </span>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">User Management</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} registered users · search, filter, message, suspend
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          <button className={`admin-filter-chip ${roleFilter === "all" ? "is-active" : ""}`} onClick={() => setRoleFilter("all")}>All Types</button>
          <button className={`admin-filter-chip ${roleFilter === "students" ? "is-active" : ""}`} onClick={() => setRoleFilter("students")}>Students</button>
          <button className={`admin-filter-chip ${roleFilter === "teachers" ? "is-active" : ""}`} onClick={() => setRoleFilter("teachers")}>Teachers</button>
        </div>

        <div className="admin-filter-group">
          {(["all", "verified", "pending", "unverified"] as const).map(v => (
            <button
              key={v}
              className={`admin-filter-chip ${verificationFilter === v ? "is-active" : ""}`}
              onClick={() => setVerificationFilter(v)}
            >
              {v === "all" ? "Any Verification" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-bar__count">
            {selectedIds.length} selected
          </span>
          <div className="admin-bulk-bar__actions">
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={() => openMessageFor(selectedIds, `${selectedIds.length} selected user(s)`)}>
              Message
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkVerify}>
              Verify
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkUnverify}>
              Unverify
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkSuspend}>
              Suspend
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkReinstate}>
              Reinstate
            </button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkExport}>
              Export CSV
            </button>
            <button className="btn btn--ghost admin-bulk-bar__danger" disabled={bulkBusy} onClick={bulkDelete}>
              Delete
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
        onRowClick={r => setSelectedUserId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No users registered yet."
            : "No users match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedUserId && (
        <UserDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
          canAssignRole={true}
        />
      )}

      {messageTargets && (
        <SendNotificationModal
          recipientIds={messageTargets}
          recipientLabel={messageLabel}
          onClose={() => setMessageTargets(null)}
          onSent={summary => {
            showToast(
              `Sent. Inbox: ${summary.inbox}, Email: ${summary.email}` +
                (summary.failed ? `, Failed: ${summary.failed}` : "")
            );
            setSelectedIds([]);
          }}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
