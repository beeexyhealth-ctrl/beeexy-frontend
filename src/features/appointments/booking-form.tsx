"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import type { Doctor, DoctorSlot } from "@/types/domain";
import { bookAppointment } from "./actions";

const dayKey = (slot: DoctorSlot) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: slot.clinicTimeZone }).format(new Date(slot.startsAt));
const formatTime = (slot: DoctorSlot) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: slot.clinicTimeZone }).format(new Date(slot.startsAt));
const formatFull = (slot: DoctorSlot) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: slot.clinicTimeZone, timeZoneName: "short" }).format(new Date(slot.startsAt));

export function BookingForm({ doctor, slots, dependentId }: { doctor: Doctor; slots: DoctorSlot[]; dependentId: string | null }) {
  const days = useMemo(() => Array.from(new Map(slots.map((slot) => [dayKey(slot), slot])).entries()), [slots]);
  const [activeDay, setActiveDay] = useState(days[0]?.[0] || "");
  const [selected, setSelected] = useState<DoctorSlot | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const visibleSlots = slots.filter((slot) => dayKey(slot) === activeDay);

  function submit() {
    if (!selected) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await bookAppointment({ doctorId: doctor.id, slotId: selected.id, dependentId, reason: reason.trim() || null });
        if (result.mode === "local") {
          const appointments = JSON.parse(localStorage.getItem("beeexy_appointments") || "[]") as unknown[];
          appointments.unshift({ id: result.id, doctor, slot: selected, doctorId: doctor.id, doctorSlotId: selected.id, reason, status: "confirmed", modality: selected.modality, createdAt: new Date().toISOString() });
          localStorage.setItem("beeexy_appointments", JSON.stringify(appointments));
        }
        setConfirmation(result.id);
      } catch (reasonValue) {
        setError(reasonValue instanceof Error ? reasonValue.message : "Booking failed. Please try again.");
      }
    });
  }

  if (confirmation && selected) return <Confirmation doctor={doctor} slot={selected} />;

  return <><section className="booking-body"><div className="booking-doctor"><div className="doctor-avatar photo-avatar" role="img" aria-label={`Portrait of ${doctor.name}`} style={doctor.photoUrl ? { backgroundImage: `url(${doctor.photoUrl})` } : undefined}>{!doctor.photoUrl && doctor.initials}</div><div><h2>{doctor.name}, MD</h2><p>{doctor.specialty} · {doctor.subspecialty}</p><span><Icon name="star" size={10} />{doctor.rating} · {doctor.locationName}</span></div></div><div className="booking-section-heading"><div><h2>Choose a date and time</h2><p>Times shown in the clinic’s local timezone</p></div><Icon name="calendar" size={17} /></div><div className="date-picker" aria-label="Available dates">{days.map(([key, slot]) => { const date = new Date(slot.startsAt); return <button key={key} className={activeDay === key ? "selected" : ""} onClick={() => { setActiveDay(key); setSelected(null); }}><span>{new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: slot.clinicTimeZone }).format(date)}</span><strong>{new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: slot.clinicTimeZone }).format(date)}</strong><small>{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: slot.clinicTimeZone }).format(date)}</small></button>; })}</div><div className="booking-slot-grid">{visibleSlots.map((slot) => <button key={slot.id} className={selected?.id === slot.id ? "selected" : ""} onClick={() => setSelected(slot)}><strong>{formatTime(slot)}</strong><small>{slot.modality === "video" ? <><Icon name="video" size={10} />Video visit</> : <><Icon name="map-pin" size={10} />In person</>}</small>{selected?.id === slot.id && <span><Icon name="check" size={11} /></span>}</button>)}</div><label className="booking-reason" htmlFor="reason"><span><strong>Reason for visit</strong><small>Optional · Helps the doctor prepare</small></span><textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="What would you like to discuss?" /></label>{selected && <div className="selection-summary"><Icon name="check" size={14} /><span><strong>{formatFull(selected)}</strong><small>{selected.modality === "video" ? "Secure video visit" : doctor.address}</small></span></div>}{error && <p className="form-message" role="alert">{error}</p>}</section><footer className="flow-actions booking-actions"><Link className="button secondary" href={`/doctors/${doctor.id}`}>Back</Link><button className="button primary" disabled={!selected || pending} onClick={submit}>{pending ? "Reserving…" : <>Confirm booking <Icon name="chevron-right" size={14} /></>}</button></footer></>;
}

function Confirmation({ doctor, slot }: { doctor: Doctor; slot: DoctorSlot }) {
  return <section className="booking-confirmation"><div className="confirmation-mark"><Icon name="check" size={28} /></div><p className="eyebrow">Appointment confirmed</p><h1>You’re <em>all set.</em></h1><p className="confirmation-intro">Your visit is booked. We’ll keep the details ready in Appointments.</p><div className="confirmation-card"><div className="booking-doctor compact"><div className="doctor-avatar photo-avatar" role="img" aria-label={`Portrait of ${doctor.name}`} style={doctor.photoUrl ? { backgroundImage: `url(${doctor.photoUrl})` } : undefined}>{!doctor.photoUrl && doctor.initials}</div><div><h2>{doctor.name}, MD</h2><p>{doctor.specialty}</p></div></div><div className="confirmation-detail"><Icon name="calendar" size={16} /><span>{formatFull(slot)}</span></div><div className="confirmation-detail"><Icon name={slot.modality === "video" ? "video" : "map-pin"} size={16} /><span>{slot.modality === "video" ? "Secure video visit" : doctor.locationName}</span></div></div><div className="action-list"><button className="button secondary wide" onClick={() => downloadCalendar(doctor, slot)}><Icon name="download" size={15} />Add to calendar</button><Link className="button primary wide" href="/appointments">View appointments</Link><Link className="text-button" href="/">Done</Link></div><p className="result-disclaimer">Synthetic demo booking · No real provider was contacted</p></section>;
}

function downloadCalendar(doctor: Doctor, slot: DoctorSlot) {
  const start = new Date(slot.startsAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beeexy//Appointment//EN", "BEGIN:VEVENT", `UID:${crypto.randomUUID()}@beeexy.app`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:Appointment with ${doctor.name}`, `LOCATION:${slot.modality === "video" ? "Video visit" : doctor.address}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "beeexy-appointment.ics";
  link.click();
  URL.revokeObjectURL(url);
}
