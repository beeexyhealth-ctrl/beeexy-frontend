"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import type { PreTriageAnswers, PreTriageSession } from "@/types/domain";
import { completeAssessment, saveAssessmentDraft } from "./actions";
import { DEMO_ASSESSMENT_RESULT } from "./demo-result";

const initialAnswers: Partial<PreTriageAnswers> = {
  watchedEducation: null,
  viewedTimeline: null,
  duration: null,
  painLevel: 5,
  otherSymptoms: null,
};

const durations = ["Today / Just now", "1–3 days ago", "1 week or more", "It’s chronic"];
const symptoms = ["Headache", "Stomach pain", "Chest pain", "Fever"];
const otherSymptoms = ["Nausea or vomiting", "Fever", "Dizziness or vision changes", "None of the above"];

export function PreTriageFlow({ initialSession, dependentId }: { initialSession?: PreTriageSession | null; dependentId?: string | null }) {
  const [assessmentId, setAssessmentId] = useState(initialSession?.id);
  const [step, setStep] = useState(initialSession?.currentStep || 0);
  const [answers, setAnswers] = useState<Partial<PreTriageAnswers>>(initialSession?.answers || initialAnswers);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initialSession) return;
      const saved = localStorage.getItem("beeexy_assessment_draft");
      if (!saved) return;
      try {
        const draft = JSON.parse(saved) as { id?: string; currentStep?: number; answers?: Partial<PreTriageAnswers> };
        setAssessmentId(draft.id);
        setStep(draft.currentStep || 0);
        setAnswers({ ...initialAnswers, ...draft.answers });
      } catch {
        localStorage.removeItem("beeexy_assessment_draft");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialSession]);

  function persist(nextStep: number, nextAnswers: Partial<PreTriageAnswers>, complete = false) {
    setError("");
    startTransition(async () => {
      try {
        const saved = await saveAssessmentDraft({ id: assessmentId, dependentId, currentStep: nextStep, answers: nextAnswers });
        setAssessmentId(saved.id);
        if (saved.mode === "local") localStorage.setItem("beeexy_assessment_draft", JSON.stringify({ id: saved.id, currentStep: nextStep, answers: nextAnswers }));
        if (complete) {
          const full = nextAnswers as PreTriageAnswers;
          await completeAssessment(saved.id, full);
          if (saved.mode === "local") {
            const history = JSON.parse(localStorage.getItem("beeexy_history") || "[]") as unknown[];
            history.unshift({ id: saved.id, status: "completed", answers: full, result: DEMO_ASSESSMENT_RESULT, createdAt: new Date().toISOString() });
            localStorage.setItem("beeexy_history", JSON.stringify(history));
            localStorage.removeItem("beeexy_assessment_draft");
          }
        }
        setAnswers(nextAnswers);
        setStep(nextStep);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
      }
    });
  }

  function choose(value: Partial<PreTriageAnswers>, nextStep = step + 1, complete = false) {
    const nextAnswers = { ...answers, ...value };
    setAnswers(nextAnswers);
    persist(nextStep, nextAnswers, complete);
  }

  if (step >= 7) return <AssessmentResultView />;

  if (step === 0) {
    return (
      <WelcomeScreen
        answers={answers}
        isPending={isPending}
        error={error}
        patch={(value) => setAnswers((current) => ({ ...current, ...value }))}
        continueFlow={() => persist(1, answers)}
      />
    );
  }

  return (
    <FlowFrame className="pretriage-frame">
      <main className="flow-shell pretriage-shell">
        <header className="flow-header">
          <div className="flow-header-row">
            <button className="icon-button" aria-label="Previous question" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={isPending}><Icon name="arrow-left" size={18} /></button>
            <div><h1>Symptom Check</h1><p>Beeexy AI · Listening</p></div>
          </div>
          <div className="progress" aria-label={`Step ${step} of 6`}><span style={{ width: `${Math.round((step / 6) * 100)}%` }} /></div>
        </header>
        <section className="pt-chat" aria-live="polite">
          <ConversationHistory answers={answers} step={step} />
          <CurrentQuestion answers={answers} step={step} choose={choose} setAnswers={setAnswers} persist={persist} isPending={isPending} />
          {isPending && <TypingIndicator />}
          {error && <p className="pt-error" role="alert">{error}</p>}
        </section>
      </main>
    </FlowFrame>
  );
}

