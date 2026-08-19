"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";

type VisitView = "setup" | "recording" | "processing" | "result";

export function MyVisitFlow() {
  const [view, setView] = useState<VisitView>("setup");
  const [context, setContext] = useState("Independent visit");
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [notes, setNotes] = useState("");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (view !== "recording" || paused) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [paused, view]);

  useEffect(() => {
    if (view !== "processing") return;
    const timer = window.setTimeout(() => setView("result"), 1_700);
    return () => window.clearTimeout(timer);
  }, [view]);

  const timerLabel = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  function goBack() {
    if (view === "setup") window.history.back();
    else if (view === "recording") setView("setup");
    else setView("setup");
  }

  return <FlowFrame className="my-visit-frame"><main className="flow-shell visit-shell"><header className="flow-header visit-header"><div className="flow-header-row"><button className="icon-button" aria-label="Go back" onClick={goBack}><Icon name="arrow-left" size={18} /></button><div><h1>My Visit</h1><p>{view === "recording" ? (paused ? "Paused · Demo preview" : "Recording · Demo preview") : view === "processing" ? "Preparing your summary" : "Record your doctor visit"}</p></div>{view === "recording" && <button className="visit-minimize" aria-label="Minimize recording"><Icon name="chevron-down" size={16} /></button>}</div></header>
    {view === "setup" && <section className="visit-setup"><div className="visit-intro-mark"><Icon name="microphone" size={28} /><i /></div><p className="eyebrow">Remember more, stress less</p><h1>Your visit, captured and <em>organized.</em></h1><p>Preview Francisco’s recording flow and see how a private visit summary would be structured.</p><div className="visit-privacy"><Icon name="shield" size={16} /><div><strong>Privacy-first demo</strong><p>This reconstruction does not access your microphone, upload audio, or persist medical content.</p></div></div><fieldset className="visit-context"><legend>What are you recording?</legend>{["Independent visit", "Upcoming appointment", "Follow-up conversation"].map((item) => <button key={item} className={context === item ? "selected" : ""} onClick={() => setContext(item)}><span><Icon name={item === "Upcoming appointment" ? "calendar" : item === "Follow-up conversation" ? "message" : "stethoscope"} size={17} /></span><strong>{item}</strong>{context === item ? <Icon name="check" size={15} /> : <Icon name="chevron-right" size={15} />}</button>)}</fieldset><button className="button primary wide" onClick={() => setView("recording")}><Icon name="microphone" size={16} />Preview recording flow</button><p className="visit-consent">Always ask everyone in the room for consent before recording a real visit.</p></section>}
    {view === "recording" && <section className="recording-view"><div className={`recording-status ${paused ? "paused" : ""}`}><span><i /></span>{paused ? "Recording paused" : "Demo recording in progress"}</div><div className={`recording-orb ${paused ? "paused" : ""}`}><span><Icon name={paused ? "microphone" : "activity"} size={34} /></span><i /><i /><i /></div><div className="recording-time">{timerLabel}</div><p>{paused ? "Resume when the conversation continues." : "Keep your phone nearby. In production, audio would be encrypted and processed securely."}</p><div className="audio-wave" aria-hidden="true">{Array.from({ length: 22 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 45}ms` }} />)}</div><div className="recording-actions"><button className="record-side-action" onClick={() => setPaused((value) => !value)}><span><Icon name={paused ? "activity" : "more"} size={17} /></span>{paused ? "Resume" : "Pause"}</button><button className="stop-recording" aria-label="Stop recording" onClick={() => setView("processing")}><span /></button><button className="record-side-action"><span><Icon name="bookmark" size={17} /></span>Mark moment</button></div><button className="recording-cancel" onClick={() => { setSeconds(0); setView("setup"); }}>Cancel demo</button></section>}
    {view === "processing" && <section className="visit-processing"><div className="processing-mark"><Icon name="sparkles" size={27} /></div><h2>Organizing your visit…</h2><p>Creating a structured demo summary with key points, medications and next steps.</p><div className="processing-list"><span className="done"><Icon name="check" size={12} />Preparing transcript structure</span><span className="active"><i />Identifying discussion themes</span><span>Organizing next steps</span><span>Preparing your notes</span></div><div className="privacy-note"><Icon name="shield" size={14} />No audio was captured or uploaded.</div></section>}
    {view === "result" && <section className="visit-result"><div className="visit-result-hero"><p><Icon name="check" size={11} />Visit summary ready</p><h1>Visit summary</h1><span>{context} · just now · {timerLabel}</span></div><section className="visit-audio-card"><button onClick={() => setPlaying((value) => !value)}><span><Icon name={playing ? "more" : "video"} size={16} /></span><span><strong>Demo audio preview</strong><small>No recording was captured</small></span><Icon name="chevron-down" size={15} /></button>{playing && <div className="visit-audio-expanded"><div className="fake-audio-progress"><span /></div><p><span>00:00</span><span>{timerLabel}</span></p></div>}</section><section className="visit-note-card"><label htmlFor="visit-title">Title</label><input id="visit-title" defaultValue="Visit summary" /><label htmlFor="visit-notes">Your notes</label><textarea id="visit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add questions, observations or anything you want to remember…" /><small>{notes ? "Saved for this session" : "Notes remain only in this screen"}</small></section><VisitSummarySection icon="message" title="What was discussed" text="This static demo shows where a concise, reviewable summary of the conversation would appear." /><VisitSummarySection icon="activity" title="Medications" text="No medications were captured in this demo." /><VisitSummarySection icon="check" title="Next steps" text="Confirm instructions with your clinician and add any follow-up dates to your calendar." /><div className="result-action-row visit-result-actions"><button className="button secondary"><Icon name="share" size={14} />Share</button><button className="button secondary"><Icon name="download" size={14} />Export</button><Link className="button primary wide" href="/history">Save to History</Link></div><p className="result-disclaimer">Static demo summary · Review clinical notes for accuracy before relying on them</p></section>}
  </main></FlowFrame>;
}

function VisitSummarySection({ icon, text, title }: { icon: "message" | "activity" | "check"; text: string; title: string }) {
  return <details className="visit-summary-section" open><summary><span><Icon name={icon} size={14} /></span><strong>{title}</strong><Icon name="chevron-down" size={14} /></summary><p>{text}</p></details>;
}
