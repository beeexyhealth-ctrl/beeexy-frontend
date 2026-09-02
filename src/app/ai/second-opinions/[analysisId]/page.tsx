import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Second Opinion received",
};

export default function SecondOpinionHandoffPage() {
  return (
    <AppShell>
      <div className="page second-opinion-handoff-page">
        <section aria-labelledby="second-opinion-handoff-title">
          <span aria-hidden="true"><Icon name="check" size={24} /></span>
          <p className="eyebrow">Request received</p>
          <h1 id="second-opinion-handoff-title">Your Second Opinion request was accepted.</h1>
          <p>This is a secure handoff page. The structured result view will be available in the next product phase.</p>
          <div>
            <Link className="button primary" href="/home">Return home</Link>
            <Link className="text-button" href="/ai/second-opinion">Request another</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

