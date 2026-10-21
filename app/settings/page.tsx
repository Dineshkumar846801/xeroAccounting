import DataPage from "../components/data-page";

export default function SettingsPage() {
  return (
    <DataPage
      eyebrow="WORKSPACE / PREFERENCES"
      title="Settings"
      description="Workspace preferences and database connection setup."
      columns={["Setting", "Value", "Status"]}
      rows={[["Database", "PostgreSQL", "Not connected"], ["Workspace", "Acme Studio", "Active"]]}
      note="Database credentials and connection configuration can be added when backend setup begins."
    />
  );
}
