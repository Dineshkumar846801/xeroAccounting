import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/xero_accounting";
const pool = new Pool({ connectionString });

const defaultScopes = "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read accounting.reports.read accounting.transactions.read";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Migrating database schema for Xero scopes...");
    await client.query(`
      ALTER TABLE xero_credentials ADD COLUMN IF NOT EXISTS scopes TEXT DEFAULT '${defaultScopes}';
      ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS scopes TEXT;
      UPDATE xero_credentials SET scopes = '${defaultScopes}';
    `);

    const credRes = await client.query("SELECT id, redirect_uri, scopes FROM xero_credentials");
    console.log("xero_credentials row:", credRes.rows[0]);

    const connRes = await client.query("SELECT tenant_id, tenant_name, scopes FROM xero_connections");
    console.log("xero_connections row:", connRes.rows[0]);

    console.log("Migration completed successfully: All scopes stored in PostgreSQL database!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
