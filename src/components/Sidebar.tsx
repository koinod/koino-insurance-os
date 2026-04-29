"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole, Role } from "@/lib/role-context";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Briefcase,
  Trophy,
  Network,
  UserPlus,
  Plug,
  Building2,
  Target,
  Settings,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/deals", label: "Deals", icon: Briefcase },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/team", label: "Team", icon: Network },
      { href: "/recruiting", label: "Recruiting", icon: UserPlus },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/carriers", label: "Carriers", icon: Building2 },
      { href: "/lead-vendors", label: "Lead Sources", icon: Target },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { role, setRole } = useRole();

  return (
    <aside className="w-60 shrink-0 bg-bg-elev border-r border-line h-screen sticky top-0 overflow-y-auto flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-bg font-extrabold text-sm">K</span>
          </div>
          <div>
            <div className="font-bold text-ink leading-tight">KOINO</div>
            <div className="text-[11px] text-ink-mute uppercase tracking-wider leading-tight">
              Agency OS
            </div>
          </div>
        </Link>
      </div>

      {/* Role toggle */}
      <div className="px-5 py-3 border-b border-line">
        <div className="text-[10px] uppercase tracking-wider text-ink-dim mb-2">View As</div>
        <div className="flex rounded-lg overflow-hidden border border-line">
          {(["owner", "manager", "rep"] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-1.5 text-xs font-semibold capitalize transition-colors ${
                role === r
                  ? "bg-accent text-bg"
                  : "bg-bg-card text-ink-mute hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Sectioned nav */}
      <nav className="py-3 flex-1 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-5 mb-1 text-[10px] uppercase tracking-widest text-ink-dim font-semibold">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-5 py-2 text-sm transition-colors ${
                    active
                      ? "bg-bg-hover text-accent border-l-2 border-accent"
                      : "text-ink-mute hover:bg-bg-hover hover:text-ink border-l-2 border-transparent"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-line text-[11px] text-ink-dim">
        v0.1.0 · {new Date().getFullYear()}
      </div>
    </aside>
  );
}
