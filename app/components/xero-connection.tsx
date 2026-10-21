"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { xeroService, ApiError } from "@/app/services/api";

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
    try {
      const result = await xeroService.sync();
      setSyncMessage(result.ok ? `Sync complete: ${result.accounts} accounts and ${result.invoices} invoices loaded.` : result.error ?? "Sync failed.");
    } catch (err) {
      setSyncMessage(err instanceof ApiError ? err.message : "Sync failed contacting Xero.");
    }
  }

  const [clientIdVal, setClientIdVal] = useState("71064ED0A95C4D288389205B2BA4C0C0");
  const [redirectUriVal, setRedirectUriVal] = useState("http://localhost:3000/api/xero/callback");
  const [scopesVal, setScopesVal] = useState("openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read");
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  useEffect(() => {
    xeroService
      .getCredentials()
      .then((data) => {
        if (data.clientId) setClientIdVal(data.clientId);
        if (data.redirectUri) setRedirectUriVal(data.redirectUri);
        if (data.scopes) setScopesVal(data.scopes);
        setLoadedFromDb(true);
      })
      .catch(() => {});
  }, []);

  async function saveCredentials(form: FormData) {
    setConfigMessage("Saving encrypted credentials and scopes to PostgreSQL…");
    try {
      const result = await xeroService.saveCredentials({
        clientId: String(form.get("clientId") || ""),
        clientSecret: String(form.get("clientSecret") || ""),
        redirectUri: String(form.get("redirectUri") || ""),
        scopes: String(form.get("scopes") || ""),
      });
      setConfigMessage(
        result.ok
          ? "✓ Xero credentials & scopes saved in PostgreSQL successfully! You can now connect Xero."
          : result.error ?? "Unable to save credentials."
      );
    } catch (err) {
      setConfigMessage(err instanceof ApiError ? err.message : "Unable to save credentials.");
    }
  }

  const [tokenMessage, setTokenMessage] = useState<string | null>(null);

  async function connectWithToken(form: FormData) {
    setTokenMessage("Connecting and fetching from https://api.xero.com/api.xro/2.0/Accounts…");
    try {
      const result = await xeroService.tokenConnect({
        accessToken: String(form.get("accessToken") || ""),
        tenantId: String(form.get("tenantId") || ""),
        tenantName: String(form.get("tenantName") || ""),
      });
      setTokenMessage(result.ok ? result.message ?? "Connected successfully!" : result.error ?? "Failed to connect.");
    } catch (err) {
      setTokenMessage(err instanceof ApiError ? err.message : "Failed to connect with token.");
    }
  }

  const availableScopes = [
    { name: "openid", desc: "User identity" },
    { name: "profile", desc: "User profile" },
    { name: "email", desc: "User email" },
    { name: "offline_access", desc: "Continuous sync / Refresh token" },
    { name: "accounting.invoices.read", desc: "Read invoices & receivables" },
    { name: "accounting.contacts.read", desc: "Read contacts & customers" },
    { name: "accounting.settings.read", desc: "Read chart of accounts & organisation info" },
    { name: "accounting.reports.read", desc: "Read general ledger trial balances & reports" },
    { name: "accounting.transactions.read", desc: "Read bank transactions & payments" },
  ];

  function toggleScope(scopeName: string) {
    const current = scopesVal.split(/\s+/).filter(Boolean);
    const exists = current.includes(scopeName);
    const updated = exists ? current.filter((s) => s !== scopeName) : [...current, scopeName];
    setScopesVal(updated.join(" "));
  }

  return (
    <section className="panel xero-panel">
      <div className="xero-heading">
        <div>
          <p className="eyebrow">ACCOUNTING INTEGRATION</p>
          <h2>Connect Xero</h2>
          <p>OAuth credentials and scopes are stored securely in PostgreSQL (<code>xero_credentials</code> table).</p>
        </div>
        <div className="xero-actions">
          <button className="filter-button" type="button" onClick={sync}>
            Sync Xero
          </button>
          <a className="primary-button" href={xeroService.getConnectUrl()}>
            Connect Xero (OAuth)
          </a>
        </div>
      </div>

      <form className="xero-form" action={saveCredentials}>
        <label>
          Client ID
          <input
            name="clientId"
            value={clientIdVal}
            onChange={(e) => setClientIdVal(e.target.value)}
            required
          />
        </label>
        <label>
          Client Secret
          <input
            name="clientSecret"
            type="password"
            defaultValue="zYXYDZbJjavAr-ztdpXEuwHRrpwjZ2iHNjjYxwoqH6alHbLi"
            required
          />
        </label>
        <label style={{ gridColumn: "span 2" }}>
          OAuth redirect URI
          <input
            name="redirectUri"
            value={redirectUriVal}
            onChange={(e) => setRedirectUriVal(e.target.value)}
            required
          />
        </label>
        <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ margin: 0, fontWeight: 600 }}>
            OAuth Scopes (Stored in PostgreSQL Database table <code>xero_credentials.scopes</code>)
          </label>
          <input
            name="scopes"
            value={scopesVal}
            onChange={(e) => setScopesVal(e.target.value)}
            required
            style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)", alignSelf: "center", marginRight: "0.25rem" }}>Quick toggle:</span>
            {availableScopes.map((s) => {
              const active = scopesVal.split(/\s+/).includes(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => toggleScope(s.name)}
                  title={s.desc}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "6px",
                    border: `1px solid ${active ? "var(--primary, #3b82f6)" : "var(--border, #334155)"}`,
                    background: active ? "rgba(59, 130, 246, 0.15)" : "transparent",
                    color: active ? "#60a5fa" : "var(--text-muted, #94a3b8)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {active ? "✓ " : "+ "}
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
        <button className="filter-button" type="submit" style={{ gridColumn: "span 2" }}>
          Save Xero credentials &amp; scopes to PostgreSQL
        </button>
      </form>
      {configMessage && <p className="xero-status" role="status">{configMessage}</p>}
      {message && (
        <p className={`xero-status ${status === "connected" ? "success" : "error"}`} role="status">
          {message}
          {organisation ? ` Organisation: ${organisation}.` : ""}
        </p>
      )}
      {syncMessage && <p className="xero-status" role="status">{syncMessage}</p>}

      <details style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border, #2d3748)", paddingTop: "1rem" }}>
        <summary style={{ cursor: "pointer", color: "var(--accent, #3b82f6)", fontWeight: 600 }}>
          Direct Token Connect (Xero API Explorer / Postman Bearer Token)
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted, #a0aec0)", margin: "0.5rem 0 1rem" }}>
          If you already generated an Access Token &amp; Tenant ID from the Xero OAuth 2.0 API Explorer, enter them here to immediately fetch accounts from <code>https://api.xero.com/api.xro/2.0/Accounts</code>.
        </p>
        <form className="xero-form" action={connectWithToken}>
          <label>
            Xero Tenant ID (UUID)
            <input name="tenantId" placeholder="e.g. 54e24efd-c453-488f-99cd-0731229fb08b" required />
          </label>
          <label>
            Bearer Access Token
            <input name="accessToken" type="password" placeholder="ey..." required />
          </label>
          <label>
            Organisation Name (Optional)
            <input name="tenantName" placeholder="My Xero Org" defaultValue="Xero Live Organisation" />
          </label>
          <button className="primary-button" type="submit">
            Connect &amp; Fetch Accounts
          </button>
        </form>
        {tokenMessage && <p className="xero-status" role="status">{tokenMessage}</p>}
      </details>

      <p className="route-note">
        <span className="info">i</span>
        Xero API endpoint: <code>https://api.xero.com/api.xro/2.0/Accounts</code>. Credentials are encrypted in PostgreSQL.
      </p>
    </section>
  );
}
