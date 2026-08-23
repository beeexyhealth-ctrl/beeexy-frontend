import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AuthProvider } from "@/features/auth/auth-provider";
import { AuthRouteBoundary } from "@/features/auth/auth-route-boundary";
import { PatientProvider } from "@/features/my-circle/patient-provider";
import { PreTriageProvider } from "@/features/pre-triage/pre-triage-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Beeexy — Your Health AI", template: "%s · Beeexy" },
  description: "Understand your symptoms, prepare for care, and keep your health journey in one place.",
  applicationName: "Beeexy",
  appleWebApp: { capable: true, title: "Beeexy", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4340E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ServiceWorkerRegister /><AuthProvider><PatientProvider><PreTriageProvider><AuthRouteBoundary>{children}</AuthRouteBoundary></PreTriageProvider></PatientProvider></AuthProvider></body></html>;
}
