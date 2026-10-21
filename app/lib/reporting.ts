import { hasDatabase, db, ensureSchema } from "./db";

export type InvoiceRow = { invoice_number: string | null; contact_name: string; invoice_date: string | null; due_date: string | null; status: string; total: string; amount_due: string };
export type AccountRow = { code: string | null; name: string; type: string | null; status: string | null; balance: string | null };

export async function getReportingData() {
  if (!hasDatabase()) return { state: "setup" as const, accounts: [] as AccountRow[], invoices: [] as InvoiceRow[] };
  try {
    await ensureSchema();
    const [accounts, invoices] = await Promise.all([
      db().query<AccountRow>("SELECT code,name,type,status,balance::text FROM xero_accounts ORDER BY code NULLS LAST, name"),
      db().query<InvoiceRow>("SELECT invoice_number,contact_name,invoice_date::text,due_date::text,status,total::text,amount_due::text FROM xero_invoices ORDER BY invoice_date DESC NULLS LAST"),
    ]);
    return { state: (accounts.rowCount || invoices.rowCount ? "ready" : "empty") as "ready" | "empty", accounts: accounts.rows, invoices: invoices.rows };
  } catch (error) { return { state: "error" as const, accounts: [] as AccountRow[], invoices: [] as InvoiceRow[], error: error instanceof Error ? error.message : "Database unavailable" }; }
}

export function money(value: string | null) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0)); }
export function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—"; }
