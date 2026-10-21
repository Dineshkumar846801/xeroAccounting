import { db, ensureSchema } from "./db";
import { decrypt, encrypt } from "./tokens";
import { getXeroConfig } from "./xero-config";
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
type Tenant = { tenantId: string; tenantName: string; tenantType: string };
async function tokenRequest(body: URLSearchParams) {
  const { clientId, clientSecret } = await getXeroConfig();
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
    },
    body,
    cache: "no-store"
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Xero token request failed (${response.status}): ${errorBody || response.statusText}`);
  }
  return response.json() as Promise<TokenResponse>;
}
export async function saveConnection(tokens: TokenResponse) {
  await ensureSchema();
  const connections = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store"
  });
  if (!connections.ok) throw new Error("Unable to read the connected Xero organisation");
  const tenant = (await connections.json() as Tenant[])[0];
  if (!tenant) throw new Error("No Xero organisation was selected during authorisation");
  const config = await getXeroConfig().catch(() => null);
  const grantedScopes = tokens.scope || config?.scopes || "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read";
  await db().query(
    `INSERT INTO xero_connections (tenant_id,tenant_name,tenant_type,access_token,refresh_token,expires_at,scopes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       tenant_name=EXCLUDED.tenant_name,
       tenant_type=EXCLUDED.tenant_type,
       access_token=EXCLUDED.access_token,
       refresh_token=EXCLUDED.refresh_token,
       expires_at=EXCLUDED.expires_at,
       scopes=EXCLUDED.scopes,
       updated_at=now()`,
    [tenant.tenantId, tenant.tenantName, tenant.tenantType, encrypt(tokens.access_token), encrypt(tokens.refresh_token), new Date(Date.now() + tokens.expires_in * 1000), grantedScopes]
  );
  return tenant;
}
async function activeConnection() { await ensureSchema(); const result = await db().query<{ tenant_id: string; access_token: string; refresh_token: string; expires_at: Date }>("SELECT tenant_id,access_token,refresh_token,expires_at FROM xero_connections ORDER BY updated_at DESC LIMIT 1"); const row = result.rows[0]; if (!row) throw new Error("Connect a Xero organisation in Settings first"); let accessToken = decrypt(row.access_token); if (row.expires_at.getTime() < Date.now() + 120000) { const refreshed = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token) })); accessToken = refreshed.access_token; await db().query("UPDATE xero_connections SET access_token=$1,refresh_token=$2,expires_at=$3,updated_at=now() WHERE tenant_id=$4", [encrypt(refreshed.access_token), encrypt(refreshed.refresh_token), new Date(Date.now() + refreshed.expires_in * 1000), row.tenant_id]); } return { tenantId: row.tenant_id, accessToken }; }
export async function syncXeroAccounts() {
  return syncXeroData();
}

export async function syncXeroData() {
  const { tenantId, accessToken } = await activeConnection();
  const headers = { Authorization: `Bearer ${accessToken}`, "Xero-tenant-id": tenantId, Accept: "application/json" };

  // 1. Fetch Accounts from Xero API
  const accountsResponse = await fetch("https://api.xero.com/api.xro/2.0/Accounts", { headers, cache: "no-store" });
  if (!accountsResponse.ok) {
    const text = await accountsResponse.text();
    throw new Error(`Xero accounts sync failed (${accountsResponse.status}): ${text || accountsResponse.statusText}`);
  }
  const accounts = ((await accountsResponse.json()) as { Accounts?: Array<Record<string, unknown>> }).Accounts ?? [];

  // 2. Fetch Invoices with full line items from Xero API (page=1)
  const invoicesResponse = await fetch("https://api.xero.com/api.xro/2.0/Invoices?page=1", { headers, cache: "no-store" });
  if (!invoicesResponse.ok) {
    const text = await invoicesResponse.text();
    throw new Error(`Xero invoices sync failed (${invoicesResponse.status}): ${text || invoicesResponse.statusText}`);
  }
  const invoices = ((await invoicesResponse.json()) as { Invoices?: Array<Record<string, unknown>> }).Invoices ?? [];

  // 3. Compute live ledger balances from actual Xero transactions
  const balancesByAccountCode: Record<string, number> = {};
  const balancesByAccountId: Record<string, number> = {};
  let totalReceivablesDue = 0;
  let totalPayablesDue = 0;
  let totalPaidToBank = 0;
  let taxCollected = 0;
  let taxPaid = 0;

  for (const inv of invoices) {
    const isReceivable = inv.Type === "ACCREC";
    const isPayable = inv.Type === "ACCPAY";
    const amountDue = Number(inv.AmountDue || 0);
    const amountPaid = Number(inv.AmountPaid || 0);
    const totalTax = Number(inv.TotalTax || 0);

    if (isReceivable) {
      totalReceivablesDue += amountDue;
      totalPaidToBank += amountPaid;
      taxCollected += totalTax;
    } else if (isPayable) {
      totalPayablesDue += amountDue;
      totalPaidToBank -= amountPaid;
      taxPaid += totalTax;
    }

    const lineItems = (inv.LineItems as Array<Record<string, unknown>>) || [];
    for (const line of lineItems) {
      const lineAmt = Number(line.LineAmount || 0);
      const code = line.AccountCode as string | undefined;
      const id = line.AccountID as string | undefined;
      if (code) {
        balancesByAccountCode[code] = (balancesByAccountCode[code] || 0) + lineAmt;
      }
      if (id) {
        balancesByAccountId[id] = (balancesByAccountId[id] || 0) + lineAmt;
      }
    }
  }

  // 4. Try fetching reports if accessible (e.g. Trial Balance or Bank Summary)
  try {
    const trialBalanceResponse = await fetch("https://api.xero.com/api.xro/2.0/Reports/TrialBalance", { headers, cache: "no-store" });
    if (trialBalanceResponse.ok) {
      const repData = (await trialBalanceResponse.json()) as { Reports?: Array<{ Rows?: Array<any> }> };
      const rows = repData.Reports?.[0]?.Rows || [];
      for (const section of rows) {
        for (const row of section.Rows || []) {
          if (row.RowType === "Row" && row.Cells && row.Cells.length >= 2) {
            const accountDesc = String(row.Cells[0]?.Value || "");
            const debit = Number(row.Cells[1]?.Value || 0);
            const credit = Number(row.Cells[2]?.Value || 0);
            const netBalance = Math.abs(debit - credit);
            for (const a of accounts) {
              const code = String(a.Code || "");
              const name = String(a.Name || "");
              if ((code && accountDesc.includes(code)) || (name && accountDesc.includes(name))) {
                balancesByAccountId[String(a.AccountID)] = netBalance;
              }
            }
          }
        }
      }
    }
  } catch {
    // Reports scope not enabled or optional
  }

  // 5. Save all accounts and invoices into PostgreSQL database
  const client = await db().connect();
  try {
    await client.query("BEGIN");

    for (const a of accounts) {
      const code = String(a.Code || "");
      const name = String(a.Name || "").toLowerCase();
      const type = String(a.Type || "");

      let balance = balancesByAccountId[String(a.AccountID)] || balancesByAccountCode[code] || 0;

      if (code === "610" || name === "accounts receivable") {
        balance = totalReceivablesDue;
      } else if (code === "800" || name === "accounts payable") {
        balance = totalPayablesDue;
      } else if (code === "090" || (type === "BANK" && name.includes("business bank"))) {
        balance = totalPaidToBank;
      } else if (code === "820" || name === "sales tax") {
        balance = Math.abs(taxCollected - taxPaid);
      }

      await client.query(`
        INSERT INTO xero_accounts (tenant_id, account_id, code, name, type, status, tax_type, description, class)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, account_id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          tax_type = EXCLUDED.tax_type,
          description = EXCLUDED.description,
          class = EXCLUDED.class,
          updated_at = now()
      `, [
        tenantId,
        a.AccountID,
        a.Code ?? null,
        a.Name,
        a.Type ?? null,
        a.Status ?? null,
        a.TaxType ?? null,
        a.Description ?? null,
        a.Class ?? null,
      ]);
    }

    for (const i of invoices) {
      await client.query(`
        INSERT INTO xero_invoices (tenant_id, invoice_id, invoice_number, contact_name, invoice_date, due_date, status, total, amount_due)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET
          invoice_number = EXCLUDED.invoice_number,
          contact_name = EXCLUDED.contact_name,
          invoice_date = EXCLUDED.invoice_date,
          due_date = EXCLUDED.due_date,
          status = EXCLUDED.status,
          total = EXCLUDED.total,
          amount_due = EXCLUDED.amount_due,
          updated_at = now()
      `, [
        tenantId,
        i.InvoiceID,
        i.InvoiceNumber,
        (i.Contact as { Name?: string } | undefined)?.Name ?? "—",
        i.DateString ?? null,
        i.DueDateString ?? null,
        i.Status,
        i.Total ?? 0,
        i.AmountDue ?? 0,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { accounts: accounts.length, invoices: invoices.length };
}


