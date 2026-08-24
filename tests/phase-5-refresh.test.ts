// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { CLINICAL_HISTORY_REFRESH_EVENT, clinicalHistoryRefreshPatientId, notifyClinicalHistoryChanged } from "@/features/clinical-history/clinical-history-refresh";

describe("Phase 4 to Phase 5 refresh handoff", () => {
  it("announces the backend-projected patient history without constructing an event", () => {
    const listener = vi.fn((event: Event) => clinicalHistoryRefreshPatientId(event));
    window.addEventListener(CLINICAL_HISTORY_REFRESH_EVENT, listener);
    notifyClinicalHistoryChanged("primary-patient");
    window.removeEventListener(CLINICAL_HISTORY_REFRESH_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toBe("primary-patient");
  });
});
