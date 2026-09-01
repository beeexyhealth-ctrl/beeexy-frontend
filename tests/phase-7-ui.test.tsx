// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicDetail } from "@/features/clinics/clinic-detail";
import { ClinicDirectory } from "@/features/clinics/clinic-directory";
import { DoctorDirectory } from "@/features/doctors/doctor-directory";
import { DoctorProfile } from "@/features/doctors/doctor-profile";
import type { ClinicDetail as ClinicDetailContract, ClinicSummary, DoctorMatchFactor, DoctorSearchItem } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ status: "unauthenticated" }) }));
vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({
    activePatient: null,
    bootstrapStatus: "idle",
    patients: [],
    refreshPatients: vi.fn(),
    selectActivePatient: vi.fn(() => false),
  }),
}));

const amber: DoctorSearchItem = {
  doctorId: "71020000-0000-4200-8000-000000000021",
  code: "demo-doctor-amber",
  displayName: "Synthetic Demo Doctor Amber",
  specialties: [{ code: "demo-specialty-general", name: "Synthetic General Care" }],
  languages: [{ code: "demo-language-en", name: "Synthetic English Capability" }],
  affiliations: [{
    clinicId: "71020000-0000-4000-8000-000000000001",
    clinicCode: "demo-clinic-aurora",
    clinicName: "Synthetic Demo Clinic Aurora",
    location: { locationId: "location-1", name: "Synthetic Aurora Central Location", locality: "Demo Central", administrativeArea: "Synthetic Demo Region", country: "Synthetic Demo Country", timeZone: "America/Lima" },
  }],
  storedInsuranceParticipations: [{ code: "demo-plan-amber", name: "Synthetic Stored Plan Amber" }],
  credentials: [{ name: "Synthetic Demo Dataset Credential Amber" }],
};

const matchedFactor: DoctorMatchFactor = {
  factorCode: "specialty_exact",
  semanticsVersion: "exact_canonical_doctor_specialty_relationship_v1",
  configuredWeightPoints: 25,
  state: "matched",
  contributionPoints: 25,
  explanationCode: "demo_match.specialty_exact.matched",
  explanationData: [{ key: "specialtyCode", value: "demo-specialty-general" }],
};

const blue: DoctorSearchItem = {
  ...amber,
  doctorId: "71020000-0000-4200-8000-000000000022",
  code: "demo-doctor-blue",
  displayName: "Synthetic Demo Doctor Blue",
  languages: [{ code: "demo-language-es", name: "Synthetic Spanish Capability" }],
  storedInsuranceParticipations: [{ code: "demo-plan-blue", name: "Synthetic Stored Plan Blue" }],
  credentials: [],
  match: {
    ruleVersion: "2026.08.29-demo.1",
    matchScore: 37,
    factors: [
      matchedFactor,
      { ...matchedFactor, factorCode: "language_exact", semanticsVersion: "exact_canonical_doctor_language_relationship_v1", explanationCode: "demo_match.language_exact.matched", explanationData: [{ key: "languageCode", value: "demo-language-es" }] },
      { ...matchedFactor, factorCode: "location_exact", semanticsVersion: "exact_same_eligible_affiliation_location_fields_v1", explanationCode: "demo_match.location_exact.matched", explanationData: [{ key: "locality", value: "Demo Harbor" }, { key: "administrativeArea", value: "Synthetic Demo Region" }, { key: "country", value: "Synthetic Demo Country" }] },
      { ...matchedFactor, factorCode: "stored_insurance_participation_exact", semanticsVersion: "exact_stored_doctor_insurance_participation_v1", explanationCode: "demo_match.stored_insurance_participation_exact.matched", explanationData: [{ key: "insurancePlanCode", value: "demo-plan-blue" }] },
    ],
  },
};

