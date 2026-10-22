import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveConnection } from "@/app/lib/xero";
import { getXeroConfig } from "@/app/lib/xero-config";

const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/xero/callback";

function settingsRedirect(request: Request, status: "connected" | "error" | "cancelled", organisation?: string, reason?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("xero", status);
  if (organisation) url.searchParams.set("organisation", organisation);
  if (reason) url.searchParams.set("reason", reason);
  return url;
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const error = callbackUrl.searchParams.get("error");
  const errorDescription = callbackUrl.searchParams.get("error_description");
  const code = callbackUrl.searchParams.get("code");
  const receivedState = callbackUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("xero_oauth_state")?.value;
  const clearState = (response: NextResponse) => { response.cookies.set("xero_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 }); return response; };

  if (error === "access_denied") return clearState(NextResponse.redirect(settingsRedirect(request, "cancelled")));
  if (error) return clearState(NextResponse.redirect(settingsRedirect(request, "error", undefined, errorDescription || error)));
  if (!code || !expectedState || !receivedState || receivedState !== expectedState) {
    return clearState(NextResponse.redirect(settingsRedirect(request, "error", undefined, "State verification failed or session expired.")));
  }

  let clientId: string, clientSecret: string, redirectUri: string;
  try {
    ({ clientId, clientSecret, redirectUri } = await getXeroConfig());
  } catch {
    return clearState(NextResponse.redirect(settingsRedirect(request, "error", undefined, "Xero credentials not configured in PostgreSQL.")));
  }

  try {
    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      let reason = "invalid_credentials";
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.error === "invalid_client") {
          reason = "invalid_client";
        } else if (errJson.error_description) {
          reason = errJson.error_description;
        } else if (errJson.error) {
          reason = errJson.error;
        }
      } catch {}
      return clearState(NextResponse.redirect(settingsRedirect(request, "error", undefined, reason)));
    }

    const tokens: { access_token?: string } = await tokenResponse.json();
    if (!tokens.access_token) throw new Error("Xero did not return an access token");
    const connection = await saveConnection(tokens as { access_token: string; refresh_token: string; expires_in: number });
    return clearState(NextResponse.redirect(settingsRedirect(request, "connected", connection.tenantName)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return clearState(NextResponse.redirect(settingsRedirect(request, "error", undefined, msg)));
  }
}
