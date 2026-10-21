import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/app/lib/db";
import { hasUsers, login, logout, passwordHash } from "@/app/lib/auth";
export async function POST(request:Request){const body=await request.json() as {email?:string;password?:string;mode?:string};if(!body.email||!body.password||body.password.length<12)return NextResponse.json({error:"Use an email and a password of at least 12 characters."},{status:400});try{if(body.mode==="setup"){if(await hasUsers())return NextResponse.json({error:"Initial administrator already exists."},{status:403});await ensureSchema();await db().query("INSERT INTO app_users (email,password_hash) VALUES ($1,$2)",[body.email.toLowerCase().trim(),await passwordHash(body.password)]);}const success=await login(body.email,body.password);return success?NextResponse.json({ok:true}):NextResponse.json({error:"Invalid email or password."},{status:401});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Login unavailable"},{status:500});}}
import crypto from "node:crypto";

export async function DELETE(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/ledgerly_session=([^;]+)/);
    const token = match ? match[1].trim() : null;
    if (token) {
      await ensureSchema();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await db().query("DELETE FROM app_sessions WHERE token_hash=$1", [tokenHash]);
    }
  } catch {}

  await logout();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("ledgerly_session");
  response.cookies.set("ledgerly_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
