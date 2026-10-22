"use client";

import { useState } from "react";
import { authService, ApiError } from "@/app/services/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
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
          message:
            mode === "setup"
              ? "Administrator account created! Redirecting to dashboard…"
              : "Authenticated successfully. Redirecting…",
          isError: false,
        });
        setTimeout(() => {
          window.location.replace("/");
        }, 350);
      } else {
        setStatus({
          message: result.error ?? "Invalid email/username or password.",
          isError: true,
        });
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Network error contacting authentication server.";
      setStatus({ message, isError: true });
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card-container">
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <h1 className="login-title">
              {mode === "login" ? "Admin Sign In" : "Admin Registration"}
            </h1>
            <p className="login-sub">
              {mode === "login"
                ? "Enter your email or username and password to access the platform."
                : "Create the primary administrator credentials to access the platform."}
            </p>
          </div>

          {/* Feedback alert */}
          {status && (
            <div className={`login-alert ${status.isError ? "error" : "success"}`}>
              <span className="login-alert-icon">{status.isError ? "✕" : "✓"}</span>
              <span>{status.message}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="login-email">Email or Username</label>
              <div className="login-input-wrap">
                <input
                  id="login-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ledgerly.local"
                  className="login-input"
                  required
                  autoComplete="username"
                />
                <span className="input-trailing-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <polyline points="3 7 12 13 21 7" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="login-field">
              <div className="login-field-top">
                <label htmlFor="login-pwd">Password</label>
                {mode === "login" && (
                  <button
                    type="button"
                    className="forgot-link"
                    onClick={() => {
                      setStatus({
                        message: "Use the primary administrator password or use Admin Registration.",
                        isError: false,
                      });
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="login-input-wrap">
                <input
                  id="login-pwd"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  minLength={mode === "setup" ? 12 : 1}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <div className="input-trailing-group">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="trailing-icon">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="login-options-row">
              <label className="remember-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-checkbox"
                />
                <span>Remember me</span>
              </label>
            </div>

            {/* Dark Pill Submit Button */}
            <button type="submit" disabled={loading} className="login-dark-btn">
              {loading ? (
                <span>Authenticating…</span>
              ) : mode === "login" ? (
                <span>Sign In →</span>
              ) : (
                <span>Create Admin Account →</span>
              )}
            </button>
          </form>

          {/* Mode switch helper link */}
          <div className="login-mode-switch">
            {mode === "login" ? (
              <button
                type="button"
                className="mode-switch-btn"
                onClick={() => {
                  setMode("setup");
                  setStatus(null);
                }}
              >
                Need to set up a new administrator? <strong>Register Admin</strong>
              </button>
            ) : (
              <button
                type="button"
                className="mode-switch-btn"
                onClick={() => {
                  setMode("login");
                  setStatus(null);
                }}
              >
                Already registered? <strong>Sign In</strong>
              </button>
            )}
          </div>
        </div>

        {/* Muted footer */}
        <p className="login-system-footer">
          Ledgerly ERP • Secure Accounting Platform
        </p>
      </div>
    </main>
  );
}
