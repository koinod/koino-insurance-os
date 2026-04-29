import { StubPage } from "@/components/StubPage";

export default function PnLPage() {
  return (
    <StubPage
      title="P&L"
      subtitle="Profit & loss — revenue minus costs"
      description="Pulls deal commissions (revenue) minus lead-vendor costs minus chargebacks. Time-windowed by month/quarter/YTD."
      todos={[
        "Revenue line: sum(expected_commission) where status in (approved, issued)",
        "Cost lines: sum(lead_vendor.cost_per_lead × leads), agent splits, software costs",
        "Chargebacks: track lapsed-policy commission clawbacks",
        "Net margin chart over time",
        "Per-agent P&L breakdown (downline-aware)",
        "Export to CSV / Notion-shareable JSON",
      ]}
    />
  );
}