function WelcomeScreen({ answers, continueFlow, error, isPending, patch }: {
  answers: Partial<PreTriageAnswers>;
  continueFlow: () => void;
  error: string;
  isPending: boolean;
  patch: (value: Partial<PreTriageAnswers>) => void;
}) {
  const [videoOpen, setVideoOpen] = useState(false);
  const ready = Boolean(answers.sexAtBirth && answers.ageRange);
  const ageOptions: Array<[PreTriageAnswers["ageRange"], string]> = [["0_17", "0–17"], ["18_29", "18–29"], ["30_49", "30–49"], ["50_64", "50–64"], ["65_plus", "65+"]];
  return (
    <FlowFrame className="pretriage-frame">
      <main className="flow-shell welcome-shell">
        <div className="welcome-topbar"><Link href="/" className="icon-button" aria-label="Close symptom check"><Icon name="close" size={17} /></Link><span className="brand-word">Beeexy<span>.</span></span><span className="welcome-step">Private & secure</span></div>
        <section className="welcome-scroll">
          <div className="welcome-eyebrow"><span className="pulse-dot" />Symptom Checker</div>
          <h1>When your body sends a signal, <em>clarity matters.</em></h1>
          <p className="welcome-intro">Tell Beeexy what you’re feeling. We’ll help you understand what it could mean and what to do next.</p>
          <button className="welcome-video" onClick={() => setVideoOpen(true)}>
            <span className="welcome-play"><Icon name="video" size={20} /></span>
            <span><strong>See how Beeexy helps</strong><small>A 1-minute introduction · Optional</small></span>
            <Icon name="chevron-right" size={16} />
          </button>

          <fieldset className="welcome-fieldset"><legend>Sex assigned at birth</legend><p>This helps us ask more relevant questions.</p><div className="welcome-sex-grid">
            <button className={`welcome-sex${answers.sexAtBirth === "female" ? " selected" : ""}`} onClick={() => patch({ sexAtBirth: "female" })}><span><Icon name="user" size={18} /></span><strong>Female</strong>{answers.sexAtBirth === "female" && <Icon name="check" size={15} />}</button>
            <button className={`welcome-sex${answers.sexAtBirth === "male" ? " selected" : ""}`} onClick={() => patch({ sexAtBirth: "male" })}><span><Icon name="user" size={18} /></span><strong>Male</strong>{answers.sexAtBirth === "male" && <Icon name="check" size={15} />}</button>
          </div><button className={`welcome-skip${answers.sexAtBirth === "prefer_not_to_say" ? " selected" : ""}`} onClick={() => patch({ sexAtBirth: "prefer_not_to_say" })}>Prefer not to say</button></fieldset>

          <fieldset className="welcome-fieldset"><legend>Your age range</legend><p>No exact birth date needed.</p><div className="welcome-age-grid">{ageOptions.map(([value, label]) => <button key={value} className={answers.ageRange === value ? "selected" : ""} onClick={() => patch({ ageRange: value })}>{label}</button>)}</div></fieldset>
          <div className="welcome-trust"><span><Icon name="shield" size={15} /></span><p><strong>Your answers stay private.</strong><br />Beeexy uses them only to structure this assessment.</p></div>
          {error && <p className="pt-error" role="alert">{error}</p>}
        </section>
        <footer className="welcome-footer"><button className="button primary wide" disabled={!ready || isPending} onClick={continueFlow}>{isPending ? "Starting…" : <>Start symptom check <Icon name="chevron-right" size={15} /></>}</button><p>AI-assisted guidance · Not a medical diagnosis</p></footer>

        {videoOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setVideoOpen(false); }}><section className="welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-video-title"><button className="icon-button" aria-label="Close video" onClick={() => setVideoOpen(false)}><Icon name="close" size={17} /></button><div className="video-demo-mark"><span><Icon name="activity" size={25} /></span></div><p className="eyebrow">A clearer first step</p><h2 id="welcome-video-title">From uncertainty to a plan in minutes.</h2><p>Beeexy asks focused questions, organizes what you share, and helps you choose a sensible next step.</p><div className="video-progress"><span /></div><button className="button primary wide" onClick={() => setVideoOpen(false)}>Continue</button></section></div>}
      </main>
    </FlowFrame>
  );
}

