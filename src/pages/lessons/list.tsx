import { useState, useMemo } from "react";
import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";
import { LessonDrawer } from "./components/LessonDrawer";
import { SendNotificationModal } from "../../components/SendNotificationModal";
import { supabaseClient } from "../../providers/supabase-client";

interface RECORD {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  price: number;
  duration: number;
  status: string;
  cover_image: string;
  teacher_id: string;
  teacher_name: string;
  teacher_avatar: string;
  booking_count: number;
  group_mode: string;
  is_group: boolean;
  created_at: string;
  [key: string]: unknown;
}

type StatusFilter = "all" | "published" | "draft" | "archived";
type ModeFilter = "all" | "one_to_one" | "allow_groups" | "group_required";

export function LessonsList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "lessons",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        const haystack = `${r.title ?? ""} ${r.category ?? ""} ${r.teacher_name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (modeFilter !== "all" && r.group_mode !== modeFilter) return false;
      return true;
    });
  }, [rawRows, search, statusFilter, modeFilter]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function bulkPublish() {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("lessons")
      .update({ status: "published" })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Published ${selectedIds.length} lesson(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkArchive() {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("lessons")
      .update({ status: "archived" })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Archived ${selectedIds.length} lesson(s). Open the message panel to notify teachers.`);
    setMessageTargets(selectedIds);
    setMessageLabel(`${selectedIds.length} lesson(s)`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  async function bulkExport() {
    if (!selectedIds.length) return;
    const selected = rawRows.filter(r => selectedIds.includes(r.id));
    const header = "id,title,category,level,price,duration,status,group_mode,teacher,bookings,created_at\n";
    const body = selected.map(r =>
      [
        r.id,
        `"${(r.title ?? "").replace(/"/g, '""')}"`,
        r.category,
        r.level,
        r.price,
        r.duration,
        r.status,
        r.group_mode,
        `"${(r.teacher_name ?? "").replace(/"/g, '""')}"`,
        r.booking_count ?? 0,
        r.created_at,
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillme2-lessons-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${selectedIds.length} lesson(s) to CSV.`);
  }

  async function bulkDelete() {
    if (!selectedIds.length) return;
    if (!confirm(`Permanently delete ${selectedIds.length} lesson(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    const { error } = await supabaseClient
      .from("lessons")
      .delete()
      .in("id", selectedIds);
    setBulkBusy(false);
    if (error) return showToast("Failed: " + error.message);
    showToast(`Deleted ${selectedIds.length} lesson(s).`);
    setSelectedIds([]);
    tableQuery?.refetch?.();
  }

  const columns: Column<RECORD>[] = [
    {
      key: "title",
      header: "Lesson",
      sortable: true,
      render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={(r.cover_image as string) || `https://picsum.photos/seed/${r.id}/80/80`}
            alt=""
            style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="admin-table__primary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
              {String(r.title ?? "—")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {String(r.category ?? "—")} · {String(r.level ?? "—")}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "teacher_name",
      header: "Teacher",
      sortable: true,
      render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={(r.teacher_avatar as string) || `https://i.pravatar.cc/32?u=${r.teacher_id}`}
            alt=""
            style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
          />
          <span>{String(r.teacher_name ?? "—")}</span>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      sortable: true,
      align: "right",
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>${Number(r.price ?? 0).toFixed(2)}</span>,
    },
    {
      key: "duration",
      header: "Duration",
      sortable: true,
      align: "right",
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>{r.duration ?? 0} min</span>,
    },
    {
      key: "group_mode",
      header: "Mode",
      sortable: true,
      render: r => {
        const mode = String(r.group_mode ?? "one_to_one");
        const label = mode === "one_to_one" ? "1:1" : mode === "allow_groups" ? "Groups OK" : "Group only";
        return <span className={`badge badge--${r.is_group ? "confirmed" : "neutral"}`}>{label}</span>;
      },
    },
    {
      key: "booking_count",
      header: "Bookings",
      sortable: true,
      align: "right",
      render: r => <span style={{ fontFeatureSettings: '"tnum"' }}>{r.booking_count ?? 0}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: r => (
        <span className={`badge badge--${String(r.status ?? "neutral")}`}>{String(r.status ?? "—")}</span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
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
          <h1 className="page-head__title">Lessons</h1>
          <p className="page-head__sub">
            {total.toLocaleString()} lessons on the platform · search, filter, bulk-manage
          </p>
        </div>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          className="admin-filter-search"
          placeholder="Search by title, category, or teacher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="admin-filter-group">
          {(["all", "published", "draft", "archived"] as const).map(s => (
            <button
              key={s}
              className={`admin-filter-chip ${statusFilter === s ? "is-active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "Any Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="admin-filter-group">
          {(["all", "one_to_one", "allow_groups", "group_required"] as const).map(m => (
            <button
              key={m}
              className={`admin-filter-chip ${modeFilter === m ? "is-active" : ""}`}
              onClick={() => setModeFilter(m)}
            >
              {m === "all" ? "Any Mode" : m === "one_to_one" ? "1:1" : m === "allow_groups" ? "Groups OK" : "Group only"}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-bar__count">{selectedIds.length} selected</span>
          <div className="admin-bulk-bar__actions">
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkPublish}>Publish</button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkArchive}>Archive</button>
            <button className="btn btn--ghost" disabled={bulkBusy} onClick={bulkExport}>Export CSV</button>
            <button className="btn btn--ghost admin-bulk-bar__danger" disabled={bulkBusy} onClick={bulkDelete}>Delete</button>
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
        onRowClick={r => setSelectedLessonId(r.id)}
        emptyMessage={
          rawRows.length === 0
            ? "No lessons yet."
            : "No lessons match these filters."
        }
        pagination={{
          currentPage,
          pageCount,
          total,
          onPageChange: page => setCurrentPage(page),
        }}
      />

      {selectedLessonId && (
        <LessonDrawer
          lessonId={selectedLessonId}
          onClose={() => setSelectedLessonId(null)}
          onUpdated={() => tableQuery?.refetch?.()}
        />
      )}
      {messageTargets && (
        <SendNotificationModal
          recipientIds={messageTargets}
          recipientLabel={messageLabel}
          onClose={() => setMessageTargets(null)}
          onSent={s => showToast(`Sent. Inbox: ${s.inbox}, Email: ${s.email}`)}
        />
      )}

      {toast && <div className="admin-toast">{toast}</div>}
    </div>
  );
}
