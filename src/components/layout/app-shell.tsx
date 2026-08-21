import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { PatientSwitcher } from "@/features/my-circle/patient-switcher";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <div className="app-screen">
        <PatientSwitcher />
        <main className="page-content" id="main-content">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