function ConversationHistory({ answers, step }: { answers: Partial<PreTriageAnswers>; step: number }) {
  const messages = useMemo(() => {
    const result: string[] = [];
    if (step > 1 && answers.symptom) result.push(answers.symptom);
    if (step > 2 && answers.watchedEducation !== null) result.push(answers.watchedEducation ? "Yes, show me the video" : "No, continue with assessment");
    if (step > 3 && answers.viewedTimeline !== null) result.push(answers.viewedTimeline ? "Yes, show me the timeline" : "No, continue with assessment");
    if (step > 4 && answers.duration) result.push(answers.duration);
    if (step > 5 && answers.painLevel) result.push(`${answers.painLevel} out of 10`);
    return result.slice(-2);
  }, [answers, step]);
  return <>{messages.map((message, index) => <div className="pt-message user" key={`${message}-${index}`}><div className="pt-bubble">{message}</div></div>)}</>;
}

function CurrentQuestion({ answers, choose, isPending, persist, setAnswers, step }: {
  answers: Partial<PreTriageAnswers>;
  choose: (value: Partial<PreTriageAnswers>, nextStep?: number, complete?: boolean) => void;
  isPending: boolean;
  persist: (nextStep: number, nextAnswers: Partial<PreTriageAnswers>, complete?: boolean) => void;
  setAnswers: React.Dispatch<React.SetStateAction<Partial<PreTriageAnswers>>>;
  step: number;
}) {
  if (step === 1) return <Question prompt={<>I understand you’re not feeling well. Let’s figure this out <em>together.</em><br /><br /><em>What</em> brings you here today?</>}><div className="pt-chips">{symptoms.map((symptom) => <button disabled={isPending} key={symptom} onClick={() => choose({ symptom })}>{symptom}</button>)}</div><ChatInput value={answers.symptom || ""} placeholder="Describe another symptom…" disabled={isPending} onChange={(symptom) => setAnswers((current) => ({ ...current, symptom }))} onSend={() => answers.symptom && persist(2, answers)} /></Question>;
  if (step === 2) return <Question prompt="Would you like to watch a short educational video about common symptom patterns?"><div className="pt-options"><button disabled={isPending} onClick={() => choose({ watchedEducation: true })}><span><Icon name="video" size={17} /></span><strong>Yes, show me the video</strong><Icon name="chevron-right" size={15} /></button><button disabled={isPending} onClick={() => choose({ watchedEducation: false })}><span><Icon name="chevron-right" size={17} /></span><strong>No, continue with assessment</strong><Icon name="chevron-right" size={15} /></button></div></Question>;
  if (step === 3) return <Question prompt="Would you like to see a visual timeline showing how symptoms like yours may progress?"><div className="pt-options"><button disabled={isPending} onClick={() => choose({ viewedTimeline: true })}><span><Icon name="activity" size={17} /></span><strong>Yes, show me the timeline</strong><Icon name="chevron-right" size={15} /></button><button disabled={isPending} onClick={() => choose({ viewedTimeline: false })}><span><Icon name="chevron-right" size={17} /></span><strong>No, continue with assessment</strong><Icon name="chevron-right" size={15} /></button></div></Question>;
  if (step === 4) return <Question prompt={<>Now, let’s continue with a few more questions.<br /><br />When did your symptoms <em>start</em>?</>}><div className="pt-options compact">{durations.map((duration) => <button disabled={isPending} key={duration} onClick={() => choose({ duration })}><strong>{duration}</strong><Icon name="chevron-right" size={15} /></button>)}</div></Question>;
  if (step === 5) return <Question prompt={<>On a scale of <em>1–10</em>, how would you rate your pain level?</>}><div className="pain-card"><div className="pain-value"><strong>{answers.painLevel || 5}</strong><span>/10</span></div><input aria-label="Pain level" type="range" min="1" max="10" value={answers.painLevel || 5} onChange={(event) => setAnswers((current) => ({ ...current, painLevel: Number(event.target.value) }))} /><div className="pain-labels"><span>Mild</span><span>Moderate</span><span>Severe</span></div><button className="button primary wide" disabled={isPending} onClick={() => persist(6, answers)}>Continue</button></div></Question>;
  return <Question prompt={<>Are you experiencing any <em>other</em> symptoms?</>}><div className="pt-options compact">{otherSymptoms.map((symptom) => <button disabled={isPending} key={symptom} onClick={() => choose({ otherSymptoms: symptom }, 7, true)}><strong>{symptom}</strong><Icon name="chevron-right" size={15} /></button>)}</div><ChatInput value={answers.otherSymptoms || ""} placeholder="Type another symptom…" disabled={isPending} onChange={(value) => setAnswers((current) => ({ ...current, otherSymptoms: value }))} onSend={() => persist(7, answers, true)} /></Question>;
}

