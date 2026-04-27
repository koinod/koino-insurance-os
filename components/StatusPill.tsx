import { DealStatus } from "@/lib/types";

const MAP: Record<DealStatus, { cls: string; label: string }> = {
  Approved:     { cls: "pill-green",  label: "Approved" },
  Issued:       { cls: "pill-green",  label: "Issued" },
  Underwriting: { cls: "pill-yellow", label: "Underwriting" },
  Pending:      { cls: "pill-yellow", label: "Pending" },
  Submitted:    { cls: "pill-blue",   label: "Submitted" },
  Declined:     { cls: "pill-red",    label: "Declined" },
  Lapsed:       { cls: "pill-red",    label: "Lapsed" },
  Chargeback:   { cls: "pill-red",    label: "Chargeback" },
  Draft:        { cls: "pill-gray",   label: "Draft" },
};

export default function StatusPill({ status }: { status: DealStatus }) {
  const m = MAP[status] ?? { cls: "pill-gray", label: status };
  return <span className={m.cls}>{m.label}</span>;
}
