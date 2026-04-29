export function formatCurrency(n: number | null | undefined, opts: { decimals?: number; abbreviate?: boolean } = {}): string {
  const { decimals = 0, abbreviate = false } = opts;
  if (n == null) return "$0";
  if (abbreviate) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime() - Date.now();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (Math.abs(days) < 1) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

export function stageColor(stage: string): string {
  const map: Record<string, string> = {
    new: "stage-new",
    underwriting: "stage-underwriting",
    approved: "stage-approved",
    policy_delivered: "stage-delivered",
    lapsed: "stage-lapsed",
  };
  return map[stage] ?? "stage-new";
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    new: "New",
    underwriting: "Underwriting",
    approved: "Approved",
    policy_delivered: "Policy Delivered",
    lapsed: "Lapsed",
  };
  return map[stage] ?? stage;
}

// ── Cent-based + initials helpers (used by /leads and mock-data) ──
export function fmtMoney(cents: number | null | undefined, opts: { showCents?: boolean } = {}): string {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  if (opts.showCents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dollars);
  }
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(dollars);
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return new Intl.NumberFormat('en-US').format(n);
}

export function initials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
