"use client";

import Link from "next/link";
import { useState, useMemo, useEffect, type ReactNode } from "react";

type DataPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  headerAction?: ReactNode;
  columns: string[];
  rows: string[][];
  note?: string;
  state?: "ready" | "empty" | "setup" | "error";
};

export default function DataPage({
  eyebrow,
  title,
  description,
  action,
  headerAction,
  columns,
  rows,
  note,
  state = "ready",
}: DataPageProps) {
  // Search query
  const [search, setSearch] = useState("");
  // Selected search field ("all" or column index)
  const [searchField, setSearchField] = useState<string>("all");
  // Column-specific category filters (column index -> selected value)
  const [selectedFilters, setSelectedFilters] = useState<Record<number, string>>({});
  // Date range filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [selectedDateColIdx, setSelectedDateColIdx] = useState<number | null>(null);
  // Sorting state
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Identify all date columns in the table (e.g., "Invoice date", "Due date")
  const dateColumns = useMemo(() => {
    return columns
      .map((colName, idx) => ({ colName, idx }))
      .filter(({ colName }) => {
        const lower = colName.toLowerCase();
        return lower.includes("date") || (lower.includes("due") && !lower.includes("amount"));
      });
  }, [columns]);

  // Active date column index
  const activeDateColIdx = useMemo(() => {
    if (selectedDateColIdx !== null) return selectedDateColIdx;
    return dateColumns.length > 0 ? dateColumns[0].idx : -1;
  }, [selectedDateColIdx, dateColumns]);

  // Identify categorical columns for filter dropdowns (e.g. Type, Class, Status, Tax type)
  const categoricalColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const results: { colIndex: number; label: string; options: string[] }[] = [];

    columns.forEach((colName, colIndex) => {
      const lower = colName.toLowerCase();
      // Exclude text or numeric columns like Code, Invoice #, Total, Amount Due, or Dates
      if (
        (lower.includes("invoice") && !lower.includes("status")) ||
        lower.includes("total") ||
        (lower.includes("due") && lower.includes("amount")) ||
        lower.includes("date")
      ) {
        return;
      }

      const isKnownCategory =
        lower.includes("type") ||
        lower.includes("class") ||
        lower.includes("status");

      const valuesSet = new Set<string>();
      rows.forEach((row) => {
        const val = row[colIndex];
        if (val && val !== "—") {
          valuesSet.add(val.trim());
        }
      });

      const options = Array.from(valuesSet).sort();
      // Include if it is a known categorical column or has between 2 and 25 distinct values
      if ((isKnownCategory && options.length >= 1) || (options.length >= 2 && options.length <= 25)) {
        results.push({ colIndex, label: colName, options });
      }
    });

    return results;
  }, [columns, rows]);

  // Quick Date Preset click handler
  function handleDatePreset(preset: string) {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === "all") {
      setFromDate("");
      setToDate("");
    } else if (preset === "overdue") {
      setFromDate("");
      setToDate(todayStr);
    } else if (preset === "this-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setFromDate(firstDay);
      setToDate(todayStr);
    } else if (preset === "last-30") {
      const past30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      setFromDate(past30);
      setToDate(todayStr);
    }
  }

  // Column header click for sorting
  function handleSort(colIndex: number) {
    if (sortColumn === colIndex) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(colIndex);
      setSortDirection("asc");
    }
  }

  // Parse date strings reliably (e.g. "18 Oct 2026" or "2026-10-18")
  function parseDateValue(str: string): number | null {
    if (!str || str === "—") return null;
    const timestamp = Date.parse(str);
    return isNaN(timestamp) ? null : timestamp;
  }

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, searchField, selectedFilters, fromDate, toDate, datePreset]);

  // Filter rows by all active criteria
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // 1. Text Search (Either specific field or across all fields)
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (searchField === "all") {
          const matchesAny = row.some((cell) => cell.toLowerCase().includes(query));
          if (!matchesAny) return false;
        } else {
          const colIdx = Number(searchField);
          const cell = row[colIdx] || "";
          if (!cell.toLowerCase().includes(query)) return false;
        }
      }

      // 2. Categorical Dropdown Filters (Type, Class, Status, Tax type)
      for (const [colIdxStr, selectedVal] of Object.entries(selectedFilters)) {
        if (!selectedVal || selectedVal === "ALL") continue;
        const colIdx = Number(colIdxStr);
        const cellValue = row[colIdx] || "";
        if (cellValue.trim().toLowerCase() !== selectedVal.toLowerCase()) {
          return false;
        }
      }

      // 3. Date Range Filter
      if (activeDateColIdx !== -1 && (fromDate || toDate)) {
        const cellDate = parseDateValue(row[activeDateColIdx]);
        if (cellDate !== null) {
          if (fromDate) {
            const fromTs = new Date(fromDate).getTime();
            if (cellDate < fromTs) return false;
          }
          if (toDate) {
            const toTs = new Date(toDate).getTime() + 86400000;
            if (cellDate > toTs) return false;
          }
        }
      }

      return true;
    });
  }, [rows, search, searchField, selectedFilters, fromDate, toDate, activeDateColIdx]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (sortColumn === null) return filteredRows;

    return [...filteredRows].sort((rowA, rowB) => {
      const valA = rowA[sortColumn] || "";
      const valB = rowB[sortColumn] || "";

      // Check if both values are currency/numbers (e.g. $1,234.56)
      const numA = Number(valA.replace(/[^0-9.-]+/g, ""));
      const numB = Number(valB.replace(/[^0-9.-]+/g, ""));
      const isNumA = !isNaN(numA) && (valA.includes("$") || /^[0-9]+(\.[0-9]+)?$/.test(valA.trim()));
      const isNumB = !isNaN(numB) && (valB.includes("$") || /^[0-9]+(\.[0-9]+)?$/.test(valB.trim()));

      if (isNumA && isNumB) {
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      // Check if both are dates
      const dateA = parseDateValue(valA);
      const dateB = parseDateValue(valB);
      if (dateA !== null && dateB !== null) {
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      }

      // Text comparison
      return sortDirection === "asc"
        ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" })
        : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination calculations
  const totalRecords = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const paginatedRows = useMemo(() => {
    return sortedRows.slice(startIndex, endIndex);
  }, [sortedRows, startIndex, endIndex]);

  // Dynamic page numbers for navigation bar
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  // Active filter state tracking
  const hasActiveFilters = Boolean(
    search.trim() ||
    searchField !== "all" ||
    Object.values(selectedFilters).some((v) => v && v !== "ALL") ||
    fromDate ||
    toDate ||
    datePreset !== "all"
  );

  function resetAllFilters() {
    setSearch("");
    setSearchField("all");
    setSelectedFilters({});
    setFromDate("");
    setToDate("");
    setDatePreset("all");
    setSortColumn(null);
    setCurrentPage(1);
  }

  // Helper to format cell content with badge styling for Statuses
  function renderCell(cell: string, colName: string, colIdx: number) {
    const isFirst = colIdx === 0;
    const lowerName = colName.toLowerCase();

    if (lowerName.includes("status")) {
      const upper = cell.toUpperCase();
      let pillClass = "sent";
      if (upper === "PAID" || upper === "ACTIVE") {
        pillClass = "paid";
      } else if (upper.includes("OVERDUE") || upper === "DELETED") {
        pillClass = "overdue";
      } else if (upper === "DRAFT") {
        pillClass = "draft";
      }
      return (
        <span className={`pill ${pillClass}`}>
          <i></i>
          {cell}
        </span>
      );
    }

    if (lowerName.includes("total") || (lowerName.includes("due") && lowerName.includes("amount"))) {
      return <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{cell}</span>;
    }

    return isFirst ? <strong>{cell}</strong> : cell;
  }

  const message =
    state === "setup"
      ? "Configure DATABASE_URL and connect Xero in Settings to load live data."
      : state === "empty"
      ? "No synchronized records yet. Use Sync Xero in Settings."
      : state === "error"
      ? "The data source could not be reached. Check the database configuration."
      : null;

  return (
    <div className="content-inner">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="subheading">{description}</p>
        </div>
        {headerAction ? headerAction : action && <button className="primary-button">+ {action}</button>}
      </div>

      <div className="metric-grid compact-metrics">
        <article className="metric-card">
          <div className="metric-top">
            <span>Records</span>
            <div className="metric-icon blue-bg">#</div>
          </div>
          <strong>{totalRecords}</strong>
          <p className="metric-note">
            {hasActiveFilters ? `Filtered from ${rows.length} total records` : "Synchronized records"}
          </p>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Data source</span>
            <div className="metric-icon mint-bg">DB</div>
          </div>
          <strong className="source-value">PostgreSQL</strong>
          <p className="metric-note">Live Xero synchronized data</p>
        </article>
      </div>

      <section className="panel table-panel route-table">
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            <p>
              Showing {totalRecords > 0 ? `${startIndex + 1}–${endIndex}` : 0} of {totalRecords} records
              {hasActiveFilters && " (Filtered)"}
            </p>
          </div>
          {hasActiveFilters && (
            <button type="button" className="filter-reset-btn" onClick={resetAllFilters}>
              Reset all filters ✕
            </button>
          )}
        </div>

        {/* Search & Multi-Field Filters Toolbar */}
        {rows.length > 0 && (
          <div className="data-toolbar">
            <div className="data-toolbar-top">
              {/* Field-Targeted or Global Search */}
              <div className="data-search-box">
                <select
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  className="data-search-target-select"
                  title="Search field target"
                >
                  <option value="all">All Fields</option>
                  {columns.map((c, i) => (
                    <option key={c} value={i}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="data-search-input-wrap">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="data-search-icon"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      searchField === "all"
                        ? `Search across all fields...`
                        : `Search by ${columns[Number(searchField)]}...`
                    }
                    className="data-search-input"
                  />
                  {search && (
                    <button
                      type="button"
                      className="data-search-clear"
                      onClick={() => setSearch("")}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Categorical Dropdown Filters (Type, Class, Status, Tax type) */}
              <div className="data-filters-group">
                {categoricalColumns.map(({ colIndex, label, options }) => {
                  const currentValue = selectedFilters[colIndex] || "ALL";
                  return (
                    <div key={colIndex} className="data-filter-select-wrap">
                      <select
                        value={currentValue}
                        onChange={(e) =>
                          setSelectedFilters((prev) => ({
                            ...prev,
                            [colIndex]: e.target.value,
                          }))
                        }
                        className={`data-filter-select ${currentValue !== "ALL" ? "is-filtered" : ""}`}
                        title={`Filter by ${label}`}
                      >
                        <option value="ALL">All {label}s</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}

                {/* Date range pickers if date columns exist */}
                {dateColumns.length > 0 && (
                  <div className="data-date-filter">
                    {dateColumns.length > 1 ? (
                      <select
                        value={activeDateColIdx}
                        onChange={(e) => setSelectedDateColIdx(Number(e.target.value))}
                        className="data-date-col-select"
                        title="Select date field to filter by"
                      >
                        {dateColumns.map(({ colName, idx }) => (
                          <option key={idx} value={idx}>
                            {colName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="data-date-label">{dateColumns[0].colName}:</span>
                    )}

                    <div className="data-date-inputs-group">
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setDatePreset("custom");
                        }}
                        className="data-date-input"
                        title="Filter from date"
                      />
                      <span className="data-date-sep">to</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setDatePreset("custom");
                        }}
                        className="data-date-input"
                        title="Filter to date"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Filter Chips (Presets) */}
            <div className="data-chips-row">
              <span className="data-chips-label">Quick filters:</span>
              <button
                type="button"
                className={`filter-chip ${!hasActiveFilters ? "active" : ""}`}
                onClick={resetAllFilters}
              >
                All ({rows.length})
              </button>

              {/* Status chips */}
              {categoricalColumns.some((c) => c.options.includes("ACTIVE")) && (
                <button
                  type="button"
                  className={`filter-chip ${
                    selectedFilters[categoricalColumns.find((c) => c.options.includes("ACTIVE"))!.colIndex] === "ACTIVE"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    const col = categoricalColumns.find((c) => c.options.includes("ACTIVE"))!;
                    setSelectedFilters((prev) => ({
                      ...prev,
                      [col.colIndex]: prev[col.colIndex] === "ACTIVE" ? "ALL" : "ACTIVE",
                    }));
                  }}
                >
                  Active Only
                </button>
              )}

              {categoricalColumns.some((c) => c.options.includes("PAID")) && (
                <button
                  type="button"
                  className={`filter-chip ${
                    selectedFilters[categoricalColumns.find((c) => c.options.includes("PAID"))!.colIndex] === "PAID"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    const col = categoricalColumns.find((c) => c.options.includes("PAID"))!;
                    setSelectedFilters((prev) => ({
                      ...prev,
                      [col.colIndex]: prev[col.colIndex] === "PAID" ? "ALL" : "PAID",
                    }));
                  }}
                >
                  Paid Only
                </button>
              )}

              {categoricalColumns.some((c) => c.options.includes("AUTHORISED")) && (
                <button
                  type="button"
                  className={`filter-chip ${
                    selectedFilters[categoricalColumns.find((c) => c.options.includes("AUTHORISED"))!.colIndex] === "AUTHORISED"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    const col = categoricalColumns.find((c) => c.options.includes("AUTHORISED"))!;
                    setSelectedFilters((prev) => ({
                      ...prev,
                      [col.colIndex]: prev[col.colIndex] === "AUTHORISED" ? "ALL" : "AUTHORISED",
                    }));
                  }}
                >
                  Authorised Only
                </button>
              )}

              {dateColumns.length > 0 && (
                <>
                  <button
                    type="button"
                    className={`filter-chip ${datePreset === "overdue" ? "active" : ""}`}
                    onClick={() => handleDatePreset(datePreset === "overdue" ? "all" : "overdue")}
                  >
                    Due / Overdue
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${datePreset === "this-month" ? "active" : ""}`}
                    onClick={() => handleDatePreset(datePreset === "this-month" ? "all" : "this-month")}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    className={`filter-chip ${datePreset === "last-30" ? "active" : ""}`}
                    onClick={() => handleDatePreset(datePreset === "last-30" ? "all" : "last-30")}
                  >
                    Last 30 Days
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {message ? (
          <p className="route-note">
            <span className="info">i</span>
            {message}
          </p>
        ) : totalRecords === 0 ? (
          <div className="table-empty-state">
            <p className="empty-title">No records match your search or filter criteria.</p>
            <p className="empty-desc">
              Try adjusting your query, clearing active filters, or reset to view all {rows.length} records.
            </p>
            <button type="button" className="primary-button" onClick={resetAllFilters}>
              Reset all filters
            </button>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {columns.map((col, idx) => (
                      <th
                        key={col}
                        onClick={() => handleSort(idx)}
                        className="sortable-th"
                        title={`Click to sort by ${col}`}
                      >
                        <span className="th-content">
                          {col}
                          <span className={`sort-arrow ${sortColumn === idx ? "active" : ""}`}>
                            {sortColumn === idx ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, index) => (
                    <tr key={`row-${startIndex + index}-${row[0]}`}>
                      {row.map((cell, i) => (
                        <td key={i}>{renderCell(cell, columns[i], i)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div className="table-pagination">
              <div className="pagination-info">
                <span>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of <strong>{totalRecords}</strong> records
                </span>
                <div className="page-size-selector">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="page-size-select"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>per page</span>
                </div>
              </div>

              <div className="pagination-controls">
                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  title="Previous page"
                >
                  ‹ Previous
                </button>

                <div className="page-numbers">
                  {pageNumbers.map((p, idx) =>
                    p === "..." ? (
                      <span key={`ellipsis-${idx}`} className="page-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={`page-${p}-${idx}`}
                        type="button"
                        className={`page-num-btn ${safeCurrentPage === p ? "active" : ""}`}
                        onClick={() => setCurrentPage(p as number)}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  title="Next page"
                >
                  Next ›
                </button>
              </div>
            </div>
          </>
        )}

        {note && (
          <p className="route-note">
            <span className="info">i</span>
            {note}
          </p>
        )}
      </section>

      <Link className="back-link" href="/">
        ← Back to overview
      </Link>
      <p className="footer-note">
        <span className="live-dot" />
        Live Xero data synchronized through PostgreSQL
      </p>
    </div>
  );
}
