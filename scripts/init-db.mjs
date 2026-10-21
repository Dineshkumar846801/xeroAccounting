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

async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key))
  );
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  console.log("Checking database connection...");
  const client = await pool.connect();
  console.log("Connected to PostgreSQL successfully.");

  // Run schema creation
  console.log("Ensuring schema...");
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS xero_connections (
      tenant_id UUID PRIMARY KEY,
      tenant_name TEXT NOT NULL,
      tenant_type TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS app_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS xero_credentials (
      id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS xero_accounts (
      tenant_id UUID NOT NULL REFERENCES xero_connections(tenant_id) ON DELETE CASCADE,
      account_id UUID NOT NULL,
      code TEXT,
      name TEXT NOT NULL,
      type TEXT,
      status TEXT,
      balance NUMERIC(18,2),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS xero_invoices (
      tenant_id UUID NOT NULL REFERENCES xero_connections(tenant_id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL,
      invoice_number TEXT,
      contact_name TEXT,
      invoice_date DATE,
      due_date DATE,
      status TEXT,
      total NUMERIC(18,2) NOT NULL DEFAULT 0,
      amount_due NUMERIC(18,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, invoice_id)
    );
    CREATE INDEX IF NOT EXISTS xero_invoices_tenant_due_idx ON xero_invoices(tenant_id, due_date);
  `);
  console.log("Schema verified.");

  // Check users
  const userCheck = await client.query("SELECT id, email, created_at FROM app_users");
  console.log("Existing users in app_users:", userCheck.rows);

  // If no users, create default admin user
  const adminEmail = "admin@ledgerly.local";
  const defaultPassword = "AdminPassword123!";
  if (userCheck.rows.length === 0) {
    const hash = await passwordHash(defaultPassword);
    const insertRes = await client.query(
      "INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [adminEmail, hash]
    );
    console.log("Created default user account:", insertRes.rows[0]);
    console.log(`Login credentials -> Email: ${adminEmail} | Password: ${defaultPassword}`);
  }

  // Check Xero credentials in DB
  const credCheck = await client.query("SELECT id, redirect_uri, updated_at FROM xero_credentials");
  console.log("Existing credentials in xero_credentials:", credCheck.rows);

  // Seed Xero credentials from .env.example / user provided
  const clientId = "71064ED0A95C4D288389205B2BA4C0C0";
  const clientSecret = "zYXYDZbJjavAr-ztdpXEuwHRrpwjZ2iHNjjYxwoqH6alHbLi";
  const redirectUri = "http://localhost:3000/api/xero/callback";

  await client.query(`
    INSERT INTO xero_credentials (id, client_id, client_secret, redirect_uri)
    VALUES (true, $1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      client_secret = EXCLUDED.client_secret,
      redirect_uri = EXCLUDED.redirect_uri,
      updated_at = now()
  `, [encrypt(clientId), encrypt(clientSecret), redirectUri]);
  console.log("Saved Xero credentials into database.");

  // Check xero_connections
  const connCheck = await client.query("SELECT tenant_id, tenant_name, expires_at FROM xero_connections");
  console.log("Existing connections:", connCheck.rows);

  // Check xero_accounts & xero_invoices count
  const accCount = await client.query("SELECT count(*) FROM xero_accounts");
  const invCount = await client.query("SELECT count(*) FROM xero_invoices");
  console.log("Accounts count:", accCount.rows[0].count, "Invoices count:", invCount.rows[0].count);

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
