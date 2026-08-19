import Link from "next/link";
import { notFound } from "next/navigation";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import { BookingForm } from "@/features/appointments/booking-form";
import { getDoctor, listDoctorSlots } from "@/server/services/doctors";

export default async function BookPage({ params, searchParams }: { params: Promise<{ doctorId: string }>; searchParams: Promise<{ dependentId?: string }> }) {
  const { doctorId } = await params;
  const { dependentId } = await searchParams;
  const [doctor, slots] = await Promise.all([getDoctor(doctorId), listDoctorSlots(doctorId)]);
  if (!doctor) notFound();
  return <FlowFrame className="booking-frame"><main className="flow-shell booking-shell"><header className="flow-header"><div className="flow-header-row"><Link href={`/doctors/${doctor.id}`} className="icon-button" aria-label="Back to doctor profile"><Icon name="arrow-left" size={18} /></Link><div><h1>Book appointment</h1><p>Secure scheduling</p></div></div></header>{slots.length ? <BookingForm doctor={doctor} slots={slots} dependentId={dependentId || null} /> : <div className="empty-state"><h2>No appointments available</h2><p>Check again later or choose another provider.</p><Link className="button secondary" href="/doctors">Browse doctors</Link></div>}</main></FlowFrame>;
}
