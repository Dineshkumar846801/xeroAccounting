import { NextResponse } from "next/server";
import { syncXeroData } from "@/app/lib/xero";
import { assertApiAdmin } from "@/app/lib/auth";
export async function POST() { if(!(await assertApiAdmin()))return NextResponse.json({ok:false,error:"Sign in as an administrator first."},{status:401}); try { return NextResponse.json({ ok: true, ...(await syncXeroData()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 }); } }
