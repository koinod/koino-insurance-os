"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  Users,
  TrendingUp,
  DollarSign,
  Trophy,
  CalendarClock,
  Activity,
  BarChart3,
  Network,
  UserPlus,
  Building2,
  Tag,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/deals", label: "Deals", icon: TrendingUp },
  { href: "/pnl", label: "P&L", icon: DollarSign },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/followups", label: "Follow-ups", icon: CalendarClock },
  { href: "/activities", label: "Activities", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/team", label: "Team", icon: Network },
  { href: "/recruiting", label: "Recruiting", icon: UserPlus },
  { href: "/carriers", label: "Carriers", icon: Building2 },
  { href: "/lead-vendors", label: "Lead Vendors", icon: Tag },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-bg-elev border-r border-line h-screen sticky top-0 overflow-y-auto">
      <div className="px-5 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-bg font-extrabold text-sm">K</span>
          </div>
          <div>
            <div className="font-bold text-ink leading-tight">KOINO</div>
            <div className="text-[11px] text-ink-mute uppercase tracking-wider leading-tight">
              Agency
            </div>
          </div>
        </Link>
      </div>

      <nav className="py-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-bg-hover text-accent border-l-2 border-accent"
                  : "text-ink-mute hover:bg-bg-hover hover:text-ink border-l-2 border-transparent"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 mt-auto border-t border-line text-[11px] text-ink-dim">
        v0.1.0 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}
