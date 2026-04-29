import { StubPage } from "@/components/StubPage";

export default function TeamPage() {
  return (
    <StubPage
      title="Team"
      subtitle="Org chart with upline/downline tree"
      description="Tree view rendered from agents.upline_id self-reference. Click any agent to drill into their book + leaderboard position."
      todos={[
        "Recursive tree component (root = owner, branches = downlines)",
        "Stats per node (total AP, deals, win rate)",
        "+ Invite Agent button → magic-link signup flow",
        "Drag-to-reparent (with confirmation)",
        "Org chart export to PNG/PDF",
      ]}
    />
  );
}
