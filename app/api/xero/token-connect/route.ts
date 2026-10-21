import { NextResponse } from "next/server";
import { assertApiAdmin } from "@/app/lib/auth";
import { db, ensureSchema } from "@/app/lib/db";
import { encrypt } from "@/app/lib/tokens";
import { syncXeroAccounts } from "@/app/lib/xero";
import { getXeroConfig } from "@/app/lib/xero-config";

export async function POST(request: Request) {
  if (!(await assertApiAdmin())) {
    return NextResponse.json({ error: "Sign in as an administrator first." }, { status: 401 });
  }

  try {
    const { accessToken, tenantId, tenantName } = await request.json() as {
      accessToken?: string;
      tenantId?: string;
      tenantName?: string;
    };

    if (!accessToken || !tenantId) {
      return NextResponse.json(
        { error: "Access token and Tenant ID are both required." },
        { status: 400 }
      );
    }

    await ensureSchema();
    const expiresAt = new Date(Date.now() + 60 * 86400000); // 60 days
    const config = await getXeroConfig().catch(() => null);
    const scopes = config?.scopes || "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read";

    await db().query(`
      INSERT INTO xero_connections (tenant_id, tenant_name, tenant_type, access_token, refresh_token, expires_at, scopes)
      VALUES ($1, $2, 'ORGANISATION', $3, $4, $5, $6)
      ON CONFLICT (tenant_id) DO UPDATE SET
        tenant_name = EXCLUDED.tenant_name,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        scopes = EXCLUDED.scopes,
        updated_at = now()
    `, [
      tenantId.trim(),
      tenantName?.trim() || "Xero Connected Organisation",
      encrypt(accessToken.trim()),
      encrypt(accessToken.trim()),
      expiresAt,
      scopes,
    ]);

    // Test fetch accounts directly from https://api.xero.com/api.xro/2.0/Accounts
    const syncRes = await syncXeroAccounts();

    return NextResponse.json({
      ok: true,
      message: `Successfully connected and fetched ${syncRes.accounts} accounts from https://api.xero.com/api.xro/2.0/Accounts.`,
      accounts: syncRes.accounts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect with token." },
      { status: 500 }
    );
  }
}
