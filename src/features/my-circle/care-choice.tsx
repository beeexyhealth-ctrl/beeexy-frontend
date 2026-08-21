"use client";

import { useRouter } from "next/navigation";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "./patient-provider";

export function CareChoice() {
  const router = useRouter();
  const { choosePrimary } = usePatients();

  return (
    <main className="profile-gate-shell">
      <div className="profile-gate-top"><BeeexyBrand compact /></div>
      <section className="profile-gate-card care-choice-card" aria-labelledby="care-choice-heading">
        <p className="entry-eyebrow">Your care context</p>
        <h1 id="care-choice-heading">Who are you caring for?</h1>
        <p>You can switch or add people later from My Circle.</p>
        <div className="care-choice-list">
          <button type="button" onClick={() => { choosePrimary(); router.replace("/home"); }}>
            <span><Icon name="user" size={21} /></span>
            <span><strong>Just me</strong><small>Use Beeexy for your own care</small></span>
            <Icon name="chevron-right" size={17} />
          </button>
          <button type="button" onClick={() => router.push("/my-health/circle/add?initial=1")}>
            <span><Icon name="users" size={21} /></span>
            <span><strong>Someone else</strong><small>Add a person to My Circle</small></span>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>
      </section>
    </main>
  );
}
