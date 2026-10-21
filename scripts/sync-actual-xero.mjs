import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/xero_accounting";
const pool = new Pool({ connectionString });

function key() {
  const value = process.env.XERO_TOKEN_ENCRYPTION_KEY || "dd578fe8d2b6ec2dac8f6d41baf25c7a32ac9d14ffeffbf55bca64e1fab85af3";
  return Buffer.from(value, "hex");
}

function decrypt(value) {
  const [iv, payload, tag] = value.split(".");
  if (!iv || !payload || !tag) throw new Error("Stored Xero token is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  return [
    iv.toString("base64url"),
    Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64url"),
    cipher.getAuthTag().toString("base64url")
  ].join(".");
}

async function main() {
  const client = await pool.connect();
  try {
    // 1. Delete manual demo tenant
    const delRes = await client.query("DELETE FROM xero_connections WHERE tenant_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'");
    console.log("Removed demo tenant and its mock data. Deleted rows:", delRes.rowCount);

    // 2. Get active real connection
    const connRes = await client.query(
      "SELECT tenant_id, tenant_name, access_token, refresh_token, expires_at FROM xero_connections ORDER BY updated_at DESC LIMIT 1"
    );
    const conn = connRes.rows[0];
    if (!conn) {
      console.log("No connection found!");
      return;
    }
    console.log("Active real connection:", conn.tenant_name, "Tenant ID:", conn.tenant_id);

    let accessToken = decrypt(conn.access_token);
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;

    // Check if token expired or about to expire in 2 min
    if (new Date(conn.expires_at).getTime() < Date.now() + 120000) {
      console.log("Access token is expiring, refreshing...");
      const refreshToken = decrypt(conn.refresh_token);
      const tokenRes = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      });

      if (!tokenRes.ok) {
        throw new Error(`Token refresh failed: ${tokenRes.status} ${await tokenRes.text()}`);
      }

      const refreshed = await tokenRes.json();
      accessToken = refreshed.access_token;
      await client.query(
        "UPDATE xero_connections SET access_token=$1, refresh_token=$2, expires_at=$3, updated_at=now() WHERE tenant_id=$4",
        [encrypt(refreshed.access_token), encrypt(refreshed.refresh_token), new Date(Date.now() + refreshed.expires_in * 1000), conn.tenant_id]
      );
      console.log("Token successfully refreshed!");
    }

    // 3. Fetch all live Accounts and Invoices from Xero API
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": conn.tenant_id,
      Accept: "application/json"
    };

    console.log("Fetching live accounts from https://api.xero.com/api.xro/2.0/Accounts...");
    const accountsRes = await fetch("https://api.xero.com/api.xro/2.0/Accounts", { headers });
    if (!accountsRes.ok) {
      console.error("Accounts API error:", accountsRes.status, await accountsRes.text());
    } else {
      const accData = await accountsRes.json();
      const accounts = accData.Accounts || [];
      console.log(`Fetched ${accounts.length} actual accounts from Xero!`);

      await client.query("BEGIN");
      for (const a of accounts) {
        await client.query(`
          INSERT INTO xero_accounts (tenant_id, account_id, code, name, type, status, balance, tax_type, description, class)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (tenant_id, account_id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            status = EXCLUDED.status,
            balance = EXCLUDED.balance,
            tax_type = EXCLUDED.tax_type,
            description = EXCLUDED.description,
            class = EXCLUDED.class,
            updated_at = now()
        `, [
          conn.tenant_id,
          a.AccountID,
          a.Code || null,
          a.Name || "Unnamed Account",
          a.Type || null,
          a.Status || null,
          a.Balance || 0,
          a.TaxType || null,
          a.Description || null,
          a.Class || null
        ]);
      }
      await client.query("COMMIT");
      console.log(`Saved all ${accounts.length} actual accounts to PostgreSQL.`);
    }

    console.log("Fetching live invoices from https://api.xero.com/api.xro/2.0/Invoices...");
    const invoicesRes = await fetch("https://api.xero.com/api.xro/2.0/Invoices?where=Type%3D%3D%22ACCREC%22", { headers });
    if (!invoicesRes.ok) {
      console.error("Invoices API error:", invoicesRes.status, await invoicesRes.text());
    } else {
      const invData = await invoicesRes.json();
      const invoices = invData.Invoices || [];
      console.log(`Fetched ${invoices.length} actual invoices from Xero!`);

      await client.query("BEGIN");
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
          conn.tenant_id,
          i.InvoiceID,
          i.InvoiceNumber || null,
          i.Contact?.Name || "—",
          i.DateString || null,
          i.DueDateString || null,
          i.Status || null,
          i.Total || 0,
          i.AmountDue || 0
        ]);
      }
      await client.query("COMMIT");
      console.log(`Saved all ${invoices.length} actual invoices to PostgreSQL.`);
    }

    // Report final totals
    const finalAcc = await client.query("SELECT count(*) FROM xero_accounts");
    const finalInv = await client.query("SELECT count(*) FROM xero_invoices");
    console.log(`DATABASE SUMMARY: ${finalAcc.rows[0].count} actual accounts, ${finalInv.rows[0].count} actual invoices.`);
  } catch (err) {
    console.error("Error syncing actual Xero:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
