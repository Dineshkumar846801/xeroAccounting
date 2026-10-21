import { connection } from "next/server";
import { Suspense } from "react";
import DataPage from "../components/data-page";
import SyncButton from "../components/sync-button";
import { getReportingData } from "../lib/reporting";
import { syncXeroAccounts } from "../lib/xero";
import { requireAdmin } from "../lib/auth";

async function Content() {
  await connection();
  await requireAdmin();

  let syncNote = "";

  // Attempt live fetch from https://api.xero.com/api.xro/2.0/Accounts
  try {
    const syncRes = await syncXeroAccounts();
    if (syncRes.accounts > 0) {
      syncNote = `✓ Fetched ${syncRes.accounts} live accounts from https://api.xero.com/api.xro/2.0/Accounts.`;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Sync error";
    if (errorMsg.includes("Connect a Xero organisation")) {
      syncNote = "Showing accounts from database. To stream live accounts directly from https://api.xero.com/api.xro/2.0/Accounts, click 'Connect Xero' in Settings.";
    } else if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
      syncNote = "Showing accounts from database. (Xero token expired or unauthorized — reconnect Xero in Settings to fetch live).";
    } else {
      syncNote = `Showing accounts from database. (Xero API status: ${errorMsg})`;
    }
  }

  const data = await getReportingData();

  return (
    <DataPage
      eyebrow="XERO API / https://api.xero.com/api.xro/2.0/Accounts"
      title="Chart of accounts"
      description="Accounts retrieved from Xero Accounting API (https://api.xero.com/api.xro/2.0/Accounts) and synchronized into PostgreSQL."
      columns={["Code", "Account name", "Type", "Class", "Tax type", "Status"]}
      state={data.state}
      headerAction={<SyncButton type="accounts" label="Fetch from Xero (https://api.xero.com/api.xro/2.0/Accounts)" />}
      note={syncNote}
      rows={data.accounts.map((a) => [
        a.code ?? "—",
        a.name,
        a.type ?? "—",
        a.class ?? (a.type?.includes("BANK") || a.type?.includes("ASSET") ? "ASSET" : a.type?.includes("EXPENSE") ? "EXPENSE" : a.type?.includes("REVENUE") ? "REVENUE" : "LIABILITY"),
        a.tax_type ?? "OUTPUT2",
        a.status ?? "ACTIVE",
      ])}
    />
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="content-inner">Fetching accounts from Xero API (https://api.xero.com/api.xro/2.0/Accounts)…</div>}>
      <Content />
    </Suspense>
  );
}
