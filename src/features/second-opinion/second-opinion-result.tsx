"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
  SecondOpinion,
  SecondOpinionMetadata,
  SecondOpinionResult,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import {
  formatSecondOpinionResultDate,
  secondOpinionDisplayState,
  secondOpinionLoadError,
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
  replaceActive?: boolean;
};

export function SecondOpinionResultView({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<ResultLoadState>({ kind: "loading", scopeId: analysisId });
  const stateRef = useRef<ResultLoadState>(state);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((next: ResultLoadState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const load = useCallback(async ({
    focusAfter = false,
    preserve = false,
    replaceActive = false,
  }: LoadOptions = {}) => {
    if (controllerRef.current && !replaceActive) return;
    if (replaceActive) controllerRef.current?.abort();

    const current = stateRef.current;
    const preservedOpinion = preserve && current.kind === "ready" && current.scopeId === analysisId
      ? current.opinion
      : null;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    controllerRef.current = controller;

    await Promise.resolve();
    if (controller.signal.aborted || requestId !== requestIdRef.current) return;

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
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      commit({
        kind: "ready",
        opinion: response,
        refreshError: null,
        refreshing: false,
        scopeId: analysisId,
      });
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current
        || (caught instanceof Error && caught.name === "AbortError")) return;

      const mapped = secondOpinionLoadError(caught);
      if (preservedOpinion && !mapped.clearExisting) {
        commit({
          kind: "ready",
          opinion: preservedOpinion,
          refreshError: mapped,
          refreshing: false,
          scopeId: analysisId,
        });
      } else {
        commit({ error: mapped, kind: "error", scopeId: analysisId });
      }
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
    };
  }, [analysisId, load]);

  const scopedState: ResultLoadState = state.scopeId === analysisId
    ? state
    : { kind: "loading", scopeId: analysisId };
  const display = scopedState.kind === "ready"
    ? secondOpinionDisplayState(scopedState.opinion)
    : null;

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
            disabled={scopedState.kind !== "ready" || scopedState.refreshing}
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
              onRefresh={() => void load({ focusAfter: true, preserve: true })}
              refreshing={scopedState.refreshing}
            />
          </>
        )}
      </div>
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