const aurora: ClinicSummary = { clinicId: "71020000-0000-4000-8000-000000000001", code: "demo-clinic-aurora", name: "Synthetic Demo Clinic Aurora" };
const mosaic: ClinicSummary = { clinicId: "71020000-0000-4000-8000-000000000002", code: "demo-clinic-mosaic", name: "Synthetic Demo Clinic Mosaic" };
const clinicDetail: ClinicDetailContract = {
  ...aurora,
  locations: [{ locationId: "location-1", name: "Synthetic Aurora Central Location", locality: "Demo Central", administrativeArea: "Synthetic Demo Region", country: "Synthetic Demo Country", timeZone: "America/Lima" }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.spyOn(beeexyPhase7Api, "searchDoctors").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(beeexyPhase7Api, "getDoctor").mockResolvedValue(amber);
  vi.spyOn(beeexyPhase7Api, "listClinics").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(beeexyPhase7Api, "getClinic").mockResolvedValue(clinicDetail);
  vi.spyOn(beeexyPhase8Api, "listDoctorSlots").mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 7 doctor directory", () => {
  it("shows initial loading, preserves neutral backend order, and omits match UI", async () => {
    const pending = deferred<{ items: DoctorSearchItem[]; nextCursor: null }>();
    vi.mocked(beeexyPhase7Api.searchDoctors).mockReturnValue(pending.promise);
    render(<DoctorDirectory />);
    expect(screen.getByRole("status", { name: "Loading directory" })).toBeInTheDocument();

    pending.resolve({ items: [blueWithoutMatch(), amber], nextCursor: null });
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Synthetic Demo Doctor Blue", "Synthetic Demo Doctor Amber"]);
    expect(screen.queryByText("Match score")).not.toBeInTheDocument();
    expect(beeexyPhase7Api.searchDoctors).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20, cursor: undefined }), expect.any(AbortSignal));
  });

  it("sends exact filters, keeps returned rank, and renders backend score and factors without recalculation", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors)
      .mockResolvedValueOnce({ items: [amber], nextCursor: null })
      .mockResolvedValueOnce({ items: [blue, { ...amber, match: blue.match }], nextCursor: null });
    render(<DoctorDirectory />);
    await screen.findByText(amber.displayName);

    fireEvent.click(screen.getByRole("button", { name: "Primary Care" }));
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "demo-language-es" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Demo Harbor" } });
    fireEvent.change(screen.getByLabelText("Insurance"), { target: { value: "demo-plan-blue" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(await screen.findAllByText("37 / 100")).toHaveLength(2);
    expect(screen.getByText("Synthetic Demo Doctor Blue")).toBeInTheDocument();
    expect(screen.getAllByText("Specialty")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Primary Care").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Spanish").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Demo Harbor").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Blue Plan").length).toBeGreaterThan(1);
    expect(screen.queryByText("demo-specialty-general")).not.toBeInTheDocument();
    expect(screen.queryByText("demo-language-es")).not.toBeInTheDocument();
    expect(screen.queryByText("demo-plan-blue")).not.toBeInTheDocument();
    expect(vi.mocked(beeexyPhase7Api.searchDoctors).mock.calls[1][0]).toEqual(expect.objectContaining({ specialtyCode: "demo-specialty-general", languageCode: "demo-language-es", locality: "Demo Harbor", administrativeArea: "Synthetic Demo Region", country: "Synthetic Demo Country", insurancePlanCode: "demo-plan-blue", pageSize: 20, cursor: undefined }));
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Synthetic Demo Doctor Blue", "Synthetic Demo Doctor Amber"]);
  });

  it("appends neutral pages with the exact opaque cursor and unchanged criteria", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors)
      .mockResolvedValueOnce({ items: [amber], nextCursor: "opaque-neutral-cursor" })
      .mockResolvedValueOnce({ items: [blueWithoutMatch()], nextCursor: null });
    render(<DoctorDirectory />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more doctors" }));
    await screen.findByText("Synthetic Demo Doctor Blue");

    expect(vi.mocked(beeexyPhase7Api.searchDoctors).mock.calls[1][0]).toEqual(expect.objectContaining({ cursor: "opaque-neutral-cursor", pageSize: 20 }));
    expect(screen.getAllByText(amber.displayName)).toHaveLength(1);
    expect(screen.queryByText("opaque-neutral-cursor")).not.toBeInTheDocument();
  });

  it("cancels an obsolete request so stale results cannot replace new filters", async () => {
    const oldRequest = deferred<{ items: DoctorSearchItem[]; nextCursor: null }>();
    vi.mocked(beeexyPhase7Api.searchDoctors)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ items: [blue], nextCursor: null });
    render(<DoctorDirectory />);
    fireEvent.click(screen.getByRole("button", { name: "Primary Care" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(await screen.findByText(blue.displayName)).toBeInTheDocument();
    expect(vi.mocked(beeexyPhase7Api.searchDoctors).mock.calls[0][1]?.aborted).toBe(true);
    oldRequest.resolve({ items: [amber], nextCursor: null });
    await waitFor(() => expect(screen.queryByText(amber.displayName)).not.toBeInTheDocument());
  });

  it("treats valid empty matching results as normal and clears back to neutral mode", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors)
      .mockResolvedValueOnce({ items: [amber], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [amber], nextCursor: null });
    render(<DoctorDirectory />);
    await screen.findByText(amber.displayName);
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Demo Harbor" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText("No doctors match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Browse the available demo profiles")).toBeInTheDocument();
    expect(screen.queryByText("Match score")).not.toBeInTheDocument();
  });

  it("resets an invalid ranked cursor and restarts from page one with the same filters", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors)
      .mockResolvedValueOnce({ items: [amber], nextCursor: null })
      .mockResolvedValueOnce({ items: [blue], nextCursor: "ranked-opaque" })
      .mockRejectedValueOnce(new BeeexyApiError(422, { problem: { errorCode: "doctor_directory.cursor_invalid" } }))
      .mockResolvedValueOnce({ items: [blue], nextCursor: null });
    render(<DoctorDirectory />);
    await screen.findByText(amber.displayName);
    fireEvent.click(screen.getByRole("button", { name: "Primary Care" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more doctors" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restart search" }));
    await screen.findByText(blue.displayName);

    expect(vi.mocked(beeexyPhase7Api.searchDoctors).mock.calls[2]?.[0]?.cursor).toBe("ranked-opaque");
    expect(vi.mocked(beeexyPhase7Api.searchDoctors).mock.calls[3]?.[0]).toEqual(expect.objectContaining({ specialtyCode: "demo-specialty-general", cursor: undefined }));
  });

  it("shows a recoverable generic transport error without raw details", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors).mockRejectedValue(new BeeexyNetworkError());
    render(<DoctorDirectory />);
    expect(await screen.findByText("We couldn’t load this directory.")).toBeInTheDocument();
    expect(screen.queryByText("Beeexy could not reach the server.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("does not expose unsupported or misleading Phase 7 claims", async () => {
    vi.mocked(beeexyPhase7Api.searchDoctors).mockResolvedValue({ items: [blue], nextCursor: null });
    render(<DoctorDirectory />);
    await screen.findByText(blue.displayName);
    for (const claim of ["Best doctor", "AI recommended", "Clinical confidence", "Guaranteed coverage", "In-network verified", "Government verified", "Rating", "Reviews", "Nearest doctor", "Book appointment"]) {
      expect(screen.queryByText(claim, { exact: false })).not.toBeInTheDocument();
    }
    for (const developerCopy of ["Exact filters", "taxonomy lookup", "exact casing", "Backend-ranked", "Stored-value filters"]) {
      expect(screen.queryByText(developerCopy, { exact: false })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /view doctor details/i })).toHaveAttribute("href", `/doctors/${blue.doctorId}`);
  });
});

