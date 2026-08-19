"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import { COMMON_CONDITIONS, DEMO_CONSENSUS, DEMO_QUESTIONS, OPINION_TYPES, type OpinionTypeKey } from "./fixtures";

type View = "welcome" | "type" | "details" | "context" | "loading" | "result";

export function SecondOpinionFlow({ fromPreTriage = false }: { fromPreTriage?: boolean }) {
  const [view, setView] = useState<View>(fromPreTriage ? "type" : "welcome");
  const [type, setType] = useState<OpinionTypeKey | null>(fromPreTriage ? "pretriage" : null);
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (view !== "loading") return;
    const timer = window.setTimeout(() => setView("result"), 1_500);
    return () => window.clearTimeout(timer);
  }, [view]);

  const progress = view === "type" ? 1 : view === "details" ? 2 : view === "context" ? 3 : 0;

  function goBack() {
    if (view === "welcome" || view === "type") return window.history.back();
    if (view === "details") return setView("type");
    if (view === "context") return setView("details");
    if (view === "result") return setView("type");
  }

  function selectType(nextType: OpinionTypeKey) {
    setType(nextType);
    if (nextType === "pretriage") setView("loading");
    else window.setTimeout(() => setView("details"), 160);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name || "");
  }

  function share() {
    const text = "Beeexy AI Second Opinion · Educational demo report";
    if (navigator.share) void navigator.share({ title: "Beeexy Second Opinion", text }).catch(() => undefined);
    else void navigator.clipboard?.writeText(text);
  }

  return <FlowFrame className="second-opinion-frame"><main className="flow-shell opinion-shell"><header className="flow-header"><div className="flow-header-row"><button className="icon-button" onClick={goBack} aria-label="Go back"><Icon name="arrow-left" size={18} /></button><div><h1>AI Second Opinion</h1><p>{view === "result" ? "Analysis complete" : "Beeexy AI · Ready"}</p></div></div>{progress > 0 && <div className="opinion-progress"><span style={{ width: `${(progress / 3) * 100}%` }} /><small>Step {progress} of 3</small></div>}</header>
    {view === "welcome" && <section className="opinion-welcome"><div className="opinion-orbit"><span><Icon name="sparkles" size={25} /></span><i /><i /><i /></div><p className="eyebrow">Independent perspective</p><h1>A second perspective can bring <em>clarity.</em></h1><p>Review an assessment, diagnosis, treatment or test result with a structured educational analysis.</p><div className="three-brains"><span>Claude</span><span>GPT‑4</span><span>Gemini</span></div><div className="opinion-trust"><Icon name="shield" size={15} /><span><strong>Private by design</strong><small>Your text and files are not stored by this demo.</small></span></div><button className="button primary wide" onClick={() => setView("type")}>Start second opinion <Icon name="chevron-right" size={15} /></button><small className="standalone-disclaimer">Educational guidance only · Not a medical diagnosis</small></section>}
    {view === "type" && <section className="flow-body opinion-step"><p className="eyebrow">Choose what to review</p><h2>What would you like a <em>second perspective</em> on?</h2><p>Select the option that best matches your situation.</p><div className="opinion-type-list">{OPINION_TYPES.map((item) => <button key={item.key} className={`${item.featured ? "featured" : ""}${type === item.key ? " selected" : ""}`} onClick={() => selectType(item.key)}><span><Icon name={item.icon} size={18} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span>{item.featured && <b>Recommended</b>}<Icon name="chevron-right" size={15} /></button>)}</div></section>}
    {view === "details" && <section className="flow-body opinion-step"><p className="eyebrow">Your information</p><h2>Share the <em>essential details.</em></h2><p>Include what you were told and the questions or concerns you still have.</p><label className="opinion-textarea"><span>Describe the situation</span><textarea autoFocus value={description} maxLength={1400} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the diagnosis, treatment or results and what you want to understand…" /><small>{description.length} / 1400</small></label><label className={`upload-card ${fileName ? "has-file" : ""}`}><input type="file" accept="image/*,.pdf" onChange={onFile} /><span><Icon name={fileName ? "check" : "document"} size={20} /></span><span><strong>{fileName || "Add a report or photo"}</strong><small>{fileName ? "Ready for this demo session" : "Optional · PDF, JPG or PNG"}</small></span></label><div className="privacy-note"><Icon name="shield" size={14} />Files remain in memory for this screen and are not cached.</div><button className="button primary wide" disabled={description.trim().length < 10 && !fileName} onClick={() => setView("context")}>Continue <Icon name="chevron-right" size={14} /></button></section>}
    {view === "context" && <section className="flow-body opinion-step"><p className="eyebrow">Final context</p><h2>Anything else the review should <em>consider?</em></h2><p>Select any relevant conditions. This demo does not retain your selections.</p><div className="condition-chips">{COMMON_CONDITIONS.map((condition) => <button key={condition} className={conditions.includes(condition) ? "selected" : ""} onClick={() => setConditions((items) => items.includes(condition) ? items.filter((item) => item !== condition) : [...items, condition])}>{conditions.includes(condition) && <Icon name="check" size={12} />}{condition}</button>)}</div><div className="opinion-review-card"><span><Icon name="document" size={17} /></span><div><strong>Ready for educational review</strong><p>{description ? "Description added" : "Uploaded report added"} · {conditions.length ? `${conditions.length} condition${conditions.length === 1 ? "" : "s"} selected` : "No conditions selected"}</p></div></div><button className="button primary wide" onClick={() => setView("loading")}>Analyze with 3 AI perspectives <Icon name="sparkles" size={14} /></button></section>}
    {view === "loading" && <section className="opinion-loading"><div className="brain-loader"><Icon name="brain" size={27} /><span /><span /><span /></div><h2>Reviewing your information…</h2><p>Three independent demo perspectives are being compared for agreement and differences.</p><div className="analysis-status"><span className="done"><Icon name="check" size={11} />Organizing the case</span><span><i />Comparing perspectives</span><span>Preparing questions</span></div></section>}
    {view === "result" && <section className="opinion-result"><div className="result-hero-card"><p><Icon name="sparkles" size={11} />Beeexy AI · Second Opinion</p><h1>{OPINION_TYPES.find((item) => item.key === type)?.label || "Educational review"}</h1><span>Compared across 3 independent demo perspectives</span></div><section className="result-card"><div className="result-card-title"><span><Icon name="info" size={14} /></span><h2>Summary</h2></div><p>The information you shared would benefit from review alongside your complete clinical history. The strongest next step is to clarify the underlying evidence, alternatives considered, and what changes would affect timing.</p></section><section className="result-card ai-brains-card"><div className="result-card-title"><span><Icon name="brain" size={14} /></span><h2>Where the perspectives agree</h2></div><div className="brain-labels"><span>Claude</span><span>GPT‑4</span><span>Gemini</span></div><ul>{DEMO_CONSENSUS.map((item) => <li key={item}><Icon name="check" size={13} />{item}</li>)}</ul></section><section className="result-card"><div className="result-card-title"><span><Icon name="document" size={14} /></span><h2>Questions for your doctor</h2></div><ol className="doctor-questions">{DEMO_QUESTIONS.map((item) => <li key={item}>{item}</li>)}</ol></section><div className="result-action-row"><Link className="button primary wide" href="/doctors?match=1"><Icon name="search" size={14} />Find a doctor</Link><button className="button secondary" disabled={saved} onClick={() => setSaved(true)}>{saved ? <><Icon name="check" size={14} />Saved</> : <><Icon name="bookmark" size={14} />Save report</>}</button><button className="button secondary" onClick={share}><Icon name="share" size={14} />Share</button></div><p className="result-disclaimer">This is a static educational demo, not a medical diagnosis or live AI analysis. Discuss health concerns with a licensed clinician.</p></section>}
  </main></FlowFrame>;
}
