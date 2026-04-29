import { StubPage } from "@/components/StubPage";

export default function FollowupsPage() {
  return (
    <StubPage
      title="Follow-ups"
      subtitle="Calendar-style scheduler — pending, overdue, completed"
      description="A per-agent follow-up calendar. Reads from the followups table; AI-drafted bumps land here automatically when the watchdog triggers."
      todos={[
        "Daily/Weekly toggle on the calendar grid",
        "Per-agent filter (defaults to current user)",
        "Quick complete/snooze/cancel actions inline",
        "AI-drafted follow-up indicator on each card",
        "Drag to reschedule (uses a server action to update due_at)",
        "Auto-create from deal stage transitions (DB trigger)",
      ]}
    />
  );
}
