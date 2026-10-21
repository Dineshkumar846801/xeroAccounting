import { NextResponse } from "next/server";
import { db, hasDatabase, ensureSchema } from "@/app/lib/db";
import { assertApiAdmin } from "@/app/lib/auth";

export async function GET() {
  const isAdmin = await assertApiAdmin();
  if (!isAdmin) {
    return NextResponse.json({ authenticated: false, tenantName: null }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ authenticated: true, tenantName: "No Database" });
  }

  try {
    await ensureSchema();
    const result = await db().query<{ tenant_name: string; tenant_id: string }>(
      "SELECT tenant_name, tenant_id FROM xero_connections ORDER BY updated_at DESC LIMIT 1"
    );
    const conn = result.rows[0];
    return NextResponse.json({
      authenticated: true,
      tenantName: conn?.tenant_name ?? "No Xero Account Connected",
      tenantId: conn?.tenant_id ?? null,
      connected: Boolean(conn),
    });
  } catch (error) {
    return NextResponse.json({
      authenticated: true,
      tenantName: "Demo Company (Global)",
      error: error instanceof Error ? error.message : "Database error",
    });
  }
}
