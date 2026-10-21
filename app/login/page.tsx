"use client";

import { useState } from "react";
import { authService, ApiError } from "@/app/services/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const result =
        mode === "setup"
          ? await authService.setupAdmin(email, password)
          : await authService.login(email, password);

      if (result.ok) {
        setStatus({
          message: mode === "setup" ? "Administrator created! Redirecting to dashboard…" : "Authenticated. Redirecting…",
          isError: false,
        });
        // Use replace to prevent back button from returning to login form
        setTimeout(() => {
          window.location.replace("/");
        }, 400);
      } else {
        setStatus({
          message: result.error ?? "Invalid email or password.",
          isError: true,
        });
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Network error contacting server.";
      setStatus({ message, isError: true });
      setLoading(false);
    }
  }

  function fillAdminCredentials() {
    setEmail("admin@ledgerly.local");
    setPassword("AdminPassword123!");
    setStatus({
      message: "Credentials populated. Click 'Sign In' to proceed.",
      isError: false,
    });
  }

  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand-logo">x</div>
          <h1 className="login-title">ledgerly</h1>
          <p className="login-sub">
            {mode === "login"
              ? "Secure portal for live Xero accounting insights."
              : "Register the primary workspace administrator."}
          </p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setStatus(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-tab ${mode === "setup" ? "active" : ""}`}
            onClick={() => {
              setMode("setup");
              setStatus(null);
            }}
          >
            New Admin
          </button>
        </div>

        {status && (
          <div className={`login-alert ${status.isError ? "error" : "info"}`} style={{ marginBottom: "16px" }}>
            <span>{status.isError ? "✕" : "✓"}</span>
            <span>{status.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="login-email">Email address</label>
            <div className="login-input-wrap">
              <svg className="field-icon" width="18" height="18" style={{ width: "18px", height: "18px", minWidth: "18px", minHeight: "18px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="login-input"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-pwd">Password</label>
            <div className="login-input-wrap">
              <svg className="field-icon" width="18" height="18" style={{ width: "18px", height: "18px", minWidth: "18px", minHeight: "18px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="login-pwd"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="login-input"
                minLength={12}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="pwd-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? (
              <span>Authenticating…</span>
            ) : mode === "login" ? (
              <span>Sign in to Dashboard →</span>
            ) : (
              <span>Create Administrator Account →</span>
            )}
          </button>
        </form>

        <div className="demo-creds-card">
          <div className="demo-creds-header">
            <span>Administrator Credentials</span>
            <button type="button" className="demo-creds-fill-btn" onClick={fillAdminCredentials}>
              Auto-fill
            </button>
          </div>
          <div className="demo-creds-row">
            <span>Email:</span>
            <code>admin@ledgerly.local</code>
          </div>
          <div className="demo-creds-row">
            <span>Password:</span>
            <code>AdminPassword123!</code>
          </div>
        </div>

        <div className="login-security-footer">
          <svg className="icon" width="14" height="14" style={{ width: "14px", height: "14px", minWidth: "14px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>PostgreSQL Protected • AES-256 GCM Xero Tokens</span>
        </div>
      </div>
    </main>
  );
}
