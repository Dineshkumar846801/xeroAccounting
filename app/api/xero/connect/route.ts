import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getXeroConfig } from "@/app/lib/xero-config";
import { assertApiAdmin } from "@/app/lib/auth";

const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/xero/callback";
const DEFAULT_SCOPES = "openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read";

export async function GET(request: Request) {
  if (!(await assertApiAdmin())) return NextResponse.redirect(new URL("/login", request.url));
  let clientId:string, redirectUri:string;
  try { ({clientId,redirectUri}=await getXeroConfig()); } catch { return NextResponse.redirect(new URL("/settings?xero=error", request.url)); }

  const state = crypto.randomBytes(32).toString("hex");
  const authorizeUrl = new URL("https://login.xero.com/identity/connect/authorize");
  authorizeUrl.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: process.env.XERO_SCOPES ?? DEFAULT_SCOPES, state }).toString();
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("xero_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return response;
}
