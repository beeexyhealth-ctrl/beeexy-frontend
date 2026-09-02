"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Icon } from "@/components/ui/icon";
import type { AiDocument } from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  AI_DOCUMENT_ACCEPT_ATTRIBUTE,
  aiDocumentDeleteError,
  aiDocumentTypeLabel,
  aiDocumentUploadError,
  formatAiDocumentDate,
  formatAiDocumentSize,
  validateAiDocumentSelection,
} from "./ai-temporary-document-state";

type FileState =
  | { kind: "idle"; error?: string }
  | { kind: "selected"; file: File }
  | { kind: "uploading"; file: File }
  | { kind: "upload-error"; file: File; message: string; retryable: boolean };

type RemoveIntent = "remove" | "replace";

type ExpiredDocument = {
  document: AiDocument;
  filename: string | null;
};

export type AiTemporaryDocumentUploaderProps = {
  value: AiDocument | null;
  onChange: (document: AiDocument | null) => void;
  filename?: string | null;
  onFilenameChange?: (filename: string | null) => void;
  disabled?: boolean;
};

export function AiTemporaryDocumentUploader({
  value,
  onChange,
  filename,
  onFilenameChange,
  disabled = false,
}: AiTemporaryDocumentUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const uploadPendingRef = useRef(false);
  const invalidatedDocumentIdsRef = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);
  const onFilenameChangeRef = useRef(onFilenameChange);
  const [fileState, setFileState] = useState<FileState>({ kind: "idle" });
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [expiredDocument, setExpiredDocument] = useState<ExpiredDocument | null>(null);
  const [removeIntent, setRemoveIntent] = useState<RemoveIntent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFilenameChangeRef.current = onFilenameChange;
  }, [onFilenameChange]);

  useEffect(() => () => {
    uploadPendingRef.current = false;
    uploadControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!value) return;
    const expiresAt = Date.parse(value.expiresAt);
    const alreadyUnavailable = value.status !== "active"
      || (Number.isFinite(expiresAt) && expiresAt <= Date.now());
    const expire = () => {
      if (invalidatedDocumentIdsRef.current.has(value.documentId)) return;
      invalidatedDocumentIdsRef.current.add(value.documentId);
      setExpiredDocument({ document: value, filename: uploadedFilename });
      setNotice("This temporary document reached its returned expiry time and is no longer selected for use.");
      onFilenameChangeRef.current?.(null);
      onChangeRef.current(null);
    };

    if (alreadyUnavailable) {
      queueMicrotask(expire);
      return;
    }
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(expire, expiresAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [uploadedFilename, value]);

  const displayedDocument = value ?? expiredDocument?.document ?? null;
  const isExpired = Boolean(displayedDocument && (
    displayedDocument.status !== "active"
    || expiredDocument?.document.documentId === displayedDocument.documentId
  ));
  const displayedFilename = value ? filename ?? uploadedFilename : expiredDocument?.filename ?? null;
  const uploading = fileState.kind === "uploading";

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (disabled || uploading || displayedDocument) return;
    setNotice(null);
    const validation = validateAiDocumentSelection(event.currentTarget.files);
    event.currentTarget.value = "";
    if (!validation.valid) {
      setFileState({ kind: "idle", error: validation.message });
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    setFileState({ kind: "selected", file: validation.file });
  }

  async function upload() {
    if (disabled
      || uploadPendingRef.current
      || (fileState.kind !== "selected" && fileState.kind !== "upload-error")) return;
    const file = fileState.file;
    if (fileState.kind === "upload-error" && !fileState.retryable) return;
    uploadPendingRef.current = true;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setFileState({ kind: "uploading", file });

    try {
      const document = await beeexyPhase10Api.uploadAiDocument(file, controller.signal);
      if (controller.signal.aborted) return;
      setUploadedFilename(file.name);
      onFilenameChangeRef.current?.(file.name);
      setExpiredDocument(null);
      setFileState({ kind: "idle" });
      setNotice("Document uploaded and available temporarily.");
      onChangeRef.current(document);
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      const mapped = aiDocumentUploadError(caught);
      setFileState({
        kind: "upload-error",
        file,
        message: mapped.message,
        retryable: mapped.retryable,
      });
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      uploadPendingRef.current = false;
    }
  }

  function clearLocalSelection() {
    if (uploading) return;
    setFileState({ kind: "idle" });
    setNotice(null);
  }

  function handleRemoved(intent: RemoveIntent, outcome: "removed" | "unavailable") {
    setExpiredDocument(null);
    setUploadedFilename(null);
    onFilenameChangeRef.current?.(null);
    setFileState({ kind: "idle" });
    setRemoveIntent(null);
    onChangeRef.current(null);
    setNotice(outcome === "unavailable"
      ? "That temporary document was already unavailable and was cleared from this selection."
      : intent === "replace"
        ? "Document removed. Choose one replacement file."
        : "Temporary document removed.");
  }

  return (
    <section
      aria-busy={uploading || undefined}
      className="ai-document-uploader"
      aria-labelledby={`${inputId}-title`}
    >
      <header className="ai-document-uploader-heading">
        <span aria-hidden="true"><Icon name="document" size={19} /></span>
        <div>
          <p className="eyebrow">Temporary document</p>
          <h2 id={`${inputId}-title`}>Add one report for review</h2>
          <p id={`${inputId}-requirements`}>Text-based PDF or UTF-8 TXT · up to 25 MiB</p>
        </div>
      </header>

      {notice && <div className="ai-document-notice" data-ai-document-notice role="status" tabIndex={-1}><Icon name="check" size={16} /><p>{notice}</p></div>}

      {displayedDocument ? (
        <UploadedDocumentCard
          document={displayedDocument}
          expired={isExpired}
          filename={displayedFilename}
          onRemove={() => setRemoveIntent("remove")}
          onReplace={() => setRemoveIntent("replace")}
          disabled={disabled}
        />
      ) : (
        <div className="ai-document-selection">
          <input
            accept={AI_DOCUMENT_ACCEPT_ATTRIBUTE}
            aria-describedby={`${inputId}-requirements`}
            aria-label="Select a document — text-based PDF or UTF-8 TXT"
            className="sr-only"
            disabled={disabled || uploading}
            id={inputId}
            onChange={selectFile}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />

          {fileState.kind === "idle" ? (
            <button
              className="ai-document-picker"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <span aria-hidden="true"><Icon name="plus" size={20} /></span>
              <span>
                <strong>Select a document</strong>
                <small>Choose one PDF or TXT file. Scanned PDFs aren’t supported.</small>
              </span>
            </button>
          ) : (
            <SelectedFileCard
              errorRef={errorRef}
              disabled={disabled}
              state={fileState}
              onClear={clearLocalSelection}
              onChoose={() => inputRef.current?.click()}
              onUpload={upload}
            />
          )}

          {fileState.kind === "idle" && fileState.error && (
            <div className="ai-document-error" ref={errorRef} role="alert" tabIndex={-1}>
              <Icon name="info" size={16} /><p>{fileState.error}</p>
            </div>
          )}
        </div>
      )}

      <div className="ai-document-privacy-note">
        <Icon name="shield" size={15} />
        <p>The file stays in this screen’s memory until uploaded. Beeexy stores accepted uploads temporarily and does not provide a document preview.</p>
      </div>

      {removeIntent && displayedDocument && (
        <RemoveTemporaryDocumentDialog
          documentId={displayedDocument.documentId}
          intent={removeIntent}
          onClose={() => setRemoveIntent(null)}
          onRemoved={(outcome) => handleRemoved(removeIntent, outcome)}
        />
      )}
    </section>
  );
}

