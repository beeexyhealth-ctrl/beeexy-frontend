"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Icon } from "@/components/ui/icon";
import type {
  SecondOpinion,
  SecondOpinionAccepted,
  SecondOpinionMetadata,
  SecondOpinionResult,
  SecondOpinionTerminalStatus,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import {
  canRegenerateSecondOpinion,
  formatSecondOpinionResultDate,
  secondOpinionDisplayState,
  secondOpinionLoadError,
  secondOpinionRegenerationError,
  type SecondOpinionLoadError,
} from "./second-opinion-result-state";

type ResultLoadState =
  | { kind: "loading"; scopeId: string }
  | { error: SecondOpinionLoadError; kind: "error"; scopeId: string }
  | {
    kind: "ready";
    opinion: SecondOpinion;
    refreshError: SecondOpinionLoadError | null;
    refreshing: boolean;
    scopeId: string;
  };

type LoadOptions = {
  focusAfter?: boolean;
  preserve?: boolean;
  preserveSuccessfulOnNonSuccess?: boolean;
  replaceActive?: boolean;
  suppressRefreshError?: boolean;
};

type ResultLoadOutcome =
  | {
    kind: "loaded";
    opinion: SecondOpinion;
    preservedOpinion: SecondOpinion | null;
    preservedSuccessfulResult: boolean;
  }
  | { error: SecondOpinionLoadError; kind: "error"; preservedOpinion: SecondOpinion | null }
  | { kind: "ignored" };

type RegenerationNotice = {
  blockRegeneration: boolean;
  canCheckStatus: boolean;
  message: string;
  tone: "success" | "progress" | "warning" | "error";
};

type RegenerationState =
  | { kind: "idle"; scopeId: string }
  | { kind: "confirming"; scopeId: string }
  | { kind: "submitting"; scopeId: string }
  | { kind: "reconciling"; scopeId: string }
  | { kind: "notice"; notice: RegenerationNotice; scopeId: string };

function isTerminalReceipt(receipt: SecondOpinionAccepted, analysisId: string) {
  const terminalStatuses: SecondOpinionTerminalStatus[] = ["succeeded", "failed", "rejected"];
  return receipt.analysisId === analysisId
    && typeof receipt.executionId === "string"
    && receipt.executionId.length > 0
    && typeof receipt.statusUrl === "string"
    && receipt.statusUrl.length > 0
    && terminalStatuses.includes(receipt.status);
}

function isNewSuccessfulSnapshot(previous: SecondOpinion | null, next: SecondOpinion) {
  if (secondOpinionDisplayState(next).kind !== "succeeded") return false;
  if (!previous || secondOpinionDisplayState(previous).kind !== "succeeded") return true;
  if (next.executionId && previous.executionId) return next.executionId !== previous.executionId;
  return next.metadata?.generatedAt !== previous.metadata?.generatedAt
    || next.metadata?.resultVersion !== previous.metadata?.resultVersion;
}

function terminalAttemptNotice(status: Exclude<SecondOpinionTerminalStatus, "succeeded">): RegenerationNotice {
  return status === "rejected"
    ? {
      blockRegeneration: false,
      canCheckStatus: false,
      message: "The regeneration request was declined safely. Any previous result remains available.",
      tone: "warning",
    }
    : {
      blockRegeneration: false,
      canCheckStatus: false,
      message: "Beeexy couldn't complete the regeneration. Any previous result remains available.",
      tone: "error",
    };
}

export function SecondOpinionResultView({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<ResultLoadState>({ kind: "loading", scopeId: analysisId });
  const [regeneration, setRegeneration] = useState<RegenerationState>({ kind: "idle", scopeId: analysisId });
  const stateRef = useRef<ResultLoadState>(state);
  const controllerRef = useRef<AbortController | null>(null);
  const regenerationControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const regenerationRequestIdRef = useRef(0);
  const regeneratingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((next: ResultLoadState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const load = useCallback(async ({
    focusAfter = false,
    preserve = false,
    preserveSuccessfulOnNonSuccess = false,
    replaceActive = false,
    suppressRefreshError = false,
  }: LoadOptions = {}) => {
    if (controllerRef.current && !replaceActive) return { kind: "ignored" } as ResultLoadOutcome;
    if (replaceActive) controllerRef.current?.abort();

    const current = stateRef.current;
    const preservedOpinion = preserve && current.kind === "ready" && current.scopeId === analysisId
      ? current.opinion
      : null;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    controllerRef.current = controller;

    await Promise.resolve();
    if (controller.signal.aborted || requestId !== requestIdRef.current) {
      return { kind: "ignored" } as ResultLoadOutcome;
    }

    commit(preservedOpinion
      ? {
        kind: "ready",
        opinion: preservedOpinion,
        refreshError: null,
        refreshing: true,
        scopeId: analysisId,
      }
      : { kind: "loading", scopeId: analysisId });

    try {
      const response = await beeexyPhase10Api.getSecondOpinion(analysisId, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return { kind: "ignored" } as ResultLoadOutcome;
      }
      const preservedSuccessfulResult = Boolean(
        preserveSuccessfulOnNonSuccess
        && preservedOpinion
        && secondOpinionDisplayState(preservedOpinion).kind === "succeeded"
        && secondOpinionDisplayState(response).kind !== "succeeded",
      );
      commit({
        kind: "ready",
        opinion: preservedSuccessfulResult && preservedOpinion ? preservedOpinion : response,
        refreshError: null,
        refreshing: false,
        scopeId: analysisId,
      });
      return {
        kind: "loaded",
        opinion: response,
        preservedOpinion,
        preservedSuccessfulResult,
      } as ResultLoadOutcome;
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current
        || (caught instanceof Error && caught.name === "AbortError")) {
        return { kind: "ignored" } as ResultLoadOutcome;
      }

      const mapped = secondOpinionLoadError(caught);
      if (preservedOpinion && !mapped.clearExisting) {
        commit({
          kind: "ready",
          opinion: preservedOpinion,
          refreshError: suppressRefreshError ? null : mapped,
          refreshing: false,
          scopeId: analysisId,
        });
      } else {
        commit({ error: mapped, kind: "error", scopeId: analysisId });
      }
      return { error: mapped, kind: "error", preservedOpinion } as ResultLoadOutcome;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (focusAfter && !controller.signal.aborted && requestId === requestIdRef.current) {
        queueMicrotask(() => contentRef.current?.focus());
      }
    }
  }, [analysisId, commit]);

  useEffect(() => {
    let cancelled = false;
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;

    queueMicrotask(() => {
      if (!cancelled) void load({ replaceActive: true });
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      regenerationRequestIdRef.current += 1;
      regenerationControllerRef.current?.abort();
      regenerationControllerRef.current = null;
      regeneratingRef.current = false;
    };
  }, [analysisId, load]);

  const scopedState: ResultLoadState = state.scopeId === analysisId
    ? state
    : { kind: "loading", scopeId: analysisId };
  const display = scopedState.kind === "ready"
    ? secondOpinionDisplayState(scopedState.opinion)
    : null;
  const scopedRegeneration: RegenerationState = regeneration.scopeId === analysisId
    ? regeneration
    : { kind: "idle", scopeId: analysisId };
  const regenerationActive = scopedRegeneration.kind === "submitting"
    || scopedRegeneration.kind === "reconciling";
  const regenerationNotice = scopedRegeneration.kind === "notice" ? scopedRegeneration.notice : null;
  const regenerationEligible = display ? canRegenerateSecondOpinion(display) : false;

  const focusContent = useCallback(() => {
    queueMicrotask(() => contentRef.current?.focus());
  }, []);

  const setNotice = useCallback((notice: RegenerationNotice) => {
    setRegeneration({ kind: "notice", notice, scopeId: analysisId });
    focusContent();
  }, [analysisId, focusContent]);

  const noticeForLoadedStatus = useCallback((
    outcome: Extract<ResultLoadOutcome, { kind: "loaded" }>,
    previousOpinion: SecondOpinion | null,
    receipt?: SecondOpinionAccepted,
  ) => {
    const loadedDisplay = secondOpinionDisplayState(outcome.opinion);
    if (receipt?.status === "failed" || receipt?.status === "rejected") {
      setNotice(terminalAttemptNotice(receipt.status));
      return;
    }
    if (loadedDisplay.kind === "pending" || loadedDisplay.kind === "running") {
      setNotice({
        blockRegeneration: true,
        canCheckStatus: true,
        message: "Regeneration is still in progress. Check the status when you're ready.",
        tone: "progress",
      });
      return;
    }
    if (loadedDisplay.kind === "failed" || loadedDisplay.kind === "rejected") {
      setNotice(terminalAttemptNotice(loadedDisplay.kind));
      return;
    }
    if (loadedDisplay.kind === "succeeded") {
      const matchesReceipt = !receipt
        || !outcome.opinion.executionId
        || outcome.opinion.executionId === receipt.executionId;
      if (matchesReceipt && isNewSuccessfulSnapshot(previousOpinion, outcome.opinion)) {
        setNotice({
          blockRegeneration: false,
          canCheckStatus: false,
          message: "A new Second Opinion result is ready.",
          tone: "success",
        });
      } else {
        setNotice({
          blockRegeneration: false,
          canCheckStatus: true,
          message: "No newer result is available yet. You can check the status or regenerate later.",
          tone: "progress",
        });
      }
      return;
    }
    setNotice({
      blockRegeneration: true,
      canCheckStatus: true,
      message: "Beeexy returned a status that can't be displayed safely. Check the status before trying again.",
      tone: "warning",
    });
  }, [setNotice]);

  const checkRegenerationStatus = useCallback(async () => {
    if (regeneratingRef.current || controllerRef.current) return;
    const current = stateRef.current;
    const previousOpinion = current.kind === "ready" && current.scopeId === analysisId
      ? current.opinion
      : null;
    const outcome = await load({
      focusAfter: true,
      preserve: true,
      preserveSuccessfulOnNonSuccess: true,
      suppressRefreshError: true,
    });
    if (outcome.kind === "loaded") {
      noticeForLoadedStatus(outcome, previousOpinion);
    } else if (outcome.kind === "error" && !outcome.error.clearExisting) {
      setNotice({
        blockRegeneration: true,
        canCheckStatus: true,
        message: "Beeexy couldn't confirm the latest status. Your previous result remains available.",
        tone: "warning",
      });
    } else if (outcome.kind === "error") {
      setRegeneration({ kind: "idle", scopeId: analysisId });
    }
  }, [analysisId, load, noticeForLoadedStatus, setNotice]);

  const regenerate = useCallback(async () => {
    const current = stateRef.current;
    if (regeneratingRef.current
      || current.kind !== "ready"
      || current.scopeId !== analysisId
      || !canRegenerateSecondOpinion(secondOpinionDisplayState(current.opinion))) return;

    regeneratingRef.current = true;
    const previousOpinion = current.opinion;
    const controller = new AbortController();
    const requestId = ++regenerationRequestIdRef.current;
    regenerationControllerRef.current = controller;
    setRegeneration({ kind: "submitting", scopeId: analysisId });

    try {
      const receipt = await beeexyPhase10Api.regenerateSecondOpinion(analysisId, controller.signal);
      if (controller.signal.aborted || requestId !== regenerationRequestIdRef.current) return;
      const receiptIsValid = isTerminalReceipt(receipt, analysisId);

      setRegeneration({ kind: "reconciling", scopeId: analysisId });
      const outcome = await load({
        preserve: true,
        preserveSuccessfulOnNonSuccess: true,
        replaceActive: true,
        suppressRefreshError: true,
      });
      if (controller.signal.aborted || requestId !== regenerationRequestIdRef.current) return;
      if (!receiptIsValid) {
        setNotice({
          blockRegeneration: true,
          canCheckStatus: true,
          message: "Beeexy returned an unexpected regeneration receipt. Check the current status before trying again.",
          tone: "warning",
        });
        return;
      }
      if (outcome.kind === "loaded") {
        noticeForLoadedStatus(outcome, previousOpinion, receipt);
      } else if (outcome.kind === "error" && !outcome.error.clearExisting) {
        setNotice({
          blockRegeneration: true,
          canCheckStatus: true,
          message: "Regeneration finished, but Beeexy couldn't confirm the latest result. Your previous result remains available.",
          tone: "warning",
        });
      } else if (outcome.kind === "error") {
        setRegeneration({ kind: "idle", scopeId: analysisId });
      }
    } catch (caught) {
      if (controller.signal.aborted || requestId !== regenerationRequestIdRef.current
        || (caught instanceof Error && caught.name === "AbortError")) return;
      const mapped = secondOpinionRegenerationError(caught);
      if (mapped.clearExisting) {
        commit({ error: secondOpinionLoadError(caught), kind: "error", scopeId: analysisId });
        setRegeneration({ kind: "idle", scopeId: analysisId });
        focusContent();
      } else {
        setNotice({
          blockRegeneration: mapped.blockRegeneration,
          canCheckStatus: mapped.canCheckStatus,
          message: mapped.message,
          tone: mapped.kind === "immutable-input" || mapped.kind === "request-invalid" || mapped.kind === "conflict"
            ? "warning"
            : "error",
        });
      }
    } finally {
      if (regenerationControllerRef.current === controller) regenerationControllerRef.current = null;
      if (requestId === regenerationRequestIdRef.current) regeneratingRef.current = false;
    }
  }, [analysisId, commit, focusContent, load, noticeForLoadedStatus, setNotice]);

  const openRegenerationConfirmation = useCallback(() => {
    if (!regenerationEligible || regenerationActive || regenerationNotice?.blockRegeneration) return;
    setRegeneration({ kind: "confirming", scopeId: analysisId });
  }, [analysisId, regenerationActive, regenerationEligible, regenerationNotice?.blockRegeneration]);

  const closeRegenerationConfirmation = useCallback(() => {
    if (scopedRegeneration.kind === "confirming") {
      setRegeneration({ kind: "idle", scopeId: analysisId });
    }
  }, [analysisId, scopedRegeneration.kind]);

  return (
    <div className="page second-opinion-result-page">
      <Link className="back-link" href="/ai/second-opinion">
        <Icon name="arrow-left" size={16} />Second Opinion
      </Link>

      <header className="second-opinion-result-header">
        <div className="second-opinion-result-title">
          <span aria-hidden="true"><Icon name="sparkles" size={20} /></span>
          <div>
            <p className="eyebrow">Beeexy AI</p>
            <h1>Second Opinion result</h1>
            <p>Educational information returned securely by Beeexy.</p>
          </div>
        </div>
        {display?.kind === "succeeded" && (
          <button
            aria-label="Refresh Second Opinion result"
            className="icon-button"
            disabled={scopedState.kind !== "ready" || scopedState.refreshing || regenerationActive}
            onClick={() => void load({ focusAfter: true, preserve: true })}
            type="button"
          >
            <Icon name="history" size={17} />
          </button>
        )}
      </header>

      <div
        aria-busy={scopedState.kind === "loading" || (scopedState.kind === "ready" && scopedState.refreshing)}
        className="second-opinion-result-content"
        ref={contentRef}
        tabIndex={-1}
      >
        {scopedState.kind === "loading" && <SecondOpinionResultSkeleton />}
        {scopedState.kind === "error" && (
          <LoadErrorState error={scopedState.error} onRetry={() => void load({ focusAfter: true })} />
        )}
        {scopedState.kind === "ready" && display && (
          <>
            {scopedState.refreshing && (
              <p className="second-opinion-result-refreshing" role="status">Checking the latest status…</p>
            )}
            {scopedState.refreshError && (
              <div className="second-opinion-result-inline-error" role="alert">
                <Icon name="info" size={16} />
                <p>{scopedState.refreshError.message} Your current result remains available.</p>
                <button
                  className="text-button"
                  onClick={() => void load({ focusAfter: true, preserve: true })}
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}
            <SecondOpinionDisplay
              display={display}
              onRefresh={regenerationNotice?.canCheckStatus
                ? () => void checkRegenerationStatus()
                : () => void load({ focusAfter: true, preserve: true })}
              refreshing={scopedState.refreshing}
            />
            {(regenerationEligible || scopedRegeneration.kind !== "idle") && (
              <SecondOpinionRegenerationPanel
                active={regenerationActive}
                canRegenerate={regenerationEligible && !regenerationNotice?.blockRegeneration}
                notice={regenerationNotice}
                onCheckStatus={() => void checkRegenerationStatus()}
                onRegenerate={openRegenerationConfirmation}
                refreshing={scopedState.refreshing}
                showStatusAction={display.kind !== "pending" && display.kind !== "running"}
              />
            )}
          </>
        )}
      </div>
      {(scopedRegeneration.kind === "confirming" || scopedRegeneration.kind === "submitting") && (
        <SecondOpinionRegenerationDialog
          onCancel={closeRegenerationConfirmation}
          onConfirm={() => void regenerate()}
          submitting={scopedRegeneration.kind === "submitting"}
        />
      )}
    </div>
  );
}

function SecondOpinionRegenerationPanel({
  active,
  canRegenerate,
  notice,
  onCheckStatus,
  onRegenerate,
  refreshing,
  showStatusAction,
}: {
  active: boolean;
  canRegenerate: boolean;
  notice: RegenerationNotice | null;
  onCheckStatus: () => void;
  onRegenerate: () => void;
  refreshing: boolean;
  showStatusAction: boolean;
}) {
  return (
    <section className="second-opinion-regeneration" aria-labelledby="second-opinion-regeneration-title">
      <div className="second-opinion-regeneration-copy">
        <span aria-hidden="true"><Icon name="history" size={19} /></span>
        <div>
          <p className="eyebrow">Same original information</p>
          <h2 id="second-opinion-regeneration-title">Create another version</h2>
          <p>
            Beeexy will use the same original information. New or changed information requires a New Second Opinion.
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={`second-opinion-regeneration-notice ${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <Icon name={notice.tone === "success" ? "check" : "info"} size={17} />
          <p>{notice.message}</p>
        </div>
      )}

      <div className="second-opinion-regeneration-actions">
        {notice?.canCheckStatus && showStatusAction && (
          <button
            aria-busy={refreshing}
            className="button secondary"
            disabled={refreshing || active}
            onClick={onCheckStatus}
            type="button"
          >
            {refreshing ? "Checking status..." : "Check status"}
          </button>
        )}
        <button
          aria-busy={active}
          className="button primary"
          disabled={!canRegenerate || refreshing || active}
          onClick={onRegenerate}
          type="button"
        >
          {active ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
    </section>
  );
}

function SecondOpinionRegenerationDialog({
  onCancel,
  onConfirm,
  submitting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="patient-dialog-backdrop second-opinion-regeneration-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <section
        aria-busy={submitting}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="patient-dialog second-opinion-regeneration-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <span aria-hidden="true"><Icon name="history" size={22} /></span>
        <p className="eyebrow">Second Opinion</p>
        <h2 id={titleId}>Regenerate this Second Opinion?</h2>
        <p id={descriptionId}>
          Beeexy will create another version from the same original information. To use new or changed information,
          start a New Second Opinion instead.
        </p>
        <div>
          <button
            className="button secondary"
            disabled={submitting}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <button
            aria-busy={submitting}
            className="button primary"
            disabled={submitting}
            onClick={onConfirm}
            type="button"
          >
            {submitting ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SecondOpinionDisplay({
  display,
  onRefresh,
  refreshing,
}: {
  display: ReturnType<typeof secondOpinionDisplayState>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  switch (display.kind) {
    case "pending":
      return (
        <ProcessingState
          description="Your request is waiting to be prepared. No result is available yet."
          eyebrow="Request pending"
          onRefresh={onRefresh}
          refreshing={refreshing}
          title="Your Second Opinion is pending."
        />
      );
    case "running":
      return (
        <ProcessingState
          description="Beeexy is preparing your educational result. No result is available yet."
          eyebrow="In progress"
          onRefresh={onRefresh}
          refreshing={refreshing}
          title="Your Second Opinion is being prepared."
        />
      );
    case "succeeded":
      return <SuccessfulResult metadata={display.metadata} result={display.result} />;
    case "failed":
      return (
        <TerminalState
          description="No result was returned. You can start a new request when you’re ready."
          eyebrow="Not completed"
          icon="info"
          title="Beeexy couldn’t complete this Second Opinion."
        />
      );
    case "rejected":
      return (
        <TerminalState
          description={display.safeMessage}
          eyebrow="Safe response"
          icon="shield"
          title="Beeexy couldn’t provide a Second Opinion result."
        />
      );
    case "unsupported":
      return (
        <section className="second-opinion-result-state" aria-labelledby="second-opinion-unsupported-title">
          <span aria-hidden="true"><Icon name="shield" size={23} /></span>
          <p className="eyebrow">Result unavailable</p>
          <h2 id="second-opinion-unsupported-title">This Second Opinion can’t be displayed safely.</h2>
          <p>The returned result did not match a supported Beeexy status or result structure.</p>
          <button className="button secondary" disabled={refreshing} onClick={onRefresh} type="button">
            {refreshing ? "Checking…" : "Check again"}
          </button>
        </section>
      );
  }
}

function ProcessingState({
  description,
  eyebrow,
  onRefresh,
  refreshing,
  title,
}: {
  description: string;
  eyebrow: string;
  onRefresh: () => void;
  refreshing: boolean;
  title: string;
}) {
  return (
    <section className="second-opinion-result-state processing" aria-live="polite">
      <span aria-hidden="true"><Icon name="clock" size={23} /></span>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <button
        aria-busy={refreshing}
        className="button primary"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        {refreshing ? "Checking status…" : "Check status"}
      </button>
    </section>
  );
}

function TerminalState({
  description,
  eyebrow,
  icon,
  title,
}: {
  description: string;
  eyebrow: string;
  icon: "info" | "shield";
  title: string;
}) {
  return (
    <section className="second-opinion-result-state" aria-live="polite">
      <span aria-hidden="true"><Icon name={icon} size={23} /></span>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="button primary" href="/ai/second-opinion">New Second Opinion</Link>
    </section>
  );
}

function SuccessfulResult({
  metadata,
  result,
}: {
  metadata: SecondOpinionMetadata;
  result: SecondOpinionResult;
}) {
  return (
    <article className="second-opinion-result-success" aria-labelledby="second-opinion-ready-title">
      <header className="second-opinion-result-ready">
        <span aria-hidden="true"><Icon name="check" size={22} /></span>
        <div>
          <p className="eyebrow">Second Opinion ready</p>
          <h2 id="second-opinion-ready-title">Your educational result</h2>
          <p>Generated <time dateTime={metadata.generatedAt}>{formatSecondOpinionResultDate(metadata.generatedAt)}</time></p>
        </div>
      </header>

      <section className="second-opinion-result-section">
        <h2>Summary</h2>
        <p>{result.summary}</p>
      </section>

      <ResultListSection heading="Important points" items={result.importantPoints} />
      <ResultListSection heading="Possible questions for your doctor" items={result.possibleQuestionsForDoctor} />
      <ResultListSection heading="Missing information" items={result.missingInformation} />

      <aside
        aria-label="Second Opinion disclaimer"
        className="second-opinion-result-disclaimer"
        data-disclaimer-version={metadata.disclaimerVersion}
      >
        <Icon name="shield" size={17} />
        <div>
          <strong>Important information</strong>
          <p>{result.disclaimer}</p>
        </div>
      </aside>

      <details className="second-opinion-result-metadata">
        <summary>Result details</summary>
        <dl>
          <MetadataItem label="AI-generated" value={metadata.aiGenerated ? "Yes" : "No"} />
          <MetadataItem
            label="Generated"
            value={<time dateTime={metadata.generatedAt}>{formatSecondOpinionResultDate(metadata.generatedAt)}</time>}
          />
          <MetadataItem label="Result version" value={metadata.resultVersion} />
          {metadata.provider !== undefined && <MetadataItem label="Provider" value={metadata.provider} />}
          {metadata.modelVersion !== undefined && <MetadataItem label="Model version" value={metadata.modelVersion} />}
          {metadata.promptVersion !== undefined && <MetadataItem label="Prompt version" value={metadata.promptVersion} />}
          <MetadataItem label="Disclaimer version" value={metadata.disclaimerVersion} />
        </dl>
      </details>

      <Link className="button secondary wide" href="/ai/second-opinion">New Second Opinion</Link>
    </article>
  );
}

function ResultListSection({ heading, items }: { heading: string; items: string[] }) {
  return (
    <section className="second-opinion-result-section">
      <h2>{heading}</h2>
      {items.length > 0 ? (
        <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
      ) : (
        <p className="second-opinion-result-empty">No entries were included in this section.</p>
      )}
    </section>
  );
}

function MetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function LoadErrorState({ error, onRetry }: { error: SecondOpinionLoadError; onRetry: () => void }) {
  if (error.kind === "unavailable") {
    return (
      <section className="second-opinion-result-state" aria-labelledby="second-opinion-unavailable-title">
        <span aria-hidden="true"><Icon name="info" size={23} /></span>
        <p className="eyebrow">Unavailable</p>
        <h2 id="second-opinion-unavailable-title">Second Opinion unavailable</h2>
        <p role="alert">{error.message}</p>
        <Link className="button primary" href="/ai/second-opinion">New Second Opinion</Link>
      </section>
    );
  }

  return (
    <section className="second-opinion-result-state" aria-labelledby="second-opinion-load-error-title">
      <span aria-hidden="true"><Icon name="info" size={23} /></span>
      <p className="eyebrow">Couldn’t load</p>
      <h2 id="second-opinion-load-error-title">Second Opinion didn’t load</h2>
      <p role="alert">{error.message}</p>
      <button className="button primary" onClick={onRetry} type="button">Try again</button>
    </section>
  );
}

function SecondOpinionResultSkeleton() {
  return (
    <div
      aria-label="Loading Second Opinion result"
      className="second-opinion-result-skeleton"
      role="status"
    >
      <span className="sr-only">Loading Second Opinion result</span>
      <div className="second-opinion-result-skeleton-ready" />
      <div className="second-opinion-result-skeleton-section" />
      <div className="second-opinion-result-skeleton-section short" />
      <div className="second-opinion-result-skeleton-disclaimer" />
    </div>
  );
}
