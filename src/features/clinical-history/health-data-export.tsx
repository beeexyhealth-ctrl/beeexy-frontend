"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import { beeexyPhase6Api, saveFhirExportFile } from "@/lib/beeexy-api/phase-6-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  createFhirExportErrorPresentation,
  downloadFhirExportErrorPresentation,
  type FhirExportErrorPresentation,
  formatFhirExportDate,
  isFhirExportDownloadCandidate,
} from "./fhir-export-state";

type HealthDataExportProps = {
  eventId: string;
  onUnavailable: () => void | Promise<void>;
  patientId: string;
};

export function createFhirExportIdempotencyKey() {
  return crypto.randomUUID();
}

export function HealthDataExport({ eventId, onUnavailable, patientId }: HealthDataExportProps) {
  const [metadata, setMetadata] = useState<FhirExportMetadata | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [createError, setCreateError] = useState<FhirExportErrorPresentation | null>(null);
  const [downloadError, setDownloadError] = useState<FhirExportErrorPresentation | null>(null);
  const [downloadBlocked, setDownloadBlocked] = useState(false);
  const intentKeyRef = useRef<string | null>(null);
  const createInFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function createExport(freshIntent = false) {
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    const key = freshIntent || !intentKeyRef.current
      ? createFhirExportIdempotencyKey()
      : intentKeyRef.current;
    intentKeyRef.current = key;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsCreating(true);
    setCreateError(null);
    setDownloadError(null);
    setDownloadBlocked(false);

    try {
      const created = await beeexyPhase6Api.createFhirExport(patientId, {
        sourceClinicalHistoryEventId: eventId,
        idempotencyKey: key,
      }, controller.signal);
      setMetadata(created);
      if (created.status === "ValidationFailed") intentKeyRef.current = null;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof BeeexyApiError && error.status === 404) {
        await onUnavailable();
        return;
      }
      const presentation = createFhirExportErrorPresentation(error);
      if (presentation.retry === "fresh" || presentation.retry === "none") intentKeyRef.current = null;
      setCreateError(presentation);
    } finally {
      createInFlightRef.current = false;
      setIsCreating(false);
    }
  }

  async function downloadExport() {
    if (!metadata || isDownloading || downloadBlocked || !isFhirExportDownloadCandidate(metadata)) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const download = await beeexyPhase6Api.downloadFhirExport(metadata.id, controller.signal);
      saveFhirExportFile(download);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof BeeexyApiError && error.status === 404) {
        await onUnavailable();
        return;
      }
      const presentation = downloadFhirExportErrorPresentation(error);
      if (error instanceof BeeexyApiError && error.status === 409) {
        setDownloadBlocked(true);
        try {
          setMetadata(await beeexyPhase6Api.getFhirExport(metadata.id, controller.signal));
        } catch (metadataError) {
          if (metadataError instanceof BeeexyApiError && metadataError.status === 404) {
            await onUnavailable();
            return;
          }
        }
      } else if (presentation.retry === "none") {
        setDownloadBlocked(true);
      }
      setDownloadError(presentation);
    } finally {
      setIsDownloading(false);
    }
  }

  const createdDate = metadata ? formatFhirExportDate(metadata.createdAt) : null;
  const isDownloadCandidate = metadata ? isFhirExportDownloadCandidate(metadata) : false;

  return (
    <section
      className="history-detail-section health-export-section"
      aria-labelledby="health-export-heading"
      aria-busy={isCreating || isDownloading}
    >
      <div className="history-section-heading health-export-heading">
        <div><p>Portable record</p><h2 id="health-export-heading">Health data export</h2></div>
        <span><Icon name="shield" size={14} /> FHIR R4</span>
      </div>
      <p className="health-export-intro">Export this health record in a standard healthcare data format.</p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {isCreating ? "Preparing your health data." : isDownloading ? "Downloading your health data export." : ""}
      </p>

      {!metadata && !createError && (
        <div className="health-export-action">
          <button className="button secondary wide" type="button" disabled={isCreating} onClick={() => void createExport()}>
            <Icon name="document" size={16} />
            {isCreating ? "Preparing your health data…" : "Export health record"}
          </button>
          <small>FHIR R4 format</small>
        </div>
      )}

      {createError && (
        <div className="health-export-state health-export-failed" role="alert">
          <span><Icon name="info" size={17} /></span>
          <div><strong>Export not ready</strong><p>{createError.message}</p>{createError.correlationId && <small>Reference: {createError.correlationId}</small>}</div>
          {createError.retry !== "none" && (
            <button className="button secondary wide" type="button" disabled={isCreating} onClick={() => void createExport(createError.retry === "fresh")}>
              {isCreating ? "Preparing your health data…" : createError.retry === "same" ? "Retry export" : "Try again"}
            </button>
          )}
        </div>
      )}

      {metadata && (metadata.status === "Pending" || metadata.status === "Generated") && (
        <div className="health-export-state health-export-preparing" role="status">
          <span className="health-export-spinner" aria-hidden="true" />
          <div><strong>Preparing export…</strong><p>Your health data export isn’t ready to download yet.</p></div>
          <button className="button secondary wide" type="button" disabled>Download FHIR</button>
        </div>
      )}

      {metadata?.status === "ValidationFailed" && (
        <div className="health-export-state health-export-failed" role="alert">
          <span><Icon name="info" size={17} /></span>
          <div><strong>We couldn’t prepare this health data export.</strong><p>Please try again.</p></div>
          <button className="button secondary wide" type="button" disabled={isCreating} onClick={() => void createExport(true)}>
            {isCreating ? "Preparing your health data…" : "Try again"}
          </button>
        </div>
      )}

      {metadata?.status === "Validated" && (
        <div className={`health-export-state ${isDownloadCandidate && !downloadBlocked ? "health-export-ready" : "health-export-failed"}`} role="status">
          <span><Icon name={isDownloadCandidate && !downloadBlocked ? "check" : "info"} size={17} /></span>
          <div>
            <strong>{isDownloadCandidate && !downloadBlocked ? "Health data export ready" : "Export unavailable for download"}</strong>
            <p>FHIR {metadata.fhirVersion}{createdDate ? <> · Created <time dateTime={metadata.createdAt}>{createdDate}</time></> : null}</p>
            {downloadError && <p className="health-export-error" role="alert">{downloadError.message}</p>}
            {downloadError?.correlationId && <small>Reference: {downloadError.correlationId}</small>}
          </div>
          <button
            className="button primary wide"
            type="button"
            disabled={!isDownloadCandidate || downloadBlocked || isDownloading}
            onClick={() => void downloadExport()}
          >
            <Icon name="download" size={16} />
            {isDownloading ? "Downloading…" : downloadError?.retry === "same" ? "Retry download" : "Download FHIR"}
          </button>
        </div>
      )}
    </section>
  );
}
