import type { ReactNode } from "react";

export function FlowFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`app-frame flow-frame ${className}`.trim()}><div className="app-screen">{children}</div></div>;
}
