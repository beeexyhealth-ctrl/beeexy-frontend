import type { Metadata } from "next";
import { LoginFlow } from "@/features/entry/login-flow";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your Beeexy account.",
};

export default function LoginPage() {
  return <LoginFlow />;
}
