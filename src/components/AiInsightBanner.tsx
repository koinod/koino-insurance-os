'use client';

export interface AiInsight {
  type: 'warning' | 'opportunity' | 'info';
  headline: string;
  detail: string;
  action?: string;
}

interface AiInsightBannerProps {
  insights: AiInsight[];
}

const typeConfig = {
  warning: {
    border: 'border-l-amber-400',
    bg: 'bg-amber-400/5',
    icon: '⚠',
    iconColor: 'text-amber-400',
    badgeClass: 'bg-amber-400/10 text-amber-400',
    badgeText: 'Alert',
  },
  opportunity: {
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-400/5',
    icon: '◆',
    iconColor: 'text-emerald-400',
    badgeClass: 'bg-emerald-400/10 text-emerald-400',
    badgeText: 'Opportunity',
  },
  info: {
    border: 'border-l-blue-400',
    bg: 'bg-blue-400/5',
    icon: 'ℹ',
    iconColor: 'text-blue-400',
    badgeClass: 'bg-blue-400/10 text-blue-400',
    badgeText: 'Info',
  },
};

export function AiInsightBanner({ insights }: AiInsightBannerProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-6">
      {insights.map((insight, i) => {
        const cfg = typeConfig[insight.type];
        return (
          <div
            key={i}
            className={`flex items-start gap-4 rounded-lg border-l-4 px-4 py-3 ${cfg.border} ${cfg.bg}`}
            style={{ borderColor: undefined }}
          >
            <span className={`mt-0.5 text-base leading-none ${cfg.iconColor}`}>
              {cfg.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.badgeClass}`}>
                  {cfg.badgeText}
                </span>
                <span className="text-sm font-semibold text-ink">{insight.headline}</span>
              </div>
              <p className="text-xs text-ink-mute leading-relaxed">{insight.detail}</p>
            </div>
            {insight.action && (
              <button className="shrink-0 text-xs font-semibold text-accent hover:text-accent-dim transition-colors whitespace-nowrap">
                {insight.action} →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