describe("Phase 7 doctor detail", () => {
  it("renders a patient-facing doctor hero and friendly overview badges", async () => {
    render(<DoctorProfile doctorId={amber.doctorId} />);
    const doctorName = await screen.findByRole("heading", { name: amber.displayName });
    expect(doctorName.closest(".detail-profile-hero")).not.toBeNull();
    expect(beeexyPhase7Api.getDoctor).toHaveBeenCalledWith(amber.doctorId, expect.any(AbortSignal));
    expect(screen.getAllByText("Primary Care").length).toBeGreaterThan(0);
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Insurance", "Locations", "Credentials"]);
    expect(screen.getByRole("complementary", { name: "Demo directory notice" })).toHaveTextContent("synthetic demo data");
    expect(screen.queryByText(amber.code)).not.toBeInTheDocument();
    expect(screen.queryByText("demo-specialty-general")).not.toBeInTheDocument();
    expect(screen.queryByText("Match score")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /book/i })).not.toBeInTheDocument();
    for (const unsupportedClaim of ["Top Rated", "Highly recommended", "Next available", "years of experience", "miles away"]) {
      expect(screen.queryByText(unsupportedClaim, { exact: false })).not.toBeInTheDocument();
    }
  });

  it("switches every doctor detail tab with keyboard support and keeps demo semantics explicit", async () => {
    render(<DoctorProfile doctorId={amber.doctorId} />);
    await screen.findByRole("heading", { name: amber.displayName });

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    expect(overviewTab).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("tab", { name: "Insurance" }));
    expect(screen.getByRole("tab", { name: "Insurance" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Amber Plan");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("not live eligibility, coverage, benefits, or network verification");
    expect(screen.queryByText("demo-plan-amber")).not.toBeInTheDocument();

    const insuranceTab = screen.getByRole("tab", { name: "Insurance" });
    insuranceTab.focus();
    fireEvent.keyDown(insuranceTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Locations" })).toHaveAttribute("aria-selected", "true");
    const locationsPanel = screen.getByRole("tabpanel");
    expect(within(locationsPanel).getByText("Synthetic Demo Clinic Aurora")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Synthetic Aurora Central Location")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Demo Central")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Time zone · America/Lima")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Credentials" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Synthetic Demo Dataset Credential Amber");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("not external professional verification");

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Specialties");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Languages");
  });

  it("uses one concealed unavailable state for a doctor 404", async () => {
    vi.mocked(beeexyPhase7Api.getDoctor).mockRejectedValue(new BeeexyApiError(404, { problem: { detail: "unpublished" } }));
    render(<DoctorProfile doctorId="missing" />);
    expect(await screen.findByText("This doctor is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("unpublished")).not.toBeInTheDocument();
  });
});

describe("Phase 7 clinics", () => {
  it("filters, paginates, and appends clinic summaries without detail fan-out", async () => {
    vi.mocked(beeexyPhase7Api.listClinics)
      .mockResolvedValueOnce({ items: [aurora], nextCursor: null })
      .mockResolvedValueOnce({ items: [aurora], nextCursor: "clinic-opaque" })
      .mockResolvedValueOnce({ items: [mosaic], nextCursor: null });
    render(<ClinicDirectory />);
    await screen.findByText(aurora.name);
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Demo Central" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more clinics" }));
    await screen.findByText(mosaic.name);

    expect(vi.mocked(beeexyPhase7Api.listClinics).mock.calls[1][0]).toEqual(expect.objectContaining({ locality: "Demo Central", administrativeArea: "Synthetic Demo Region", country: "Synthetic Demo Country", cursor: undefined }));
    expect(vi.mocked(beeexyPhase7Api.listClinics).mock.calls[2][0]).toEqual(expect.objectContaining({ locality: "Demo Central", cursor: "clinic-opaque" }));
    expect(beeexyPhase7Api.getClinic).not.toHaveBeenCalled();
    expect(screen.queryByText("clinic-opaque")).not.toBeInTheDocument();
    expect(screen.queryByText(aurora.code)).not.toBeInTheDocument();
  });

  it("renders a normal empty clinic state", async () => {
    render(<ClinicDirectory />);
    expect(await screen.findByText("No clinics are available.")).toBeInTheDocument();
  });

  it("renders a normal filtered clinic empty state without relaxing the selected location", async () => {
    vi.mocked(beeexyPhase7Api.listClinics)
      .mockResolvedValueOnce({ items: [aurora], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<ClinicDirectory />);
    await screen.findByText(aurora.name);
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Demo Harbor" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    expect(await screen.findByText("No clinics match these filters.")).toBeInTheDocument();
    expect(vi.mocked(beeexyPhase7Api.listClinics).mock.calls[1][0]).toEqual(expect.objectContaining({ locality: "Demo Harbor", administrativeArea: "Synthetic Demo Region", country: "Synthetic Demo Country" }));
    expect(screen.queryByText("Exact filters", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("exact casing", { exact: false })).not.toBeInTheDocument();
  });

  it("clears an invalid clinic cursor and can restart the same exact search", async () => {
    vi.mocked(beeexyPhase7Api.listClinics)
      .mockResolvedValueOnce({ items: [aurora], nextCursor: "clinic-stale" })
      .mockRejectedValueOnce(new BeeexyApiError(422, { problem: { errorCode: "clinic_directory.cursor_invalid" } }))
      .mockResolvedValueOnce({ items: [aurora], nextCursor: null });
    render(<ClinicDirectory />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more clinics" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restart search" }));
    await screen.findByText(aurora.name);

    expect(vi.mocked(beeexyPhase7Api.listClinics).mock.calls[1]?.[0]?.cursor).toBe("clinic-stale");
    expect(vi.mocked(beeexyPhase7Api.listClinics).mock.calls[2]?.[0]?.cursor).toBeUndefined();
  });

  it("renders a patient-facing clinic hero and friendly overview", async () => {
    render(<ClinicDetail clinicId={aurora.clinicId} />);
    const clinicName = await screen.findByRole("heading", { name: aurora.name });
    expect(clinicName.closest(".detail-profile-hero")).not.toBeNull();
    expect(beeexyPhase7Api.getClinic).toHaveBeenCalledWith(aurora.clinicId, expect.any(AbortSignal));
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Locations"]);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Clinic overview");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Demo Central");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("America/Lima");
    expect(screen.getByRole("complementary", { name: "Demo directory notice" })).toHaveTextContent("not real-world verification");
    expect(screen.queryByText(aurora.code)).not.toBeInTheDocument();
    for (const unsupportedClaim of ["Rating", "Opening hours", "Book appointment", "miles away", "Website", "Phone"]) {
      expect(screen.queryByText(unsupportedClaim, { exact: false })).not.toBeInTheDocument();
    }
  });

  it("switches to clinic locations with the keyboard and renders stored location fields", async () => {
    render(<ClinicDetail clinicId={aurora.clinicId} />);
    await screen.findByRole("heading", { name: aurora.name });

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Locations" })).toHaveAttribute("aria-selected", "true");
    const locationsPanel = screen.getByRole("tabpanel");
    expect(within(locationsPanel).getByRole("heading", { name: "Locations" })).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Synthetic Aurora Central Location")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Demo Central")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Synthetic Demo Region · Synthetic Demo Country")).toBeInTheDocument();
    expect(within(locationsPanel).getByText("Time zone · America/Lima")).toBeInTheDocument();
  });

  it("uses one concealed unavailable state for a clinic 404", async () => {
    vi.mocked(beeexyPhase7Api.getClinic).mockRejectedValue(new BeeexyApiError(404, { problem: { detail: "hidden clinic" } }));
    render(<ClinicDetail clinicId="missing" />);
    expect(await screen.findByText("This clinic is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("hidden clinic")).not.toBeInTheDocument();
  });
});

function blueWithoutMatch(): DoctorSearchItem {
  const profile: DoctorSearchItem = { ...blue };
  delete profile.match;
  return profile;
}
