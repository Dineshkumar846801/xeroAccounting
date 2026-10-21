import { NextResponse } from "next/server";
import { assertApiAdmin } from "@/app/lib/auth";
import { getXeroConfig, saveXeroConfig, DEFAULT_SCOPES } from "@/app/lib/xero-config";

export async function GET() {
  if (!(await assertApiAdmin())) return NextResponse.json({ error: "Sign in as an administrator first." }, { status: 401 });
  try {
    const config = await getXeroConfig();
    return NextResponse.json({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      hasSecret: Boolean(config.clientSecret),
    });
  } catch {
    return NextResponse.json({
      clientId: "",
      redirectUri: "http://localhost:3000/api/xero/callback",
      scopes: DEFAULT_SCOPES,
      hasSecret: false,
    });
  }
}

export async function POST(request: Request) {
  if (!(await assertApiAdmin())) return NextResponse.json({ error: "Sign in as an administrator first." }, { status: 401 });
  const { clientId, clientSecret, redirectUri, scopes } = (await request.json()) as {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string;
  };
  if (!clientId || !clientSecret) return NextResponse.json({ error: "Client ID and Client Secret are required." }, { status: 400 });
  try {
    await saveXeroConfig(clientId, clientSecret, redirectUri ?? "", scopes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save credentials" }, { status: 500 });
  }
}

