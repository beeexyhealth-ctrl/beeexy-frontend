"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { SignOutButton } from "@/features/auth/sign-out-button";

export function SettingsPanel() {
  const [appointmentUpdates, setAppointmentUpdates] = useState(true);
  const [careReminders, setCareReminders] = useState(true);

  return <div className="page settings-page"><div className="settings-top"><Link className="icon-button" href="/my-health" aria-label="Back to My Health"><Icon name="arrow-left" size={18} /></Link><div><h1>Settings</h1><p>Preferences, privacy and account</p></div></div><div className="settings-group"><p>Preferences</p><label className="settings-row"><span><Icon name="message" size={16} /></span><span><strong>Language</strong><small>App language and region</small></span><select aria-label="Language"><option>English</option><option>Español</option></select></label><ToggleRow checked={appointmentUpdates} icon="bell" label="Appointment updates" sub="Confirmations, changes and reminders" setChecked={setAppointmentUpdates} /><ToggleRow checked={careReminders} icon="clock" label="Care reminders" sub="Follow-up and check-in nudges" setChecked={setCareReminders} /></div><div className="settings-group" id="privacy"><p>Privacy & account</p><SettingsLink icon="shield" title="Privacy & Security" subtitle="Data controls and active sessions" /><SettingsLink icon="user" title="Account settings" subtitle="Profile, email and sign-in" /><SettingsLink icon="download" title="Download your data" subtitle="Prepare a secure data export" /></div><div className="settings-group" id="help"><p>About</p><SettingsLink icon="info" title="Help & Support" subtitle="FAQs and contact options" /><SettingsLink icon="heart" title="About Beeexy" subtitle="Mission, team and version" /><SettingsLink icon="document" title="Privacy & Terms" subtitle="Policies and healthcare notices" /></div><div className="settings-signout"><SignOutButton /></div><p className="settings-version">Beeexy PWA · Version 1.0</p></div>;
}

function ToggleRow({ checked, icon, label, setChecked, sub }: { checked: boolean; icon: IconName; label: string; setChecked: (value: boolean) => void; sub: string }) {
  return <div className="settings-row"><span><Icon name={icon} size={16} /></span><span><strong>{label}</strong><small>{sub}</small></span><button className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => setChecked(!checked)}><i /></button></div>;
}

function SettingsLink({ icon, subtitle, title }: { icon: IconName; subtitle: string; title: string }) {
  return <button className="settings-row"><span><Icon name={icon} size={16} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><Icon name="chevron-right" size={15} /></button>;
}
