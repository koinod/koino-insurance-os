"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitBranch, Users, FileSpreadsheet, TrendingUp, Trophy, Lock,
  Bell, Activity, BarChart3, UsersRound, UserPlus, Building2,
  Database, Settings, Flame
} from "lucide-react";

const NAV = [
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/deals", label: "Deals", icon: FileSpreadsheet },
  { href: "/pl", label: "P&L", icon: TrendingUp },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/vault", label: "Vault", icon: Lock },
  { href: "/follow-ups", label: "Follow-ups", icon: Bell },
  { href: "/activities", label: "Activities", icon: Activity },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/recruiting", label: "Recruiting", icon: UserPlus },
  { href: "/carriers", label: "Carriers", icon: Building2 },
  { href: "/leads", label: "Lead Vendors", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 bg-bg-panel border-r border-bg-border flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-bg-border flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center">
          <Flame className="w-4 h-4 text-bg-base" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight">KOINO</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">Insurance OS</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (pathname?.startsWith(href + "/") ?? false);
          return (
            <Link
              key={href}
              href={href}
              className={
                "flex items-center gap-3 px-3 py-2 rounded-md mb-0.5 text-sm transition-colors " +
                (active
                  ? "bg-brand-blue/15 text-brand-blueLight font-medium"
                  : "text-ink-secondary hover:bg-bg-hover hover:text-ink-primary")
              }
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User badge */}
      <div className="px-3 py-3 border-t border-bg-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-bg-card">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-blue to-brand-blueHover flex items-center justify-center text-white text-sm font-bold">
            IM
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-primary truncate">Ian Meeks</div>
            <div className="text-[10px] uppercase tracking-wider text-gold font-semibold">Owner</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
