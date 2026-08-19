"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import type { Dependent } from "@/types/domain";
import { createDependent, removeDependent } from "./actions";

type DependentDraft = Omit<Dependent, "id" | "ownerUserId">;
const blank: DependentDraft = { firstName: "", lastName: "", relationship: "", birthDate: "", sexAtBirth: "prefer_not_to_say", state: "" };

export function CircleManager({ initialMembers, localMode }: { initialMembers: Dependent[]; localMode: boolean }) {
  const [members, setMembers] = useState(initialMembers);
  const [form, setForm] = useState<DependentDraft>(blank);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!localMode) return;
    const frame = requestAnimationFrame(() => setMembers(JSON.parse(localStorage.getItem("beeexy_dependents") || "[]") as Dependent[]));
    return () => cancelAnimationFrame(frame);
  }, [localMode]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createDependent(form);
        const member: Dependent = { id: result.id, ownerUserId: "local", ...form };
        const next = [...members, member];
        setMembers(next);
        if (localMode) localStorage.setItem("beeexy_dependents", JSON.stringify(next));
        setForm(blank);
        setShowForm(false);
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "Could not add this person.");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Remove this person and their Beeexy records?")) return;
    startTransition(async () => {
      await removeDependent(id);
      const next = members.filter((member) => member.id !== id);
      setMembers(next);
      if (localMode) localStorage.setItem("beeexy_dependents", JSON.stringify(next));
    });
  }

  if (showForm) return <form className="circle-form" onSubmit={submit}><div className="circle-form-heading"><span><Icon name="users" size={19} /></span><div><h2>Add to My Circle</h2><p>Keep each person’s care activity separate.</p></div></div><div className="circle-form-grid"><label>Relationship<select required value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })}><option value="">Choose relationship</option><option>Child</option><option>Parent</option><option>Partner</option><option>Other</option></select></label><label>First name<input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label><label>Last name<input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label><label>Date of birth<input required type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label><label>Sex assigned at birth<select value={form.sexAtBirth} onChange={(event) => setForm({ ...form, sexAtBirth: event.target.value as Dependent["sexAtBirth"] })}><option value="prefer_not_to_say">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></label><label>State<input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="e.g. New York" /></label></div>{message && <p className="form-message" role="alert">{message}</p>}<div className="circle-form-actions"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={pending}>{pending ? "Saving…" : "Add to My Circle"}</button></div><p className="result-disclaimer">Only add someone when you are authorized to manage their care information.</p></form>;

  return <>{!members.length ? <div className="circle-empty"><span><Icon name="users" size={24} /></span><h2>Your family’s health, one place</h2><p>Add people you care for and keep their assessments and appointments separate from yours.</p></div> : <div className="circle-members">{members.map((member) => <article key={member.id}><div className="circle-member-head"><span>{member.firstName.charAt(0)}{member.lastName.charAt(0)}</span><div><h2>{member.firstName} {member.lastName}</h2><p>{member.relationship} · Born {new Date(`${member.birthDate}T00:00:00`).toLocaleDateString()}</p></div><button aria-label={`Remove ${member.firstName}`} disabled={pending} onClick={() => remove(member.id)}><Icon name="more" size={16} /></button></div><div className="circle-member-actions"><Link href={`/pre-triage/new?dependentId=${member.id}`}><span><Icon name="activity" size={15} /></span><strong>Pre‑Triage</strong></Link><Link href={`/appointments?dependentId=${member.id}`}><span><Icon name="calendar" size={15} /></span><strong>Appointments</strong></Link><Link href="/history"><span><Icon name="history" size={15} /></span><strong>History</strong></Link></div></article>)}</div>}<button className="button primary wide circle-add" onClick={() => setShowForm(true)}><Icon name="plus" size={15} />Add someone</button></>;
}
