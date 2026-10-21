"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const statusMessages = {
  connected: "Xero connection verified. The selected organisation can be accessed.",
  error: "Xero could not complete the connection. Please try again.",
  cancelled: "The Xero connection was cancelled.",
} as const;

export default function XeroConnection() {
  const searchParams = useSearchParams();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const status = searchParams.get("xero");
  const organisation = searchParams.get("organisation");
  const message = status && status in statusMessages ? statusMessages[status as keyof typeof statusMessages] : null;
  async function sync() {
    setSyncMessage("Synchronizing Xero data…");
    const response = await fetch("/api/xero/sync", { method: "POST" });
    const result = await response.json() as { ok: boolean; accounts?: number; invoices?: number; error?: string };
    setSyncMessage(result.ok ? `Sync complete: ${result.accounts} accounts and ${result.invoices} invoices loaded.` : result.error ?? "Sync failed.");
  }
  async function saveCredentials(form: FormData) {
    setConfigMessage("Saving encrypted credentials…");
    const response = await fetch("/api/xero/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), redirectUri: form.get("redirectUri") }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    setConfigMessage(result.ok ? "Xero credentials saved securely. You can now connect Xero." : result.error ?? "Unable to save credentials.");
  }

  return (
    <section className="panel xero-panel">
      <div className="xero-heading">
        <div>
          <p className="eyebrow">ACCOUNTING INTEGRATION</p>
          <h2>Connect Xero</h2>
          <p>Authorise read-only access to invoices, contacts, and accounting settings.</p>
        </div>
        <div className="xero-actions"><button className="filter-button" type="button" onClick={sync}>Sync Xero</button><a className="primary-button" href="/api/xero/connect">Connect Xero</a></div>
      </div>
      <form className="xero-form" action={saveCredentials}><label>Client ID<input name="clientId" autoComplete="off" required /></label><label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" required /></label><label>OAuth redirect URI<input name="redirectUri" defaultValue="http://localhost:3000/api/xero/callback" required /></label><button className="filter-button" type="submit">Save Xero credentials</button></form>
      {configMessage && <p className="xero-status" role="status">{configMessage}</p>}
      {message && <p className={`xero-status ${status === "connected" ? "success" : "error"}`} role="status">{message}{organisation ? ` Organisation: ${organisation}.` : ""}</p>}
      {syncMessage && <p className="xero-status" role="status">{syncMessage}</p>}
      <p className="route-note"><span className="info">i</span>Credentials are encrypted before storage and never returned to the browser after saving.</p>
    </section>
  );
}
