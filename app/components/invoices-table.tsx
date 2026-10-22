"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import type { InvoiceRow } from "../lib/reporting";
import { money, date } from "../lib/formatters";

type InvoicesTableProps = {
  invoices: InvoiceRow[];
  today: string;
};

export default function InvoicesTable({ invoices, today }: InvoicesTableProps) {
  const [search, setSearch] = useState("");
  const [searchTarget, setSearchTarget] = useState<"all" | "invoice_number" | "contact_name">("all");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortField, setSortField] = useState<keyof InvoiceRow | "effective_status">("invoice_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Get distinct statuses from invoices
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => {
      if (i.status) set.add(i.status.toUpperCase());
    });
    return Array.from(set).sort();
  }, [invoices]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, searchTarget, statusFilter, datePreset, fromDate, toDate]);

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

  function handleSort(field: keyof InvoiceRow | "effective_status") {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function resetFilters() {
    setSearch("");
    setSearchTarget("all");
    setStatusFilter("ALL");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setSortField("invoice_date");
    setSortDirection("desc");
    setCurrentPage(1);
  }

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter !== "ALL" ||
    datePreset !== "all" ||
    fromDate ||
    toDate
  );

  // Filter invoices
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Text Search
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (searchTarget === "invoice_number") {
          if (!inv.invoice_number?.toLowerCase().includes(query)) return false;
        } else if (searchTarget === "contact_name") {
          if (!inv.contact_name?.toLowerCase().includes(query)) return false;
        } else {
          const invNum = inv.invoice_number?.toLowerCase() ?? "";
          const contact = inv.contact_name?.toLowerCase() ?? "";
          const status = inv.status?.toLowerCase() ?? "";
          const total = inv.total?.toString() ?? "";
          const due = inv.amount_due?.toString() ?? "";
          if (
            !invNum.includes(query) &&
            !contact.includes(query) &&
            !status.includes(query) &&
            !total.includes(query) &&
            !due.includes(query)
          ) {
            return false;
          }
        }
      }

      // 2. Status filter
      if (statusFilter !== "ALL") {
        const isOverdue = inv.due_date && inv.due_date < today && Number(inv.amount_due) > 0;
        if (statusFilter === "OVERDUE") {
          if (!isOverdue) return false;
        } else {
          if (inv.status?.toUpperCase() !== statusFilter) return false;
        }
      }

      // 3. Date range filter (filter on invoice_date or due_date depending on preset)
      if (fromDate || toDate) {
        const dateToCheck = datePreset === "overdue" ? inv.due_date : inv.invoice_date;
        if (dateToCheck) {
          if (fromDate && dateToCheck < fromDate) return false;
          if (toDate && dateToCheck > toDate) return false;
        }
      }

      return true;
    });
  }, [invoices, search, searchTarget, statusFilter, datePreset, fromDate, toDate, today]);

  // Sort invoices
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === "total" || sortField === "amount_due") {
        const numA = Number(a[sortField] ?? 0);
        const numB = Number(b[sortField] ?? 0);
        comparison = numA - numB;
      } else if (sortField === "invoice_date" || sortField === "due_date") {
        const dateA = a[sortField] ?? "";
        const dateB = b[sortField] ?? "";
        comparison = dateA.localeCompare(dateB);
      } else {
        const strA = (a[sortField as keyof InvoiceRow] ?? "").toString();
        const strB = (b[sortField as keyof InvoiceRow] ?? "").toString();
        comparison = strA.localeCompare(strB, undefined, { numeric: true });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filtered, sortField, sortDirection]);

  // Pagination calculations
  const totalRecords = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const paginatedInvoices = useMemo(() => {
    return sorted.slice(startIndex, endIndex);
  }, [sorted, startIndex, endIndex]);

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

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h2>All Sales Invoices ({invoices.length} Total)</h2>
          <p>
            Showing {totalRecords > 0 ? `${startIndex + 1}–${endIndex}` : 0} of {totalRecords} live invoices
            {hasActiveFilters && " (Filtered)"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {hasActiveFilters && (
            <button type="button" className="filter-reset-btn" onClick={resetFilters}>
              Reset filters ✕
            </button>
          )}
          <Link className="text-button" href="/invoices">
            Full Invoices page →
          </Link>
        </div>
      </div>

      {/* Interactive Search & Multi-Field Filter Bar */}
      <div className="data-toolbar" style={{ marginTop: "14px" }}>
        <div className="data-toolbar-top">
          {/* Target + Search Bar */}
          <div className="data-search-box">
            <select
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value as "all" | "invoice_number" | "contact_name")}
              className="data-search-target-select"
              title="Search field"
            >
              <option value="all">All Fields</option>
              <option value="invoice_number">Invoice #</option>
              <option value="contact_name">Contact Name</option>
            </select>
            <div className="data-search-input-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="data-search-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  searchTarget === "invoice_number"
                    ? "Search by invoice number (e.g. INV-001)..."
                    : searchTarget === "contact_name"
                    ? "Search by contact name..."
                    : "Search by invoice #, contact, status, or amount..."
                }
                className="data-search-input"
              />
              {search && (
                <button type="button" className="data-search-clear" onClick={() => setSearch("")} title="Clear search">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Status Dropdown Filter */}
          <div className="data-filters-group">
            <div className="data-filter-select-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`data-filter-select ${statusFilter !== "ALL" ? "is-filtered" : ""}`}
                title="Filter by status"
              >
                <option value="ALL">All Statuses</option>
                <option value="OVERDUE">Overdue Only</option>
                {availableStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Picker */}
            <div className="data-date-filter">
              <span className="data-date-label">Date:</span>
              <div className="data-date-inputs-group">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="data-date-input"
                  title="From date"
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
                  title="To date"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="data-chips-row">
          <span className="data-chips-label">Quick filters:</span>
          <button
            type="button"
            className={`filter-chip ${!hasActiveFilters ? "active" : ""}`}
            onClick={resetFilters}
          >
            All ({invoices.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === "PAID" ? "active" : ""}`}
            onClick={() => setStatusFilter((prev) => (prev === "PAID" ? "ALL" : "PAID"))}
          >
            Paid Only
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === "AUTHORISED" ? "active" : ""}`}
            onClick={() => setStatusFilter((prev) => (prev === "AUTHORISED" ? "ALL" : "AUTHORISED"))}
          >
            Authorised
          </button>
          <button
            type="button"
            className={`filter-chip ${statusFilter === "OVERDUE" || datePreset === "overdue" ? "active" : ""}`}
            onClick={() => {
              if (statusFilter === "OVERDUE") {
                setStatusFilter("ALL");
              } else {
                setStatusFilter("OVERDUE");
              }
            }}
          >
            Overdue
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
        </div>
      </div>

      {totalRecords === 0 ? (
        <div className="table-empty-state">
          <p className="empty-title">No invoices match your search or filter criteria.</p>
          <p className="empty-desc">
            Try adjusting your query or click below to view all {invoices.length} invoices.
          </p>
          <button type="button" className="primary-button" onClick={resetFilters}>
            Reset all filters
          </button>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort("invoice_number")} className="sortable-th">
                    <span className="th-content">
                      Invoice
                      <span className={`sort-arrow ${sortField === "invoice_number" ? "active" : ""}`}>
                        {sortField === "invoice_number" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("contact_name")} className="sortable-th">
                    <span className="th-content">
                      Contact
                      <span className={`sort-arrow ${sortField === "contact_name" ? "active" : ""}`}>
                        {sortField === "contact_name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("invoice_date")} className="sortable-th">
                    <span className="th-content">
                      Invoice date
                      <span className={`sort-arrow ${sortField === "invoice_date" ? "active" : ""}`}>
                        {sortField === "invoice_date" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("due_date")} className="sortable-th">
                    <span className="th-content">
                      Due date
                      <span className={`sort-arrow ${sortField === "due_date" ? "active" : ""}`}>
                        {sortField === "due_date" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("status")} className="sortable-th">
                    <span className="th-content">
                      Status
                      <span className={`sort-arrow ${sortField === "status" ? "active" : ""}`}>
                        {sortField === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("total")} className="sortable-th align-right">
                    <span className="th-content" style={{ justifyContent: "flex-end" }}>
                      Total
                      <span className={`sort-arrow ${sortField === "total" ? "active" : ""}`}>
                        {sortField === "total" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("amount_due")} className="sortable-th align-right">
                    <span className="th-content" style={{ justifyContent: "flex-end" }}>
                      Amount due
                      <span className={`sort-arrow ${sortField === "amount_due" ? "active" : ""}`}>
                        {sortField === "amount_due" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedInvoices.map((i, index) => {
                  const isOverdue = i.due_date && i.due_date < today && Number(i.amount_due) > 0;
                  let pillClass = "sent";
                  if (i.status === "PAID") pillClass = "paid";
                  else if (isOverdue) pillClass = "overdue";
                  else if (i.status === "DRAFT") pillClass = "draft";

                  const rowKey = i.invoice_id ?? `${i.invoice_number ?? "inv"}-${startIndex + index}`;

                  return (
                    <tr key={rowKey}>
                      <td>
                        <strong>{i.invoice_number ?? "—"}</strong>
                      </td>
                      <td>{i.contact_name}</td>
                      <td>{date(i.invoice_date)}</td>
                      <td>{date(i.due_date)}</td>
                      <td>
                        <span className={`pill ${pillClass}`}>
                          <i></i>
                          {isOverdue ? "OVERDUE" : i.status}
                        </span>
                      </td>
                      <td className="align-right">{money(i.total)}</td>
                      <td className="align-right">
                        <strong>{money(i.amount_due)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          <div className="table-pagination">
            <div className="pagination-info">
              <span>
                Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of <strong>{totalRecords}</strong> invoices
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
    </section>
  );
}
