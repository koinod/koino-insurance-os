import { PageHeader } from "@/components/PageHeader";

interface StubPageProps {
  title: string;
  subtitle?: string;
  description?: string;
  todos?: string[];
}

export function StubPage({ title, subtitle, description, todos = [] }: StubPageProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card p-8 text-center max-w-2xl mx-auto">
        <div className="text-5xl mb-3">🚧</div>
        <h2 className="text-xl font-bold mb-2">In progress</h2>
        {description && <p className="text-ink-mute mb-6">{description}</p>}
        {todos.length > 0 && (
          <div className="text-left bg-bg-elev rounded-lg p-4 border border-line">
            <div className="text-xs uppercase tracking-wider text-ink-dim font-semibold mb-2">
              Build checklist
            </div>
            <ul className="space-y-1 text-sm">
              {todos.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-ink-dim mt-0.5">▢</span>
                  <span className="text-ink-mute">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

export default StubPage;