function Question({ children, prompt }: { children: React.ReactNode; prompt: React.ReactNode }) {
  return <><div className="pt-message ai"><span className="pt-ai-avatar">B</span><div className="pt-bubble">{prompt}</div></div>{children}</>;
}

function ChatInput({ disabled, onChange, onSend, placeholder, value }: { disabled: boolean; onChange: (value: string) => void; onSend: () => void; placeholder: string; value: string }) {
  return <div className="pt-input-row"><input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && value.trim().length >= 2) onSend(); }} /><button aria-label="Send answer" disabled={disabled || value.trim().length < 2} onClick={onSend}><Icon name="send" size={16} /></button></div>;
}

function TypingIndicator() {
  return <div className="pt-message ai"><span className="pt-ai-avatar">B</span><div className="typing-indicator"><i /><i /><i /></div></div>;
}

export function AssessmentResultView() {
  const result = DEMO_ASSESSMENT_RESULT;
  return (
    <FlowFrame className="pretriage-frame">
      <main className="flow-shell result-shell">
        <header className="flow-header"><div className="flow-header-row"><Link href="/history" className="icon-button" aria-label="Back to History"><Icon name="arrow-left" size={18} /></Link><div><h1>Assessment result</h1><p>Saved to History</p></div></div></header>
        <section className="flow-body result-body">
          <span className="urgency-pill"><i />{result.urgencyLabel}</span>
          <h1>Most likely conditions</h1>
          <p className="result-intro">Based on the answers you shared, these are the closest educational matches.</p>
          <div className="condition-list">{result.possibleConditions.map((condition, index) => <article className="condition" key={condition.label}><div className="condition-head"><span><small>#{index + 1}</small>{condition.label}</span><strong>{condition.displayPercentage}%</strong></div><p>{condition.description}</p><div className="condition-bar"><span style={{ width: `${condition.displayPercentage}%` }} /></div></article>)}</div>
          <div className="ai-disclaimer"><Icon name="info" size={14} />AI-assisted · Not a medical diagnosis</div>
          <h2 className="result-actions-title">Recommended next steps</h2>
          <div className="action-list"><Link className="result-action primary" href="/doctors?match=1"><span><Icon name="stethoscope" size={18} /></span><span><strong>Find a doctor for you</strong><small>Specialists matched · Available this week</small></span><Icon name="chevron-right" size={15} /></Link><Link className="result-action" href="/second-opinion?source=pretriage"><span><Icon name="sparkles" size={18} /></span><span><strong>Get AI Second Opinion</strong><small>An independent educational perspective</small></span><Icon name="chevron-right" size={15} /></Link><Link className="result-action compact" href="/history"><span><Icon name="history" size={16} /></span><span><strong>View your History</strong></span><Icon name="chevron-right" size={14} /></Link></div>
          <p className="result-disclaimer">{result.disclaimer}</p>
        </section>
      </main>
    </FlowFrame>
  );
}
