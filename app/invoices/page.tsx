import { connection } from "next/server";
import { Suspense } from "react";
import DataPage from "../components/data-page";
import { date, getReportingData, money } from "../lib/reporting";
async function Content(){await connection();const data=await getReportingData();return <DataPage eyebrow="SALES / INVOICING" title="Invoices" description="Live sales invoices synchronized from Xero." columns={["Invoice","Contact","Invoice date","Due date","Status","Total","Amount due"]} state={data.state} rows={data.invoices.map(i=>[i.invoice_number??"—",i.contact_name,date(i.invoice_date),date(i.due_date),i.status,money(i.total),money(i.amount_due)])}/>}
export default function InvoicesPage(){return <Suspense fallback={<div className="content-inner">Loading invoices…</div>}><Content/></Suspense>}
