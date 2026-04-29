import { StubPage } from "@/components/StubPage";

export default function ActivitiesPage() {
  return (
    <StubPage
      title="Activities"
      subtitle="Every call, note, stage change, and AI run — chronological"
      description="A unified timeline pulling from the activities table. Filterable by agent, client, deal, kind, date range."
      todos={[
        "Reverse-chronological list with infinite scroll",
        "Sidebar filters: agent, client, kind (call/sms/email/note/ai_*)",
        "Per-row drilldown to client/deal page",
        "Export-CSV button for compliance audits",
        "AI-runs section gets dedicated tab (separate from human activities)",
      ]}
    />
  );
}
