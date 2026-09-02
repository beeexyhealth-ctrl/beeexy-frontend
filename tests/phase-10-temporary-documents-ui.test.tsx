// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTemporaryDocumentUploader } from "@/features/second-opinion/ai-temporary-document-uploader";
import type { AiDocument } from "@/lib/beeexy-api/contracts";
import { AI_DOCUMENT_MAX_SIZE_BYTES, beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const documentId = "e8371933-f732-42d7-a0b2-a17d2c6b3825";
const uploadedDocument: AiDocument = {
  documentId,
  contentType: "text/plain",
  sizeBytes: 4172,
  uploadedAt: "2026-09-02T15:20:00+00:00",
  expiresAt: "2026-09-03T15:20:00+00:00",
  status: "active",
};

function ControlledUploader({
  initialValue = null,
  onValue,
}: {
  initialValue?: AiDocument | null;
  onValue?: (document: AiDocument | null) => void;
}) {
  const [value, setValue] = useState<AiDocument | null>(initialValue);
  return (
    <>
      <AiTemporaryDocumentUploader
        onChange={(document) => {
          setValue(document);
          onValue?.(document);
        }}
        value={value}
      />
      <output data-testid="selected-document-id" hidden>{value?.documentId ?? "none"}</output>
    </>
  );
}

function textFile(name = "report.txt", contents = "Useful UTF-8 text") {
  return new File([contents], name, { type: "text/plain" });
}

function pdfFile(name = "medical-report.pdf") {
  return new File(["%PDF-1.7 useful embedded text"], name, { type: "application/pdf" });
}

function select(file: File) {
  fireEvent.change(screen.getByLabelText(/Select a document/i), { target: { files: [file] } });
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

beforeEach(() => {
  vi.spyOn(beeexyPhase10Api, "uploadAiDocument").mockResolvedValue(uploadedDocument);
  vi.spyOn(beeexyPhase10Api, "deleteAiDocument").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Phase 10.3 Temporary Document selection", () => {
  it("starts with one accessible PDF/TXT picker and no active document", () => {
    render(<ControlledUploader />);

    const input = screen.getByLabelText(/Select a document/i);
    expect(input).toHaveAttribute("type", "file");
    expect(input).not.toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", ".pdf,.txt,application/pdf,text/plain");
    expect(screen.getByText("Text-based PDF or UTF-8 TXT · up to 25 MiB")).toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent("none");
  });

  it.each([
    ["PDF", pdfFile(), "application/pdf"],
    ["TXT", textFile(), "text/plain"],
    ["ambiguous browser MIME", new File(["text"], "notes.txt", { type: "" }), "Type checked by Beeexy"],
  ])("accepts a supported %s selection without reading its contents", (_label, file, metadata) => {
    const readText = vi.spyOn(FileReader.prototype, "readAsText");
    const readBuffer = vi.spyOn(FileReader.prototype, "readAsArrayBuffer");
    render(<ControlledUploader />);

    select(file);

    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(metadata))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload document" })).toBeEnabled();
    expect(readText).not.toHaveBeenCalled();
    expect(readBuffer).not.toHaveBeenCalled();
  });

  it("shows the selected filename and human-readable size safely", () => {
    render(<ControlledUploader />);
    select(textFile("patient <script>alert(1)</script>.txt", "twelve bytes"));

    expect(screen.getByText("patient <script>alert(1)</script>.txt")).toBeInTheDocument();
    expect(screen.queryByText("alert(1)", { selector: "script" })).not.toBeInTheDocument();
    expect(screen.getByText(/12 bytes · text\/plain/i)).toBeInTheDocument();
  });

  it.each([
    [new File(["content"], "report.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "file type isn’t supported"],
    [new File(["content"], "report.pdf", { type: "image/png" }), "file type isn’t supported"],
    [new File(["content"], "   ", { type: "text/plain" }), "file type isn’t supported"],
  ])("rejects unsupported or mismatched local files", (file, message) => {
    render(<ControlledUploader />);
    select(file);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(beeexyPhase10Api.uploadAiDocument).not.toHaveBeenCalled();
  });

  it("rejects files larger than the shared 25 MiB byte limit", () => {
    const file = textFile("large.txt");
    Object.defineProperty(file, "size", { value: AI_DOCUMENT_MAX_SIZE_BYTES + 1 });
    render(<ControlledUploader />);

    select(file);

    expect(screen.getByRole("alert")).toHaveTextContent("larger than 25 MiB");
    expect(beeexyPhase10Api.uploadAiDocument).not.toHaveBeenCalled();
  });

  it("rejects a synthetic multi-file selection even though the picker is single-file", () => {
    render(<ControlledUploader />);
    fireEvent.change(screen.getByLabelText(/Select a document/i), {
      target: { files: [textFile("one.txt"), textFile("two.txt")] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("only one document");
  });

  it("contains no browser parsing, OCR, content persistence, analytics, or direct transport implementation", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      "src/features/second-opinion/ai-temporary-document-uploader.tsx",
    ), "utf8");

    expect(source).not.toMatch(/FileReader|pdfjs|tesseract|localStorage|sessionStorage|indexedDB|analytics/i);
    expect(source).not.toMatch(/fetch\(|FormData|requestSecondOpinion|blob:/);
  });
});

describe("Phase 10.3 Temporary Document upload", () => {
  it("passes the exact selected File and an AbortSignal once while showing upload progress", async () => {
    const pending = deferred<AiDocument>();
    vi.mocked(beeexyPhase10Api.uploadAiDocument).mockReturnValue(pending.promise);
    const file = textFile();
    render(<ControlledUploader />);
    select(file);
    const uploadButton = screen.getByRole("button", { name: "Upload document" });
    fireEvent.click(uploadButton);
    fireEvent.click(uploadButton);

    expect(beeexyPhase10Api.uploadAiDocument).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.uploadAiDocument).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(screen.getByRole("status")).toHaveTextContent("Uploading and validating");
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another" })).toBeDisabled();

    await act(async () => pending.resolve(uploadedDocument));
  });

  it("renders authoritative safe metadata and retains the document ID for its parent", async () => {
    render(<ControlledUploader />);
    select(textFile("lab-results.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    expect(await screen.findByRole("article", { name: "Temporary document ready" })).toBeInTheDocument();
    expect(screen.getByText("lab-results.txt")).toBeInTheDocument();
    expect(screen.getByText("TXT · 4.1 KiB")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("Document uploaded and available temporarily.")).toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent(documentId);
    expect(document.querySelector(`time[datetime="${uploadedDocument.uploadedAt}"]`)).toBeInTheDocument();
    expect(document.querySelector(`time[datetime="${uploadedDocument.expiresAt}"]`)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Select a document/i)).not.toBeInTheDocument();
  });

  it("aborts an in-flight upload on unmount without reporting a rollback", () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(beeexyPhase10Api.uploadAiDocument).mockImplementation((_file, signal) => {
      capturedSignal = signal;
      return new Promise<AiDocument>(() => undefined);
    });
    const view = render(<ControlledUploader />);
    select(textFile());
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    expect(capturedSignal?.aborted).toBe(false);
    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not persist the File, filename, or returned metadata in browser storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    render(<ControlledUploader />);
    select(textFile("private-health-file.txt"));
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await screen.findByRole("article", { name: "Temporary document ready" });
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it.each([
    [401, undefined, "session has ended"],
    [413, "ai.document.too_large", "25 MiB upload limit"],
    [415, "ai.document.unsupported_media", "text-based PDF or UTF-8 TXT"],
    [422, "ai.document.single_file_required", "exactly one PDF or TXT"],
    [422, "ai.document.empty", "couldn’t validate this file"],
    [422, "ai.document.size_mismatch", "couldn’t validate this file"],
    [422, "ai.document.file_unsafe", "couldn’t verify this document"],
    [422, "ai.document.unusable_text", "couldn’t read usable text"],
  ])("maps upload status %s and code %s to safe product copy", async (status, errorCode, expected) => {
    vi.mocked(beeexyPhase10Api.uploadAiDocument).mockRejectedValue(new BeeexyApiError(status, {
      problem: { errorCode, detail: "storage account malware provider secret" },
    }));
    render(<ControlledUploader />);
    select(textFile());
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByText(/storage account malware provider secret/i)).not.toBeInTheDocument();
    expect(beeexyPhase10Api.uploadAiDocument).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Try upload again" })).not.toBeInTheDocument();
  });

  it.each([
    [new BeeexyNetworkError(), "connection token filename"],
    [new BeeexyApiError(500, { problem: { detail: "provider storage stack trace" } }), "provider storage stack trace"],
  ])("does not automatically retry an ambiguous upload failure", async (failure, rawDetail) => {
    vi.mocked(beeexyPhase10Api.uploadAiDocument).mockRejectedValue(failure);
    render(<ControlledUploader />);
    select(textFile());
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t confirm whether the upload completed");
    expect(screen.queryByText(rawDetail)).not.toBeInTheDocument();
    expect(beeexyPhase10Api.uploadAiDocument).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Try upload again" })).toBeEnabled();
  });
});

describe("Phase 10.3 Temporary Document expiry, deletion, and replacement", () => {
  it("clears the parent selection at the authoritative returned expiry without extending or re-uploading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-02T15:20:00.000Z");
    const expiresSoon = { ...uploadedDocument, expiresAt: "2026-09-02T15:20:01.000Z" };
    const onValue = vi.fn();
    render(<ControlledUploader initialValue={expiresSoon} onValue={onValue} />);

    expect(document.querySelector(`time[datetime="${expiresSoon.expiresAt}"]`)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole("article", { name: "Expired temporary document" })).toBeInTheDocument();
    expect(screen.getByText(/no longer selected for use/i)).toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent("none");
    expect(onValue).toHaveBeenCalledWith(null);
    expect(beeexyPhase10Api.uploadAiDocument).not.toHaveBeenCalled();
  });

  it("removes the exact document once, exposes progress, and clears controlled state after 204", async () => {
    const pending = deferred<void>();
    const onValue = vi.fn();
    vi.mocked(beeexyPhase10Api.deleteAiDocument).mockReturnValue(pending.promise);
    render(<ControlledUploader initialValue={uploadedDocument} onValue={onValue} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove document" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove document" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Removing…" }));

    expect(beeexyPhase10Api.deleteAiDocument).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.deleteAiDocument).toHaveBeenCalledWith(documentId, expect.any(AbortSignal));
    expect(within(dialog).getByRole("button", { name: "Removing…" })).toBeDisabled();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent(documentId);

    await act(async () => pending.resolve());
    expect(screen.getByText("Temporary document removed.")).toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent("none");
    expect(onValue).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText(/Select a document/i)).toBeInTheDocument();
  });

  it("retains metadata when deletion fails and never renders internal details", async () => {
    vi.mocked(beeexyPhase10Api.deleteAiDocument).mockRejectedValue(new BeeexyNetworkError());
    render(<ControlledUploader initialValue={uploadedDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove document" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("current document is still selected");
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent(documentId);
    expect(screen.getByRole("article", { name: "Temporary document ready" })).toBeInTheDocument();
  });

  it("handles concealed missing deletion neutrally and clears stale selection", async () => {
    vi.mocked(beeexyPhase10Api.deleteAiDocument).mockRejectedValue(new BeeexyApiError(404, {
      problem: { errorCode: "ai.document.not_found", detail: "owned by another account" },
    }));
    render(<ControlledUploader initialValue={uploadedDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove document" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove document" }));

    expect(await screen.findByText(/already unavailable and was cleared/i)).toBeInTheDocument();
    expect(screen.queryByText(/another account/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent("none");
  });

  it("deletes the current server document before enabling one replacement", async () => {
    render(<ControlledUploader initialValue={uploadedDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Replace document" }));
    expect(screen.queryByLabelText(/Select a document/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove and choose another" }));

    await screen.findByText("Document removed. Choose one replacement file.");
    expect(beeexyPhase10Api.deleteAiDocument).toHaveBeenCalledWith(documentId, expect.any(AbortSignal));
    expect(screen.getByLabelText(/Select a document/i)).toBeInTheDocument();

    select(pdfFile("replacement.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
    expect(await screen.findByRole("article", { name: "Temporary document ready" })).toHaveTextContent("replacement.pdf");
    expect(beeexyPhase10Api.uploadAiDocument).toHaveBeenCalledOnce();
  });

  it("keeps the original document when replacement deletion fails", async () => {
    vi.mocked(beeexyPhase10Api.deleteAiDocument).mockRejectedValue(new BeeexyApiError(500, {
      problem: { detail: "private blob storage response" },
    }));
    render(<ControlledUploader initialValue={uploadedDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Replace document" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove and choose another" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("current document is still selected");
    expect(screen.queryByLabelText(/Select a document/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-document-id")).toHaveTextContent(documentId);
    expect(screen.queryByText("private blob storage response")).not.toBeInTheDocument();
  });
});