function SelectedFileCard({
  errorRef,
  disabled,
  state,
  onClear,
  onChoose,
  onUpload,
}: {
  errorRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  state: Exclude<FileState, { kind: "idle" }>;
  onClear: () => void;
  onChoose: () => void;
  onUpload: () => Promise<void>;
}) {
  const busy = state.kind === "uploading";
  const locked = busy || disabled;
  const error = state.kind === "upload-error" ? state : null;
  return (
    <div className="ai-document-local-card">
      <div className="ai-document-file-summary">
        <span aria-hidden="true"><Icon name="document" size={18} /></span>
        <div>
          <strong>{state.file.name}</strong>
          <p>{formatAiDocumentSize(state.file.size)}{state.file.type ? ` · ${state.file.type}` : " · Type checked by Beeexy"}</p>
        </div>
      </div>
      {busy && (
        <div className="ai-document-uploading" role="status">
          <span aria-hidden="true" />
          <p>Uploading and validating with Beeexy…</p>
        </div>
      )}
      {error && (
        <div className="ai-document-error" ref={errorRef} role="alert" tabIndex={-1}>
          <Icon name="info" size={16} /><p>{error.message}</p>
        </div>
      )}
      <div className="ai-document-local-actions">
        <button className="button secondary" disabled={locked} onClick={onChoose} type="button">Choose another</button>
        <button className="text-button" disabled={locked} onClick={onClear} type="button">Cancel</button>
        {(state.kind === "selected" || (error && error.retryable)) && (
          <button className="button primary" disabled={disabled} onClick={() => void onUpload()} type="button">
            {error ? "Try upload again" : "Upload document"}
          </button>
        )}
      </div>
    </div>
  );
}

