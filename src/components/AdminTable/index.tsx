import { ReactNode, useState, useMemo } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  pagination?: {
    currentPage: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    total?: number;
  };
}

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = "No records yet.",
  onRowClick,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  pagination,
}: AdminTableProps<T>) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortField];
      const bv = (b as Record<string, unknown>)[sortField];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [rows, sortField, sortDir]);

  function toggleSort(key: string) {
    if (sortField === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDir("asc");
    }
  }

  const allSelected = sortedRows.length > 0 && sortedRows.every(r => selectedIds.includes(rowKey(r)));
  const someSelected = sortedRows.some(r => selectedIds.includes(rowKey(r))) && !allSelected;

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(selectedIds.filter(id => !sortedRows.some(r => rowKey(r) === id)));
    } else {
      const next = new Set(selectedIds);
      sortedRows.forEach(r => next.add(rowKey(r)));
      onSelectionChange(Array.from(next));
    }
  }

  function toggleOne(id: string) {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(x => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  if (loading) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-table__loading">Loading…</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-table__empty">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: 44 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  style={{ cursor: "pointer", accentColor: "#C9A24A" }}
                />
              </th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? "left",
                  cursor: col.sortable ? "pointer" : "default",
                  userSelect: "none",
                }}
                onClick={() => col.sortable && toggleSort(col.key)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {col.header}
                  {col.sortable && (
                    <span style={{ opacity: sortField === col.key ? 1 : 0.3, fontSize: 10 }}>
                      {sortField === col.key && sortDir === "desc" ? "▼" : "▲"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(row => {
            const id = rowKey(row);
            const isSelected = selectedIds.includes(id);
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  cursor: onRowClick ? "pointer" : undefined,
                  background: isSelected ? "rgba(201, 162, 74, 0.06)" : undefined,
                }}
              >
                {selectable && (
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(id)}
                      style={{ cursor: "pointer", accentColor: "#C9A24A" }}
                    />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} style={{ textAlign: col.align ?? "left" }}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pagination && (
        <div className="admin-pagination">
          <span>
            Page {pagination.currentPage} of {pagination.pageCount}
            {pagination.total ? ` · ${pagination.total} total` : ""}
          </span>
          <div className="admin-pagination__controls">
            <button
              className="admin-pagination__btn"
              disabled={pagination.currentPage <= 1}
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
            >
              ‹
            </button>
            <span className="admin-pagination__current">{pagination.currentPage}</span>
            <button
              className="admin-pagination__btn"
              disabled={pagination.currentPage >= pagination.pageCount}
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
