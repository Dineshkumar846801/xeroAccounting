import { db, ensureSchema } from "./db";
import { decrypt, encrypt } from "./tokens";

const fallbackRedirect = "http://localhost:3000/api/xero/callback";
export const DEFAULT_SCOPES = "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read accounting.reports.read accounting.transactions.read";

export async function getXeroConfig() {
  await ensureSchema();
  const result = await db().query<{ client_id: string; client_secret: string; redirect_uri: string; scopes: string | null }>(
    "SELECT client_id, client_secret, redirect_uri, scopes FROM xero_credentials WHERE id=true"
  );
  const row = result.rows[0];
  if (row) {
    try {
      return {
        clientId: decrypt(row.client_id),
        clientSecret: decrypt(row.client_secret),
        redirectUri: row.redirect_uri || fallbackRedirect,
        scopes: row.scopes || DEFAULT_SCOPES,
      };
    } catch {
      // If decryption fails due to modified key
    }
  }
  if (process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET) {
    return {
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUri: process.env.XERO_REDIRECT_URI || fallbackRedirect,
      scopes: process.env.XERO_SCOPES || DEFAULT_SCOPES,
    };
  }
  throw new Error("Configure Xero credentials in Settings first");
}

export async function saveXeroConfig(clientId: string, clientSecret?: string, redirectUri?: string, scopes?: string) {
  await ensureSchema();
  const selectedScopes = scopes?.trim() || DEFAULT_SCOPES;
  const selectedRedirect = redirectUri?.trim() || fallbackRedirect;
  const trimmedId = clientId.trim();

  if (clientSecret && clientSecret.trim()) {
    await db().query(
      `INSERT INTO xero_credentials (id, client_id, client_secret, redirect_uri, scopes)
       VALUES (true, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         redirect_uri = EXCLUDED.redirect_uri,
         scopes = EXCLUDED.scopes,
         updated_at = now()`,
      [encrypt(trimmedId), encrypt(clientSecret.trim()), selectedRedirect, selectedScopes]
    );
  } else {
    const existing = await db().query<{ client_secret: string }>(
      "SELECT client_secret FROM xero_credentials WHERE id=true"
    );
    if (!existing.rows[0]?.client_secret) {
      throw new Error("Client Secret is required for initial configuration.");
    }
    await db().query(
      `UPDATE xero_credentials SET
         client_id = $1,
         redirect_uri = $2,
         scopes = $3,
         updated_at = now()
       WHERE id = true`,
      [encrypt(trimmedId), selectedRedirect, selectedScopes]
    );
  }
}