function UploadedDocumentCard({
  document,
  expired,
  filename,
  onRemove,
  onReplace,
  disabled,
}: {
  document: AiDocument;
  expired: boolean;
  filename: string | null;
  onRemove: () => void;
  onReplace: () => void;
  disabled: boolean;
}) {
  const type = aiDocumentTypeLabel(document.contentType);
  return (
    <article className={`ai-document-ready-card${expired ? " expired" : ""}`} aria-label={expired ? "Expired temporary document" : "Temporary document ready"}>
      <div className="ai-document-ready-status">
        <span aria-hidden="true"><Icon name={expired ? "info" : "check"} size={17} /></span>
        <div>
          <p className="eyebrow">{expired ? "Expired" : "Document ready"}</p>
          <h3>{filename || `Temporary ${type} document`}</h3>
          <p>{type} · {formatAiDocumentSize(document.sizeBytes)}</p>
        </div>
        <span className={`status-badge ${expired ? "cancelled" : "confirmed"}`}>{expired ? "Expired" : document.status}</span>
      </div>
      <dl className="ai-document-lifecycle" aria-label="Temporary document lifecycle">
        <div><dt>Uploaded</dt><dd><time dateTime={document.uploadedAt}>{formatAiDocumentDate(document.uploadedAt)}</time></dd></div>
        <div><dt>Expires</dt><dd><time dateTime={document.expiresAt}>{formatAiDocumentDate(document.expiresAt)}</time></dd></div>
      </dl>
      <p className="ai-document-retention-copy">
        {expired
          ? "This file is no longer usable. Remove it from this selection before choosing another."
          : "Available temporarily until the returned expiry time. Using this screen does not extend retention."}
      </p>
      <div className="ai-document-ready-actions">
        <button className="button secondary" disabled={disabled} onClick={onReplace} type="button">
          Replace document
        </button>
        <button className="text-button danger-text" disabled={disabled} onClick={onRemove} type="button">
          Remove document
        </button>
      </div>
    </article>
  );
}

function RemoveTemporaryDocumentDialog({
  documentId,
  intent,
  onClose,
  onRemoved,
}: {
  documentId: string;
  intent: RemoveIntent;
  onClose: () => void;
  onRemoved: (outcome: "removed" | "unavailable") => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keepRef.current?.focus();
    return () => {
      controllerRef.current?.abort();
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>("[data-ai-document-notice]")?.focus();
    };
  }, []);

  async function remove() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    let handedOff = false;
    try {
      await beeexyPhase10Api.deleteAiDocument(documentId, controller.signal);
      if (!controller.signal.aborted) {
        handedOff = true;
        onRemoved("removed");
      }
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      if (caught instanceof BeeexyApiError && caught.status === 404) {
        handedOff = true;
        onRemoved("unavailable");
        return;
      }
      setError(aiDocumentDeleteError(caught));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      pendingRef.current = false;
      if (!handedOff) setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [tabindex]:not([tabindex='-1'])",
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

  const replacing = intent === "replace";
  return (
    <div className="patient-dialog-backdrop ai-document-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <section
        aria-busy={pending}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="patient-dialog ai-document-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <span aria-hidden="true"><Icon name="document" size={22} /></span>
        <p className="eyebrow">Temporary upload</p>
        <h2 id={titleId}>{replacing ? "Replace this document?" : "Remove this document?"}</h2>
        <p id={descriptionId}>{replacing
          ? "Beeexy must remove the current temporary upload before you can choose its replacement."
          : "Beeexy will remove this temporary upload. This does not make claims about retained lifecycle records."}</p>
        {error && <div className="ai-document-error" role="alert"><Icon name="info" size={16} /><p>{error}</p></div>}
        <div className="ai-document-dialog-actions">
          <button className="button secondary" disabled={pending} onClick={onClose} ref={keepRef} type="button">Keep document</button>
          <button aria-busy={pending} className="button danger" disabled={pending} onClick={() => void remove()} type="button">
            {pending ? "Removing…" : replacing ? "Remove and choose another" : "Remove document"}
          </button>
        </div>
      </section>
    </div>
  );
}
