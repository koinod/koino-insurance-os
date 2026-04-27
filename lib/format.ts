export function fmtMoney(cents: number, opts: { showCents?: boolean } = {}): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.showCents ? 2 : 0,
    maximumFractionDigits: opts.showCents ? 2 : 0,
  });
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
