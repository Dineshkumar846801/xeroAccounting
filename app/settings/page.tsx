import DataPage from "../components/data-page";
import XeroConnection from "../components/xero-connection";
import { Suspense } from "react";
import { requireAdmin } from "../lib/auth";

async function SettingsContent(){await requireAdmin();return <div className="content-inner"><div className="page-heading"><div><p className="eyebrow">WORKSPACE / PREFERENCES</p><h1>Settings</h1><p className="subheading">Manage your secure Xero integration.</p></div></div><Suspense fallback={<section className="panel xero-panel"/>}><XeroConnection/></Suspense><DataPage eyebrow="DATABASE" title="Workspace settings" description="PostgreSQL is used for encrypted credentials, OAuth scopes, and synchronized Xero records." columns={["Setting","Value","Status"]} rows={[["Database","PostgreSQL","Configured"],["Access","Administrator","Protected"],["OAuth Scopes","PostgreSQL (xero_credentials & xero_connections)","Active"]]} note="Xero credentials and OAuth scopes are stored in PostgreSQL and can be customized above."/></div>}
export default function SettingsPage(){return <Suspense fallback={<div className="content-inner">Loading secure settings…</div>}><SettingsContent/></Suspense>}
