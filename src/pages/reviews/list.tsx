import { useTable } from "@refinedev/core";
import { AdminTable, Column } from "../../components/AdminTable";

interface RECORD {
  id: string;
  [key: string]: unknown;
}

export function ReviewsList() {
  const { tableQuery, setCurrentPage } = useTable<RECORD>({
    resource: "reviews",
    pagination: { pageSize: 20 },
  });

  const rows = tableQuery?.data?.data ?? [];
  const total = tableQuery?.data?.total ?? 0;
  const currentPage = tableQuery?.data?.current ?? 1;
  const pageSize = tableQuery?.data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loading = tableQuery?.isLoading;

  const columns: Column<RECORD>[] = [
    { key: "likes_count", header: "Likes" },
    { key: "comment", header: "Comment", render: r => String(r.comment ?? "").slice(0, 80) },
    { key: "created_at", header: "Date", render: r => new Date(String(r.created_at)).toLocaleDateString() }
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-head__title">Reviews</h1>
          <p className="page-head__sub">All lesson reviews left by students.</p>
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
