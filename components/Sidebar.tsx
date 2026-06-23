"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Settings,
  CandlestickChart,
  Bot,
  History,
} from "lucide-react";
import MeridianLogo from "./MeridianLogo";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/charts", label: "Charts", icon: CandlestickChart },
  { href: "/trades", label: "Trades", icon: TrendingUp },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
  { href: "/backtest", label: "Backtest", icon: History },
  { href: "/strategy", label: "Strategy", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside
      className="flex flex-col w-[220px] min-h-screen shrink-0"
      style={{
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-7 pb-1">
        <div className="flex items-center gap-2.5">
          <MeridianLogo size={32} />
          <span
            className="text-[15px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Meridian
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="px-5 py-4">
        <div
          className="flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--accent)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full live-dot"
            style={{ background: "var(--accent)" }}
          />
          Paper
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-px text-[13px] transition-colors"
              style={{
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--accent-dim)" : "transparent",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
              }}
            >
              <Icon
                size={15}
                strokeWidth={active ? 2.2 : 1.8}
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-data)" }}
        >
          v2.0.0
        </div>
      </div>
    </aside>
  );
}
