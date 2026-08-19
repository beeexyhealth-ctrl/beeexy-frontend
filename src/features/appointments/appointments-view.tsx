"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import type { Appointment } from "@/types/domain";
import { cancelAppointment } from "./actions";

export function AppointmentsView({ initialAppointments, localMode }: { initialAppointments: Appointment[]; localMode: boolean }) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!localMode) return;
    const frame = requestAnimationFrame(() => setAppointments(JSON.parse(localStorage.getItem("beeexy_appointments") || "[]") as Appointment[]));
    return () => cancelAnimationFrame(frame);
  }, [localMode]);

  const grouped = useMemo(() => appointments.filter((appointment) => {
    const upcoming = appointment.status === "confirmed";
    return tab === "upcoming" ? upcoming : !upcoming;
  }), [appointments, tab]);

  function cancel(id: string) {
    if (!window.confirm("Cancel this appointment?")) return;
    startTransition(async () => {
      await cancelAppointment(id);
      const next = appointments.map((item) => item.id === id ? { ...item, status: "cancelled" as const } : item);
      setAppointments(next);
      if (localMode) localStorage.setItem("beeexy_appointments", JSON.stringify(next));
    });
  }

  return <><div className="collection-tabs" role="tablist"><button role="tab" aria-selected={tab === "upcoming"} className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Upcoming</button><button role="tab" aria-selected={tab === "past"} className={tab === "past" ? "active" : ""} onClick={() => setTab("past")}>Past</button></div>{grouped.length ? <div className="appointment-list polished-list">{grouped.map((appointment, index) => <AppointmentCard appointment={appointment} cancel={cancel} index={index} pending={pending} key={appointment.id} />)}</div> : <div className="collection-empty"><span><Icon name="calendar" size={23} /></span><h2>{tab === "upcoming" ? "No upcoming visits" : "No past visits yet"}</h2><p>{tab === "upcoming" ? "When you book a doctor, the visit and everything you need will appear here." : "Completed and cancelled appointments will appear here."}</p>{tab === "upcoming" && <Link className="button primary" href="/doctors">Find a doctor</Link>}</div>}</>;
}

function AppointmentCard({ appointment, cancel, index, pending }: { appointment: Appointment; cancel: (id: string) => void; index: number; pending: boolean }) {
  const doctor = appointment.doctor;
  const startsAt = appointment.slot?.startsAt ? new Date(appointment.slot.startsAt) : null;
  const when = startsAt ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(startsAt) : "Time unavailable";
  return <article className="appointment-card polished-card"><div className="appointment-card-top"><span className={`status-pill ${appointment.status}`}>{appointment.status}</span><button aria-label="More appointment options"><Icon name="more" size={17} /></button></div><div className="appointment-doctor"><div className="doctor-avatar photo-avatar" role="img" aria-label={doctor ? `Portrait of ${doctor.name}` : "Doctor portrait"} style={doctor?.photoUrl ? { backgroundImage: `url(${doctor.photoUrl})` } : undefined}>{!doctor?.photoUrl && (doctor?.initials || "B")}</div><div><h2>{doctor?.name || "Beeexy demo doctor"}</h2><p>{doctor?.specialty || "Specialist"}</p></div></div><div className="appointment-details"><div><Icon name="calendar" size={14} /><span>{when}</span></div><div><Icon name={appointment.modality === "video" ? "video" : "map-pin"} size={14} /><span>{appointment.modality === "video" ? "Secure video visit" : doctor?.locationName || "Clinic"}</span></div></div>{appointment.reason && <div className="appointment-reason"><small>Reason for visit</small><p>{appointment.reason}</p></div>}<details className="appointment-prep" open={index === 0 && appointment.status === "confirmed"}><summary><span><Icon name="sparkles" size={14} />Prepare for your visit</span><Icon name="chevron-down" size={14} /></summary><ul><li>Bring your ID and insurance information.</li><li>Write down your top questions and symptom changes.</li><li>Confirm any instructions directly with the provider.</li></ul></details><div className="doctor-actions"><button className="button secondary" onClick={() => shareAppointment(appointment)}><Icon name="share" size={13} />Share</button>{appointment.status === "confirmed" && <button className="button danger" disabled={pending} onClick={() => cancel(appointment.id)}>Cancel</button>}</div></article>;
}

function shareAppointment(appointment: Appointment) {
  const text = `Beeexy appointment with ${appointment.doctor?.name || "your doctor"} on ${appointment.slot ? new Date(appointment.slot.startsAt).toLocaleString() : "the scheduled time"}.`;
  if (navigator.share) void navigator.share({ title: "Beeexy appointment", text }).catch(() => undefined);
  else void navigator.clipboard?.writeText(text);
}
