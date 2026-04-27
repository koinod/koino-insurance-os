import PageHeader from "./PageHeader";
import { Construction } from "lucide-react";

export default function StubPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-8 py-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="bg-bg-card border border-dashed border-bg-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
        <Construction className="w-10 h-10 text-ink-dim mb-3" strokeWidth={1.5} />
        <div className="text-base font-medium text-ink-primary mb-1">Coming Soon</div>
        <p className="text-sm text-ink-secondary max-w-md">
          This module is part of the KOINO Insurance OS roadmap. The schema is defined; the UI is next.
        </p>
      </div>
    </div>
  );
}
