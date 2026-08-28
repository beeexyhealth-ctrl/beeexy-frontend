// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPreTriageShell, EDUCATIONAL_VIDEO_REVEAL_DELAY_MS } from "@/features/pre-triage-chat/chat-shell";
import { useChatProgression } from "@/features/pre-triage-chat/use-chat-progression";
import { PreTriageReviewSummary } from "@/features/pre-triage/pre-triage-flow";
import { applyEducationalVideoResolution } from "@/features/pre-triage/pre-triage-provider";
import type { EducationalVideoPresentation } from "@/features/pre-triage/pre-triage-provider";
import type {
  ConversationQuestionInteraction,
  EducationalVideoOfferInteraction,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
} from "@/lib/beeexy-api/contracts";

const videoUrl = "https://media.example.test/backend-provided/headache.mp4";

const videoOffer: EducationalVideoOfferInteraction = {
  type: "EDUCATIONAL_VIDEO_OFFER",
  field: "educationalVideoDecision",
  prompt: "Would you like to watch a short video where a medical professional explains more about your symptoms?",
  inputType: "SINGLE_SELECT",
  required: false,
  constraints: {
    minimumSelections: 1,
    maximumSelections: 1,
    allowsEmptySelection: false,
  },
  options: [
    { value: "WATCH", label: "Yes, show me the video" },
    { value: "SKIP", label: "No, continue with assessment" },
  ],
  video: {
    id: "headache",
    title: "Understanding Headaches",
    url: videoUrl,
  },
};

const durationQuestion: Extract<ConversationQuestionInteraction, { inputType: "DURATION" }> = {
  type: "QUESTION",
  field: "duration",
  questionCode: "DURATION",
  prompt: "How long ago did the headache start?",
  inputType: "DURATION",
  required: true,
  constraints: {
    minimum: 0,
    exclusiveMinimum: true,
    allowedUnits: ["HOURS", "DAYS"],
  },
  options: [],
};

function projection(
  interaction: PreTriageConversationProjection["nextInteraction"],
  pathway: PreTriageConversationProjection["pathway"] = { code: "HEADACHE", label: "Headache" },
): PreTriageConversationProjection {
  return {
    sessionId: "session-video",
    sessionStatus: "ACTIVE",
    state: "IN_PROGRESS",
    expiresAt: "2099-01-01T00:00:00Z",
    pathway,
    questionnaire: { code: "headache-demo", version: "v1" },
    ruleSet: { code: "headache-neutral", version: "v1" },
    progress: { completed: 0, total: 3, percentage: 0 },
    acceptedValues: {},
    nextInteraction: interaction,
  };
}

