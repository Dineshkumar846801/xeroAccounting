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
async function activeConnection() {
  await ensureSchema();
  const result = await db().query<{
    tenant_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: Date;
    last_synced_at?: Date | null;
  }>(
    "SELECT tenant_id, access_token, refresh_token, expires_at, last_synced_at FROM xero_connections ORDER BY updated_at DESC LIMIT 1"
  );
  const row = result.rows[0];
  if (!row) throw new Error("Connect a Xero organisation in Settings first");
  let accessToken = decrypt(row.access_token);
  if (row.expires_at.getTime() < Date.now() + 120000) {
    const refreshed = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decrypt(row.refresh_token),
      })
    );
    accessToken = refreshed.access_token;
    await db().query(
      "UPDATE xero_connections SET access_token=$1, refresh_token=$2, expires_at=$3, updated_at=now() WHERE tenant_id=$4",
      [
        encrypt(refreshed.access_token),
        encrypt(refreshed.refresh_token),
        new Date(Date.now() + refreshed.expires_in * 1000),
        row.tenant_id,
      ]
    );
  }
  return { tenantId: row.tenant_id, accessToken, lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null };
}

export interface SyncOptions {
  fullSync?: boolean;
  type?: "accounts" | "invoices" | "all";
}

export async function syncXeroAccounts() {
  return syncXeroData({ type: "accounts", fullSync: true });
}

