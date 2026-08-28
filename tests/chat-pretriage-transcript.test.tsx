// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatPreTriageShell } from "@/features/pre-triage-chat/chat-shell";
import type {
  ConversationNextInteraction,
  PreTriageConversationProjection,
  StructuredPreTriageAnswers,
} from "@/lib/beeexy-api/contracts";

const durationInteraction: Extract<ConversationNextInteraction, { inputType: "DURATION" }> = {
  type: "QUESTION",
  field: "duration",
  questionCode: "DURATION",
  prompt: "How long ago did the stomach pain start?",
  inputType: "DURATION",
  required: true,
  constraints: { minimum: 0, exclusiveMinimum: true, allowedUnits: ["MINUTES", "HOURS", "DAYS"] },
  options: [],
};

const scaleInteraction: Extract<ConversationNextInteraction, { inputType: "SCALE" }> = {
  type: "QUESTION",
  field: "intensity",
  questionCode: "INTENSITY",
  prompt: "How intense is it from 1 to 10?",
  inputType: "SCALE",
  required: true,
  constraints: { minimum: 1, maximum: 10, step: 1 },
  options: [],
};

const symptomsInteraction: Extract<ConversationNextInteraction, { inputType: "MULTI_SELECT" }> = {
  type: "QUESTION",
  field: "additionalSymptoms",
  questionCode: "ADDITIONAL_SYMPTOMS",
  prompt: "Do you have any of these additional symptoms?",
  inputType: "MULTI_SELECT",
  required: true,
  constraints: { minimumSelections: 0, maximumSelections: 3, allowsEmptySelection: true },
  options: [
    { value: "NAUSEA", label: "Nausea" },
    { value: "DIARRHEA", label: "Diarrhea" },
    { value: "FEVER", label: "Fever" },
  ],
};