function presentation(decision: "WATCH" | "SKIP"): EducationalVideoPresentation {
  return {
    decision,
    interaction: videoOffer,
    optionLabel: videoOffer.options.find((option) => option.value === decision)!.label,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Educational video offer conversation UI", () => {
  it("handles the exact interaction discriminator and renders backend prompt and labels", () => {
    const onVideoDecision = vi.fn();
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(videoOffer)}
        onVideoDecision={onVideoDecision}
      />,
    );

    expect(screen.getByText(videoOffer.prompt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, show me the video" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No, continue with assessment" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, show me the video" }));
    expect(onVideoDecision).toHaveBeenCalledWith(videoOffer, "WATCH");
  });

  it("submits SKIP from the backend option without rendering a video", () => {
    const onVideoDecision = vi.fn();
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(videoOffer)}
        onVideoDecision={onVideoDecision}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "No, continue with assessment" }));

    expect(onVideoDecision).toHaveBeenCalledWith(videoOffer, "SKIP");
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("keeps WATCH in the transcript, consumes the backend URL, and reveals the question after the presentation delay", () => {
    vi.useFakeTimers();
    render(
      <ChatPreTriageShell
        backHref="/home"
        educationalVideoPresentation={presentation("WATCH")}
        projection={projection(durationQuestion)}
      />,
    );

    const video = screen.getByLabelText("Understanding Headaches") as HTMLVideoElement;
    const source = video.querySelector("source");
    expect(screen.getByText(videoOffer.prompt)).toBeInTheDocument();
    expect(screen.getByText("Yes, show me the video")).toBeInTheDocument();
    expect(source).toHaveAttribute("src", videoUrl);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("autoplay");
    expect(screen.queryByText(durationQuestion.prompt)).not.toBeInTheDocument();

    fireEvent.ended(video);
    expect(screen.queryByText(durationQuestion.prompt)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(EDUCATIONAL_VIDEO_REVEAL_DELAY_MS - 1));
    expect(screen.queryByText(durationQuestion.prompt)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(durationQuestion.prompt)).toBeInTheDocument();
    expect(screen.getByLabelText("Understanding Headaches")).toBeInTheDocument();
  });

  it("keeps SKIP in the transcript and reveals the backend question immediately", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        educationalVideoPresentation={presentation("SKIP")}
        projection={projection(durationQuestion)}
      />,
    );

    expect(screen.getByText(videoOffer.prompt)).toBeInTheDocument();
    expect(screen.getByText("No, continue with assessment")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText(durationQuestion.prompt)).toBeInTheDocument();
  });

  it("uses the same backend-authoritative offer after quick and free-text pathway entry", () => {
    const quick = render(<ChatPreTriageShell backHref="/home" projection={projection(videoOffer)} />);
    expect(screen.getAllByText("Headache").length).toBeGreaterThan(0);
    expect(screen.getByText(videoOffer.prompt)).toBeInTheDocument();

    quick.rerender(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(videoOffer)}
        transientUserTurn="I have had a headache since this morning."
      />,
    );
    expect(screen.getByText("I have had a headache since this morning.")).toBeInTheDocument();
    expect(screen.getByText(videoOffer.prompt)).toBeInTheDocument();
  });

  it("follows OTHER_SYMPTOMS when the backend projects no offer", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(durationQuestion, { code: "OTHER_SYMPTOMS", label: "Other symptoms" })}
      />,
    );

    expect(screen.getByText(durationQuestion.prompt)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, show me the video" })).not.toBeInTheDocument();
  });

  it("does not reconstruct a resolved offer or playback state from a refreshed clinical projection", () => {
    render(<ChatPreTriageShell backHref="/home" projection={projection(durationQuestion)} />);

    expect(screen.getByText(durationQuestion.prompt)).toBeInTheDocument();
    expect(screen.queryByText(videoOffer.prompt)).not.toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("keeps WATCH and SKIP out of clinical Review values", () => {
    render(
      <PreTriageReviewSummary
        pathway="HEADACHE"
        answers={{ duration: { value: 2, unit: "DAYS" }, intensity: 5, additionalSymptoms: [] }}
      />,
    );

    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/WATCH|SKIP|show me the video|continue with assessment/i);
  });

  it.each(["WATCH", "SKIP"] as const)("keeps %s separate from clinical acceptedValues", (decision) => {
    const conversation = {
      ...projection(durationQuestion),
      acceptedValues: { duration: { value: 2, unit: "DAYS" as const } },
      progress: { completed: 1, total: 3, percentage: 33 },
    };
    const next = applyEducationalVideoResolution({
      sessionId: "session-video",
      mode: "authenticated",
      pathway: "HEADACHE",
      questionnaireVersion: "v1",
      expiresAt: "2099-01-01T00:00:00Z",
      acceptedAnswers: {},
      pendingClaim: false,
    }, videoOffer, {
      sessionId: "session-video",
      decision,
      resolvedAt: "2026-08-27T18:01:00Z",
      newlyResolved: true,
      conversation,
    });

    expect(next.acceptedAnswers).toEqual({ duration: { value: 2, unit: "DAYS" } });
    expect(next.conversation?.acceptedValues).toEqual({ duration: { value: 2, unit: "DAYS" } });
    expect(next.acceptedAnswers).not.toHaveProperty("educationalVideoDecision");
    expect(JSON.stringify(next.acceptedAnswers)).not.toMatch(/WATCH|SKIP/);
  });
});

function VideoProgressionHarness({ resolveVideoOffer }: { resolveVideoOffer: () => Promise<unknown> }) {
  const current = projection(videoOffer);
  const progression = useChatProgression({
    projection: current,
    recoverConversation: vi.fn(),
    resolveVideoOffer,
    submitAnswer: vi.fn<() => Promise<PreTriageAnswerResponse>>(),
  });
  return (
    <ChatPreTriageShell
      backHref="/home"
      projection={current}
      progressionState={progression.state}
      onVideoDecision={progression.submitVideoDecision}
    />
  );
}

describe("Educational video offer request locking", () => {
  it("suppresses double action submissions before the first request settles", () => {
    const resolveVideoOffer = vi.fn(() => new Promise<unknown>(() => undefined));
    render(<VideoProgressionHarness resolveVideoOffer={resolveVideoOffer} />);

    const watch = screen.getByRole("button", { name: "Yes, show me the video" });
    const skip = screen.getByRole("button", { name: "No, continue with assessment" });
    fireEvent.click(watch);
    fireEvent.click(watch);
    fireEvent.click(skip);

    expect(resolveVideoOffer).toHaveBeenCalledOnce();
    expect(resolveVideoOffer).toHaveBeenCalledWith("WATCH", expect.any(AbortSignal));
  });
});
