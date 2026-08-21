"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

const items = [
  { label: "Home", href: "/home", icon: "home" },
  { label: "Appointments", href: "/appointments", icon: "calendar" },
  { label: "My Visit", href: "/my-visit", icon: "microphone", visit: true },
  { label: "History", href: "/history", icon: "history" },
  { label: "My Health", href: "/my-health", icon: "heart" },
] satisfies Array<{ label: string; href: string; icon: IconName; visit?: boolean }>;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link key={item.label} href={item.href} className={`nav-item${item.visit ? " visit" : ""}${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="nav-icon"><Icon name={item.icon} size={item.visit ? 19 : 20} /></span>
            <small>{item.label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
