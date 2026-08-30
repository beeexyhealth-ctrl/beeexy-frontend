import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AuthProvider } from "@/features/auth/auth-provider";
import { AuthRouteBoundary } from "@/features/auth/auth-route-boundary";
import { PatientProvider } from "@/features/my-circle/patient-provider";
import { PreTriageProvider } from "@/features/pre-triage/pre-triage-provider";
import { PrivateAccessProvider } from "@/features/private-access/private-access-provider";
import { DemoGuestBoundary } from "@/features/private-access/demo-guest-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Beeexy — Your Health AI", template: "%s · Beeexy" },
  description: "Understand your symptoms, prepare for care, and keep your health journey in one place.",
  applicationName: "Beeexy",
  appleWebApp: { capable: true, title: "Beeexy", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4340E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ServiceWorkerRegister /><PrivateAccessProvider><AuthProvider><DemoGuestBoundary><PatientProvider><PreTriageProvider><AuthRouteBoundary>{children}</AuthRouteBoundary></PreTriageProvider></PatientProvider></DemoGuestBoundary></AuthProvider></PrivateAccessProvider></body></html>;
}
