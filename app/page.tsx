import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getReportingData, money, date } from "./lib/reporting";
import { requireAdmin } from "./lib/auth";

async function Content() {
  await connection();
  await requireAdmin();
  const data = await getReportingData();
  const invoices = data.invoices;
  const receivables = invoices.filter((i) => Number(i.amount_due) > 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = receivables.filter((i) => i.due_date && i.due_date < today);
  const totalDue = receivables.reduce((sum, i) => sum + Number(i.amount_due), 0);
  const overdueDue = overdue.reduce((sum, i) => sum + Number(i.amount_due), 0);
  const setup = data.state !== "ready";

  return (
    <div className="content-inner">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            XERO LIVE ORGANISATION • {data.tenantName ?? "Connected Xero Account"}
          </p>
          <h1>Accounting dashboard</h1>
          <p className="subheading">
            Live figures synchronized directly from your connected Xero account into PostgreSQL.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link className="text-button" href="/accounts">
            View all {data.accounts.length} accounts →
          </Link>
          <Link className="primary-button" href="/settings">
            Sync &amp; settings
          </Link>
        </div>
      </div>

      {setup ? (
        <section className="panel">
          <p className="route-note">
            <span className="info">i</span>
            {data.state === "setup"
              ? "Add DATABASE_URL and XERO_TOKEN_ENCRYPTION_KEY to .env.local, then connect Xero in Settings."
              : data.state === "empty"
              ? "Xero is connected but no data has been synchronized yet. Open Settings and select Sync Xero."
              : "The database could not be reached. Verify DATABASE_URL and PostgreSQL availability."}
          </p>
        </section>
      ) : (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <div className="metric-top">
                <span>Total accounts</span>
                <div className="metric-icon blue-bg">#</div>
              </div>
              <strong>{data.accounts.length}</strong>
              <p className="metric-note">Actual accounts from Xero</p>
            </article>

            <article className="metric-card">
              <div className="metric-top">
                <span>Total invoices</span>
                <div className="metric-icon purple-bg">#</div>
              </div>
              <strong>{invoices.length}</strong>
              <p className="metric-note">Actual sales invoices from Xero</p>
            </article>

            <article className="metric-card">
              <div className="metric-top">
                <span>Accounts receivable</span>
                <div className="metric-icon mint-bg">$</div>
              </div>
              <strong>{money(String(totalDue))}</strong>
              <p className="metric-note">Open invoice balances</p>
            </article>

            <article className="metric-card">
              <div className="metric-top">
                <span>Overdue receivables</span>
                <div className="metric-icon coral-bg">!</div>
              </div>
              <strong>{money(String(overdueDue))}</strong>
              <p className="metric-note">{overdue.length} past-due invoices</p>
            </article>
          </div>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>All Sales Invoices ({invoices.length} Total)</h2>
                <p>Complete live list of sales invoices from Xero</p>
              </div>
              <Link className="text-button" href="/invoices">
                Invoices page →
              </Link>
            </div>
            <div className="table-scroll" style={{ maxHeight: "480px", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Contact</th>
                    <th>Invoice date</th>
                    <th>Due date</th>
                    <th>Status</th>
                    <th className="align-right">Total</th>
                    <th className="align-right">Amount due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.invoice_number ?? Math.random().toString()}>
                      <td>
                        <strong>{i.invoice_number ?? "—"}</strong>
                      </td>
                      <td>{i.contact_name}</td>
                      <td>{date(i.invoice_date)}</td>
                      <td>{date(i.due_date)}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            i.status === "PAID"
                              ? "status-paid"
                              : i.due_date && i.due_date < today
                              ? "status-overdue"
                              : "status-active"
                          }`}
                        >
                          {i.due_date && i.due_date < today && Number(i.amount_due) > 0
                            ? "OVERDUE"
                            : i.status}
                        </span>
                      </td>
                      <td className="align-right">{money(i.total)}</td>
                      <td className="align-right">
                        <strong>{money(i.amount_due)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="footer-note">
        <span className="live-dot" />
        Connected to live Xero organisation: <strong>{data.tenantName ?? "Demo Company (Global)"}</strong> • Synced into PostgreSQL
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="content-inner">Loading live Xero dashboard…</div>}>
      <Content />
    </Suspense>
  );
}
