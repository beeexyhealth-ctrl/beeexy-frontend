import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { CircleManager } from "@/features/my-circle/circle-manager";

export const metadata: Metadata = { title: "My Circle" };

export default function MyCirclePage() {
  return <AppShell><div className="page circle-page"><Link className="back-link" href="/my-health"><Icon name="arrow-left" size={15} />My Health</Link><header className="page-header"><div><h1>My Circle</h1><p>Choose who you’re caring for</p></div></header><CircleManager /></div></AppShell>;
}
