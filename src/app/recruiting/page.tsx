import { StubPage } from "@/components/StubPage";

export default function RecruitingPage() {
  return (
    <StubPage
      title="Recruiting"
      subtitle="Recruit pipeline — interest, interview, contracted, ramping"
      description="Mirrors the client pipeline pattern but for prospective agents. Tracks recruit-source, interview stage, ramp progress."
      todos={[
        "Kanban with stages: Lead → Interviewing → Contracted → Ramping → Producer",
        "Recruit-source tracking (referral, FB ad, podcast, etc.)",
        "AI-drafted recruit-outreach via /api/ai/generate-followup with vertical='recruiting'",
        "Auto-promote a Recruit to active Agent when first deal is submitted",
        "Recruiting metrics dashboard — time-to-first-deal, ramp curve",
      ]}
    />
  );
}
