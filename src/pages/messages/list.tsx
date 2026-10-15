import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";

interface RECORD {
  id: string;
  [key: string]: unknown;
}

export function MessagesList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "messages",
    pagination: { pageSize: 20 },
  });

  const rows = tableQuery?.data?.data ?? [];
  const total = tableQuery?.data?.total ?? 0;
  const currentPage = tableQuery?.data?.current ?? 1;
  const pageSize = tableQuery?.data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loading = tableQuery?.isLoading;

  const columns: Column<RECORD>[] = [
    { key: "body", header: "Message", render: r => String(r.body ?? "").slice(0, 80) },
    { key: "created_at", header: "Sent", render: r => new Date(String(r.created_at)).toLocaleString() }
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Messages</h1>
          <p className="page-head__sub">Every conversation on the platform.</p>
        </div>
      </div>

      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        emptyMessage="No records yet."
      />
    </div>
  );
}
