import { NextResponse } from "next/server";
import { syncXeroData, syncXeroAccounts } from "@/app/lib/xero";
import { assertApiAdmin } from "@/app/lib/auth";

export async function POST(request: Request) {
  if (!(await assertApiAdmin())) {
    return NextResponse.json({ ok: false, error: "Sign in as an administrator first." }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { type?: string };
    if (body.type === "accounts") {
      const result = await syncXeroAccounts();
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await syncXeroData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}

