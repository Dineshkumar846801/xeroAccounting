import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/xero_accounting";
const pool = new Pool({ connectionString });

async function main() {
  const client = await pool.connect();
  try {
    console.log("Dropping balance column from xero_accounts table in PostgreSQL...");
    await client.query("ALTER TABLE xero_accounts DROP COLUMN IF EXISTS balance;");
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'xero_accounts';");
    console.log("Current columns in xero_accounts:", res.rows.map(r => `${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
