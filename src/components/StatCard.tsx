interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: number; // positive or negative percent change
  highlight?: boolean;
}

export function StatCard({ label, value, sub, trend, highlight }: StatCardProps) {
  return (
    <div
      className={`card p-5 ${highlight ? "border-accent/40 bg-accent/5" : ""}`}
    >
      <div className="text-xs text-ink-mute uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div
        className={`text-3xl font-extrabold tracking-tight mt-2 tabular-nums ${
          highlight ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </div>
      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          {trend !== undefined && (
            <span
              className={`font-semibold ${
                trend >= 0 ? "text-stage-approved" : "text-stage-lapsed"
              }`}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-ink-mute">{sub}</span>}
        </div>
      )}
    </div>
  );
}
