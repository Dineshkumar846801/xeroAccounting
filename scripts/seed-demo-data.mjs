import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/xero_accounting";
const pool = new Pool({ connectionString });

function key() {
  const value = process.env.XERO_TOKEN_ENCRYPTION_KEY || "dd578fe8d2b6ec2dac8f6d41baf25c7a32ac9d14ffeffbf55bca64e1fab85af3";
  return Buffer.from(value, "hex");
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
    await client.query("BEGIN");

    const tenantId = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    // Ensure connection exists
    await client.query(`
      INSERT INTO xero_connections (tenant_id, tenant_name, tenant_type, access_token, refresh_token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id) DO UPDATE SET
        tenant_name = EXCLUDED.tenant_name,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `, [
      tenantId,
      "Acme Studio (Xero Demo)",
      "ORGANISATION",
      encrypt("demo_mock_access_token"),
      encrypt("demo_mock_refresh_token"),
      expiresAt
    ]);

    // Sample accounts
    const accounts = [
      { id: "b1000000-0000-0000-0000-000000000001", code: "090", name: "Business Operating Account", type: "BANK", status: "ACTIVE", balance: 34810.50 },
      { id: "b1000000-0000-0000-0000-000000000002", code: "091", name: "Business High-Interest Savings", type: "BANK", status: "ACTIVE", balance: 75250.00 },
      { id: "b1000000-0000-0000-0000-000000000003", code: "200", name: "Sales & Consulting Revenue", type: "REVENUE", status: "ACTIVE", balance: 142500.00 },
      { id: "b1000000-0000-0000-0000-000000000004", code: "260", name: "Other Revenue", type: "REVENUE", status: "ACTIVE", balance: 18400.00 },
      { id: "b1000000-0000-0000-0000-000000000005", code: "400", name: "Advertising & Growth", type: "EXPENSE", status: "ACTIVE", balance: 8450.00 },
      { id: "b1000000-0000-0000-0000-000000000006", code: "420", name: "Consulting & Contractor Fees", type: "EXPENSE", status: "ACTIVE", balance: 15300.00 },
      { id: "b1000000-0000-0000-0000-000000000007", code: "620", name: "Office Hardware & Equipment", type: "FIXED", status: "ACTIVE", balance: 22100.00 },
      { id: "b1000000-0000-0000-0000-000000000008", code: "710", name: "Office Rent & Utilities", type: "EXPENSE", status: "ACTIVE", balance: 12400.00 },
      { id: "b1000000-0000-0000-0000-000000000009", code: "800", name: "Accounts Receivable", type: "CURRASS", status: "ACTIVE", balance: 21020.00 },
      { id: "b1000000-0000-0000-0000-000000000010", code: "801", name: "Accounts Payable", type: "CURRLIAB", status: "ACTIVE", balance: 9350.00 }
    ];

    for (const a of accounts) {
      await client.query(`
        INSERT INTO xero_accounts (tenant_id, account_id, code, name, type, status, balance)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, account_id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          balance = EXCLUDED.balance,
          updated_at = now()
      `, [tenantId, a.id, a.code, a.name, a.type, a.status, a.balance]);
    }

    // Dates relative to current date (Oct 2026)
    const today = new Date().toISOString().slice(0, 10);
    const dMinus20 = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    const dMinus15 = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
    const dMinus10 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const dMinus5 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const dPlus7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dPlus14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const dPlus21 = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

    const invoices = [
      { id: "c1000000-0000-0000-0000-000000000001", num: "INV-0101", contact: "Acme Corporation", invDate: dMinus20, dueDate: dPlus7, status: "AUTHORISED", total: 4850.00, due: 4850.00 },
      { id: "c1000000-0000-0000-0000-000000000002", num: "INV-0102", contact: "Globex Logistics", invDate: dMinus20, dueDate: dMinus10, status: "AUTHORISED", total: 9200.00, due: 9200.00 },
      { id: "c1000000-0000-0000-0000-000000000003", num: "INV-0103", contact: "Initech Systems", invDate: dMinus15, dueDate: dMinus5, status: "AUTHORISED", total: 3450.00, due: 3450.00 },
      { id: "c1000000-0000-0000-0000-000000000004", num: "INV-0104", contact: "Stark Financial", invDate: dMinus10, dueDate: dPlus14, status: "AUTHORISED", total: 1420.00, due: 1420.00 },
      { id: "c1000000-0000-0000-0000-000000000005", num: "INV-0105", contact: "Wayne Enterprises", invDate: dMinus20, dueDate: dMinus5, status: "PAID", total: 12500.00, due: 0.00 },
      { id: "c1000000-0000-0000-0000-000000000006", num: "INV-0106", contact: "Cyberdyne AI", invDate: dMinus20, dueDate: dMinus10, status: "PAID", total: 6800.00, due: 0.00 },
      { id: "c1000000-0000-0000-0000-000000000007", num: "INV-0107", contact: "Hooli Media", invDate: dMinus5, dueDate: dPlus21, status: "AUTHORISED", total: 2100.00, due: 2100.00 },
      { id: "c1000000-0000-0000-0000-000000000008", num: "INV-0108", contact: "Massive Dynamic", invDate: dMinus10, dueDate: dPlus7, status: "PAID", total: 5600.00, due: 0.00 },
    ];

    for (const inv of invoices) {
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
      `, [tenantId, inv.id, inv.num, inv.contact, inv.invDate, inv.dueDate, inv.status, inv.total, inv.due]);
    }

    await client.query("COMMIT");
    console.log("Successfully seeded demo Xero data!");
    console.log(`Seeded ${accounts.length} accounts and ${invoices.length} invoices for tenant Acme Studio.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to seed demo data:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
