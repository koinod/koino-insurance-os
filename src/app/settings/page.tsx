import { StubPage } from "@/components/StubPage";

export default function SettingsPage() {
  return (
    <StubPage
      title="Settings"
      subtitle="Account, integrations, AI configuration"
      description="One-stop config for owner-level decisions: team default carriers, AI tuning thresholds, notification routing, and integrations."
      todos={[
        "Profile: name, photo, default agent for unassigned leads",
        "Notifications: Telegram / email digest cadence",
        "AI tuning: HUNTER score threshold for hot-lead alerts (default 7)",
        "Integrations: Telnyx (calls), Aircall, Google Calendar, Slack",
        "Compliance: state-by-state TCPA hours, opt-out registry sync",
        "Billing: Stripe customer portal embed for managed-ops invoice",
      ]}
    />
  );
}
