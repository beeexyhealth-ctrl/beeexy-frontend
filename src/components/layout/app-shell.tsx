import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <div className="app-screen">
        <main className="page-content" id="main-content">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
