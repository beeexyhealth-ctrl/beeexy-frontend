import { describe, expect, it } from "vitest";
import { appendUniqueHistoryItems, amendmentErrorMessage, historyErrorMessage, isInvalidHistoryCursor } from "@/features/clinical-history/clinical-history-state";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

function item(eventId: string) {
  return {
    eventId,
    eventType: "COMPLETED_PRE_TRIAGE" as const,
    occurredAt: "2026-08-24T14:30:00Z",
    recordedAt: "2026-08-24T14:30:00Z",
    source: { type: "PRE_TRIAGE_EPISODE" as const, id: `episode-${eventId}`, questionnaireVersionId: "q", clinicalRuleSetVersionId: "r" },
  };
}

describe("Phase 5 client state rules", () => {
  it("appends all pages without a ten-record cap and defensively deduplicates event IDs", () => {
    const first = Array.from({ length: 11 }, (_, index) => item(`event-${index}`));
    const merged = appendUniqueHistoryItems(first, [item("event-10"), item("event-11"), item("event-12")]);
    expect(merged).toHaveLength(13);
    expect(merged.map((entry) => entry.eventId)).toEqual([...first.map((entry) => entry.eventId), "event-11", "event-12"]);
  });

  it("recognizes only the stable invalid-cursor code and uses a fresh-page recovery message", () => {
    const invalidCursor = new BeeexyApiError(422, { problem: { errorCode: "clinical_history.cursor_invalid" } });
    expect(isInvalidHistoryCursor(invalidCursor)).toBe(true);
    expect(isInvalidHistoryCursor(new BeeexyApiError(422))).toBe(false);
    expect(historyErrorMessage(invalidCursor)).toMatch(/newest record/i);
  });

  it("keeps concealed 404 and uncertain amendment failures privacy safe", () => {
    expect(historyErrorMessage(new BeeexyApiError(404))).toBe("This record is no longer available.");
    expect(amendmentErrorMessage(new BeeexyNetworkError())).toMatch(/couldn’t confirm/i);
    expect(amendmentErrorMessage(new BeeexyApiError(409))).not.toMatch(/idempotency|key|uuid/i);
  });
});
