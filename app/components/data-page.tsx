import Link from "next/link";
import type { ReactNode } from "react";

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
          <strong>{rows.length}</strong>
          <p className="metric-note">Synchronized records</p>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Data source</span>
            <div className="metric-icon mint-bg">DB</div>
          </div>
          <strong className="source-value">PostgreSQL</strong>
          <p className="metric-note">Xero synchronized data</p>
        </article>
      </div>
      <section className="panel table-panel route-table">
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            <p>{rows.length} synchronized records</p>
          </div>
        </div>
        {message ? (
          <p className="route-note">
            <span className="info">i</span>
            {message}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, i) => (
                      <td key={i}>
                        {i === 0 ? <strong>{cell}</strong> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
