import { connection } from "next/server";
import { Suspense } from "react";
import DataPage from "../components/data-page";
import { date, getReportingData, money } from "../lib/reporting";
async function Content(){await connection();const data=await getReportingData();const today=new Date().toISOString().slice(0,10);const invoices=data.invoices.filter(i=>Number(i.amount_due)>0).map(i=>[i.invoice_number??"—",i.contact_name,date(i.due_date),i.due_date&&i.due_date<today?"Overdue":i.status,money(i.total),money(i.amount_due)]);return <DataPage eyebrow="SALES / COLLECTIONS" title="Receivables" description="Unpaid sales invoices from Xero, calculated as invoice amount due." columns={["Invoice","Contact","Due date","Status","Invoice total","Amount due"]} state={data.state} rows={invoices} note="Amount due is supplied by Xero after payments and credit notes; overdue means an unpaid invoice with a due date before today."/>}
export default function ReceivablesPage(){return <Suspense fallback={<div className="content-inner">Loading receivables…</div>}><Content/></Suspense>}
