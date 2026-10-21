import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const globalForDb = globalThis as unknown as { pgPool?: Pool; schemaReady?: Promise<void> };

export function hasDatabase() { return Boolean(connectionString); }

export function db() {
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  globalForDb.pgPool ??= new Pool({ connectionString, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
  return globalForDb.pgPool;
}

export async function ensureSchema() {
  if (!hasDatabase()) throw new Error("DATABASE_URL is not configured");
  globalForDb.schemaReady ??= db().query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS xero_connections (tenant_id UUID PRIMARY KEY, tenant_name TEXT NOT NULL, tenant_type TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, scopes TEXT, connected_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    ALTER TABLE xero_connections ADD COLUMN IF NOT EXISTS scopes TEXT;
    CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS xero_credentials (id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), client_id TEXT NOT NULL, client_secret TEXT NOT NULL, redirect_uri TEXT NOT NULL, scopes TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    ALTER TABLE xero_credentials ADD COLUMN IF NOT EXISTS scopes TEXT;
    CREATE TABLE IF NOT EXISTS xero_accounts (tenant_id UUID NOT NULL REFERENCES xero_connections(tenant_id) ON DELETE CASCADE, account_id UUID NOT NULL, code TEXT, name TEXT NOT NULL, type TEXT, status TEXT, tax_type TEXT, description TEXT, class TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, account_id));
    ALTER TABLE xero_accounts DROP COLUMN IF EXISTS balance;
    ALTER TABLE xero_accounts ADD COLUMN IF NOT EXISTS tax_type TEXT;
    ALTER TABLE xero_accounts ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE xero_accounts ADD COLUMN IF NOT EXISTS class TEXT;
    CREATE TABLE IF NOT EXISTS xero_invoices (tenant_id UUID NOT NULL REFERENCES xero_connections(tenant_id) ON DELETE CASCADE, invoice_id UUID NOT NULL, invoice_number TEXT, contact_name TEXT, invoice_date DATE, due_date DATE, status TEXT, total NUMERIC(18,2) NOT NULL DEFAULT 0, amount_due NUMERIC(18,2) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, invoice_id));
    CREATE INDEX IF NOT EXISTS xero_invoices_tenant_due_idx ON xero_invoices(tenant_id, due_date);
  `).then(() => undefined);
  return globalForDb.schemaReady;
}
