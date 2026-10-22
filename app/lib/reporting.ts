import { hasDatabase, db, ensureSchema } from "./db";

export type InvoiceRow = { invoice_id?: string; invoice_number: string | null; contact_name: string; invoice_date: string | null; due_date: string | null; status: string; total: string; amount_due: string };
export type AccountRow = {
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  tax_type?: string | null;
  description?: string | null;
  class?: string | null;
};

export async function getReportingData() {
  if (!hasDatabase()) return { state: "setup" as const, accounts: [] as AccountRow[], invoices: [] as InvoiceRow[], tenantName: null };
  try {
    await ensureSchema();
    const [accounts, invoices, conn] = await Promise.all([
      db().query<AccountRow>("SELECT code,name,type,status,tax_type,description,class FROM xero_accounts ORDER BY code NULLS LAST, name"),
      db().query<InvoiceRow>("SELECT invoice_id::text,invoice_number,contact_name,invoice_date::text,due_date::text,status,total::text,amount_due::text FROM xero_invoices ORDER BY invoice_date DESC NULLS LAST"),
      db().query<{ tenant_name: string }>("SELECT tenant_name FROM xero_connections ORDER BY updated_at DESC LIMIT 1"),
    ]);
    return {
      state: (accounts.rowCount || invoices.rowCount ? "ready" : "empty") as "ready" | "empty",
      accounts: accounts.rows,
      invoices: invoices.rows,
      tenantName: conn.rows[0]?.tenant_name ?? "Demo Company (Global)"
    };
  } catch (error) { return { state: "error" as const, accounts: [] as AccountRow[], invoices: [] as InvoiceRow[], tenantName: null, error: error instanceof Error ? error.message : "Database unavailable" }; }
}

export { money, date } from "./formatters";
