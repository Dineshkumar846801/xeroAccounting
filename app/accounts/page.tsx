import { connection } from "next/server";
import { Suspense } from "react";
import DataPage from "../components/data-page";
import { getReportingData, money } from "../lib/reporting";
async function Content(){await connection();const data=await getReportingData();return <DataPage eyebrow="ACCOUNTING / DIRECTORY" title="Chart of accounts" description="Live chart of accounts synchronized from Xero." columns={["Code","Account name","Type","Status","Balance"]} state={data.state} rows={data.accounts.map(a=>[a.code??"—",a.name,a.type??"—",a.status??"—",money(a.balance)])}/>}
export default function AccountsPage(){return <Suspense fallback={<div className="content-inner">Loading accounts…</div>}><Content/></Suspense>}
