"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { xeroService, ApiError } from "@/app/services/api";

interface SyncButtonProps {
  type?: "accounts" | "invoices" | "all";
  label?: string;
}

export default function SyncButton({ type = "accounts", label = "Sync from Xero" }: SyncButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus({ message: "Fetching live accounts from Xero...", isError: false });

    try {
      const data = await xeroService.sync(type);

      if (!data.ok) {
        const errorMsg = data.error || "Failed to fetch from Xero";
        setStatus({
          message: errorMsg.includes("administrator")
            ? "Please sign in to fetch from Xero (go to /login)."
            : errorMsg.includes("Connect a Xero organisation")
            ? "Xero not connected yet. Click 'Connect Xero' in Settings."
            : errorMsg,
          isError: true,
        });
      } else {
        const count = data.accounts ?? data.invoices ?? 0;
        setStatus({
          message: `Successfully synchronized ${count} ${type === "accounts" ? "accounts" : "records"} from Xero!`,
          isError: false,
        });
        router.refresh();
      }
    } catch (err) {
      const errorMsg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Network error contacting server";
      setStatus({
        message: errorMsg.includes("administrator")
          ? "Please sign in to fetch from Xero (go to /login)."
          : errorMsg.includes("Connect a Xero organisation")
          ? "Xero not connected yet. Click 'Connect Xero' in Settings."
          : errorMsg,
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sync-wrapper" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="primary-button"
          onClick={handleSync}
          disabled={loading}
          style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "⟳ Fetching from Xero…" : `⟳ ${label}`}
        </button>
      </div>
      {status && (
        <span
          className={`xero-status ${status.isError ? "error" : "success"}`}
          style={{ fontSize: "0.85rem", margin: 0, padding: "0.35rem 0.75rem" }}
        >
          {status.message}
          {status.isError && status.message.includes("not connected") && (
            <a
              href={xeroService.getConnectUrl()}
              style={{ marginLeft: "0.5rem", color: "inherit", textDecoration: "underline", fontWeight: 600 }}
            >
              Connect now →
            </a>
          )}
        </span>
      )}
    </div>
  );
}