function projection(
  interaction: ConversationNextInteraction | null,
  acceptedValues: StructuredPreTriageAnswers = {},
  sessionId = "session-a",
): PreTriageConversationProjection {
  const completed = Object.keys(acceptedValues).length;
  return {
    sessionId,
    sessionStatus: "ACTIVE",
    state: interaction ? "IN_PROGRESS" : "READY_FOR_REVIEW",
    expiresAt: "2099-01-01T00:00:00Z",
    pathway: { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
    questionnaire: { code: "abdominal-demo", version: "v1" },
    ruleSet: { code: "neutral-demo", version: "v1" },
    progress: { completed, total: 3, percentage: Math.round((completed / 3) * 100) },
    acceptedValues,
    nextInteraction: interaction || undefined,
  };
}

function MountedStomachPainFlow() {
  const [current, setCurrent] = useState(projection(durationInteraction));

  function submit(interaction: ConversationNextInteraction, answer: StructuredPreTriageAnswers) {
    if (interaction.inputType === "DURATION") {
      setCurrent(projection(scaleInteraction, { duration: answer.duration }));
    } else if (interaction.inputType === "SCALE") {
      setCurrent(projection(symptomsInteraction, {
        duration: { value: 20, unit: "MINUTES" },
        intensity: answer.intensity,
      }));
    } else {
      setCurrent(projection(null, {
        duration: { value: 20, unit: "MINUTES" },
        intensity: 5,
        additionalSymptoms: answer.additionalSymptoms,
      }));
    }
  }

  return (
    <ChatPreTriageShell
      backHref="/home"
      onStructuredSubmit={submit}
      projection={current}
      reviewHref="/pre-triage/session-a/review"
    />
  );
}

afterEach(cleanup);

describe("Chat Pre-Triage ephemeral visual transcript", () => {
  it("preserves every exact assistant question beside its accepted answer through READY_FOR_REVIEW", async () => {
    render(<MountedStomachPainFlow />);

    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("How intense is it from 1 to 10?")).toBeInTheDocument();
    expect(screen.getByText("How long ago did the stomach pain start?")).toBeInTheDocument();
    expect(screen.getByText("20 minutes")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Pain intensity" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm level 5" }));

    expect(await screen.findByText("Do you have any of these additional symptoms?")).toBeInTheDocument();
    expect(screen.getByText("How long ago did the stomach pain start?")).toBeInTheDocument();
    expect(screen.getByText("20 minutes")).toBeInTheDocument();
    expect(screen.getByText("How intense is it from 1 to 10?")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fever" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Your information is ready to review.")).toBeInTheDocument();
    const feedText = document.querySelector(".chat-conversation-feed")?.textContent || "";
    const expectedOrder = [
      "Stomach pain",
      "How long ago did the stomach pain start?",
      "20 minutes",
      "How intense is it from 1 to 10?",
      "5",
      "Do you have any of these additional symptoms?",
      "Fever",
      "Your information is ready to review.",
    ];
    let previousIndex = -1;
    for (const text of expectedOrder) {
      const index = feedText.indexOf(text, previousIndex + 1);
      expect(index, `${text} should follow the previous transcript turn`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it("keeps natural-language intake intact without fabricating accepted-value history", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(symptomsInteraction, {
          duration: { value: 2, unit: "DAYS" },
          intensity: 6,
        })}
        transientUserTurn="My stomach has hurt for two days and it's a 6 out of 10."
      />,
    );

    expect(screen.getByText("My stomach has hurt for two days and it's a 6 out of 10.")).toBeInTheDocument();
    expect(screen.getByText("Do you have any of these additional symptoms?")).toBeInTheDocument();
    expect(screen.queryByText("2 days")).not.toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
  });

  it("deduplicates accepted recovery projections and the review-ready assistant turn", async () => {
    const initial = projection(symptomsInteraction, { duration: { value: 20, unit: "MINUTES" }, intensity: 5 });
    const recovered = projection(null, {
      duration: { value: 20, unit: "MINUTES" },
      intensity: 5,
      additionalSymptoms: ["FEVER"],
    });
    const view = render(<ChatPreTriageShell backHref="/home" projection={initial} reviewHref="/review" />);

    view.rerender(<ChatPreTriageShell backHref="/home" projection={recovered} reviewHref="/review" />);
    view.rerender(<ChatPreTriageShell backHref="/home" projection={{ ...recovered }} reviewHref="/review" />);

    await waitFor(() => {
      expect(screen.getAllByText("Do you have any of these additional symptoms?")).toHaveLength(1);
      expect(screen.getAllByText("Fever")).toHaveLength(1);
      expect(screen.getAllByText("Your information is ready to review.")).toHaveLength(1);
    });
  });

  it("clears the visual transcript immediately when a new session becomes active", async () => {
    const initial = projection(durationInteraction);
    const advanced = projection(scaleInteraction, { duration: { value: 20, unit: "MINUTES" } });
    const view = render(<ChatPreTriageShell backHref="/home" projection={initial} />);
    view.rerender(<ChatPreTriageShell backHref="/home" projection={advanced} />);
    expect(await screen.findByText("20 minutes")).toBeInTheDocument();

    view.rerender(<ChatPreTriageShell backHref="/home" projection={projection(durationInteraction, {}, "session-b")} />);

    expect(screen.queryByText("20 minutes")).not.toBeInTheDocument();
    expect(screen.queryByText("How intense is it from 1 to 10?")).not.toBeInTheDocument();
    expect(screen.getByText("How long ago did the stomach pain start?")).toBeInTheDocument();
  });

  it("keeps canonical refresh reconstruction without requiring exact assistant history", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(symptomsInteraction, {
          duration: { value: 20, unit: "MINUTES" },
          intensity: 5,
        })}
      />,
    );

    expect(screen.getByText("20 minutes")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Do you have any of these additional symptoms?")).toBeInTheDocument();
    expect(screen.queryByText("How long ago did the stomach pain start?")).not.toBeInTheDocument();
  });
});