export async function syncXeroData(options: SyncOptions = {}) {
  const { tenantId, accessToken, lastSyncedAt } = await activeConnection();
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };

  const client = await db().connect();
  let accountsUpdated = 0;
  let invoicesUpdated = 0;
  let formattedModifiedSince: string | null = null;
  let isIncremental = false;

  try {
    await client.query("BEGIN");

    // 1. Chart of Accounts Sync
    const shouldSyncAccounts = options.type === "accounts" || options.type === "all" || !options.type;
    const existingAccounts = await client.query<{ c: string }>(
      "SELECT COUNT(*) AS c FROM xero_accounts WHERE tenant_id = $1",
      [tenantId]
    );
    const hasExistingAccounts = parseInt(existingAccounts.rows[0]?.c ?? "0", 10) > 0;

    if (shouldSyncAccounts && (!hasExistingAccounts || options.fullSync || options.type === "accounts")) {
      const accountsResponse = await fetch("https://api.xero.com/api.xro/2.0/Accounts", {
        headers: baseHeaders,
        cache: "no-store",
      });
      if (!accountsResponse.ok) {
        const text = await accountsResponse.text();
        throw new Error(`Xero accounts sync failed (${accountsResponse.status}): ${text || accountsResponse.statusText}`);
      }
      const accData = (await accountsResponse.json()) as { Accounts?: Array<Record<string, unknown>> };
      const accounts = accData.Accounts ?? [];

      for (const a of accounts) {
        await client.query(
          `INSERT INTO xero_accounts (tenant_id, account_id, code, name, type, status, tax_type, description, class)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (tenant_id, account_id) DO UPDATE SET
             code = EXCLUDED.code,
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             status = EXCLUDED.status,
             tax_type = EXCLUDED.tax_type,
             description = EXCLUDED.description,
             class = EXCLUDED.class,
             updated_at = now()`,
          [
            tenantId,
            a.AccountID,
            a.Code ?? null,
            a.Name,
            a.Type ?? null,
            a.Status ?? null,
            a.TaxType ?? null,
            a.Description ?? null,
            a.Class ?? null,
          ]
        );
      }
      accountsUpdated = accounts.length;
    }

    // 2. Invoices Sync with If-Modified-Since Efficiency (Per Xero Best Practices)
    const shouldSyncInvoices = options.type === "invoices" || options.type === "all" || !options.type;
    if (shouldSyncInvoices) {
      const invoiceHeaders: Record<string, string> = { ...baseHeaders };

      // Determine timestamp for If-Modified-Since
      if (!options.fullSync) {
        if (lastSyncedAt) {
          // Incremental sync: Only fetch invoices created or updated since last sync
          // Subtract 10 seconds buffer to guard against clock skew or same-second writes
          const bufferDate = new Date(Math.max(0, lastSyncedAt.getTime() - 10000));
          formattedModifiedSince = bufferDate.toUTCString().replace("GMT", "UTC");
          invoiceHeaders["If-Modified-Since"] = formattedModifiedSince;
          isIncremental = true;
        } else {
          // Initial sync: Xero best practice recommends past 2 years of invoices
          const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
          formattedModifiedSince = twoYearsAgo.toUTCString().replace("GMT", "UTC");
          invoiceHeaders["If-Modified-Since"] = formattedModifiedSince;
          isIncremental = false;
        }
      }

      // Support paging through modified invoices
      let page = 1;
      let hasMorePages = true;
      const allFetchedInvoices: Array<Record<string, unknown>> = [];

      while (hasMorePages && page <= 10) {
        const invoicesResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices?page=${page}`,
          { headers: invoiceHeaders, cache: "no-store" }
        );

        // HTTP 304 Not Modified means no invoices were modified since that date/time
        if (invoicesResponse.status === 304) {
          hasMorePages = false;
          break;
        }

        if (!invoicesResponse.ok) {
          const text = await invoicesResponse.text();
          throw new Error(`Xero invoices sync failed (${invoicesResponse.status}): ${text || invoicesResponse.statusText}`);
        }

        const invData = (await invoicesResponse.json()) as { Invoices?: Array<Record<string, unknown>> };
        const pageInvoices = invData.Invoices ?? [];
        allFetchedInvoices.push(...pageInvoices);

        // Xero pages invoices by 100 per page. If fewer than 100, we are on the last page
        if (pageInvoices.length < 100) {
          hasMorePages = false;
        } else {
          page++;
        }
      }

      // Upsert ONLY the modified or newly created invoices into PostgreSQL
      for (const i of allFetchedInvoices) {
        await client.query(
          `INSERT INTO xero_invoices (tenant_id, invoice_id, invoice_number, contact_name, invoice_date, due_date, status, total, amount_due, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET
             invoice_number = EXCLUDED.invoice_number,
             contact_name = EXCLUDED.contact_name,
             invoice_date = EXCLUDED.invoice_date,
             due_date = EXCLUDED.due_date,
             status = EXCLUDED.status,
             total = EXCLUDED.total,
             amount_due = EXCLUDED.amount_due,
             updated_at = now()`,
          [
            tenantId,
            i.InvoiceID,
            i.InvoiceNumber,
            (i.Contact as { Name?: string } | undefined)?.Name ?? "—",
            i.DateString ?? null,
            i.DueDateString ?? null,
            i.Status,
            i.Total ?? 0,
            i.AmountDue ?? 0,
          ]
        );
      }
      invoicesUpdated = allFetchedInvoices.length;
    }

    // Update last_synced_at timestamp in xero_connections
    await client.query(
      "UPDATE xero_connections SET last_synced_at = now(), updated_at = now() WHERE tenant_id = $1",
      [tenantId]
    );

    // Get current total counts from PostgreSQL
    const totalCountRes = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM xero_invoices WHERE tenant_id = $1",
      [tenantId]
    );
    const totalInDb = parseInt(totalCountRes.rows[0]?.count ?? "0", 10);

    const accountsCountRes = await client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM xero_accounts WHERE tenant_id = $1",
      [tenantId]
    );
    const totalAccountsInDb = parseInt(accountsCountRes.rows[0]?.count ?? "0", 10);

    await client.query("COMMIT");

    return {
      ok: true,
      newOrUpdated: invoicesUpdated,
      invoices: invoicesUpdated,
      accounts: accountsUpdated || totalAccountsInDb,
      totalInDb,
      isIncremental,
      modifiedSince: formattedModifiedSince,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


