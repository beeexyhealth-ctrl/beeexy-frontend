"use client";

import { type FormEvent, useId, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
  AdditionalSymptom,
  ConversationNextInteraction,
  DurationUnit,
  StructuredPreTriageAnswers,
} from "@/lib/beeexy-api/contracts";

type ConversationInteractionProps = {
  disabled?: boolean;
  error?: string | null;
  interaction: ConversationNextInteraction;
  onSubmit: (interaction: ConversationNextInteraction, answer: StructuredPreTriageAnswers) => Promise<void> | void;
  pending?: boolean;
};

export function ConversationInteraction({
  disabled = false,
  error,
  interaction,
  onSubmit,
  pending = false,
}: ConversationInteractionProps) {
  if (interaction.inputType === "DURATION") {
    return <DurationInteraction disabled={disabled} error={error} interaction={interaction} onSubmit={onSubmit} pending={pending} />;
  }
  if (interaction.inputType === "SCALE") {
    return <ScaleInteraction disabled={disabled} error={error} interaction={interaction} onSubmit={onSubmit} pending={pending} />;
  }
  if (interaction.inputType === "MULTI_SELECT") {
    return <MultiSelectInteraction disabled={disabled} error={error} interaction={interaction} onSubmit={onSubmit} pending={pending} />;
  }
  return (
    <section className="chat-interaction-unsupported" role="alert">
      This response type isn&apos;t available here yet. Refresh the conversation or try again later.
    </section>
  );
}

type InteractionOf<TType extends ConversationNextInteraction["inputType"]> = Extract<
  ConversationNextInteraction,
  { inputType: TType }
>;

type InteractionControlProps<TType extends ConversationNextInteraction["inputType"]> = {
  disabled: boolean;
  error?: string | null;
  interaction: InteractionOf<TType>;
  onSubmit: ConversationInteractionProps["onSubmit"];
  pending: boolean;
};

function DurationInteraction({ disabled, error, interaction, onSubmit, pending }: InteractionControlProps<"DURATION">) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const validationId = `${id}-validation`;
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<DurationUnit | "">(interaction.constraints.allowedUnits[0] || "");
  const numericValue = Number(value);
  const meetsMinimum = interaction.constraints.exclusiveMinimum
    ? numericValue > interaction.constraints.minimum
    : numericValue >= interaction.constraints.minimum;
  const valid = value !== "" && Number.isFinite(numericValue) && meetsMinimum && Boolean(unit);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !unit || disabled) return;
    void onSubmit(interaction, { duration: { value: numericValue, unit } });
  }

  const minimumHint = interaction.constraints.exclusiveMinimum
    ? `Enter a number greater than ${interaction.constraints.minimum}.`
    : `Enter ${interaction.constraints.minimum} or more.`;

  return (
    <form className="chat-structured-control chat-duration-control" onSubmit={submit} aria-label="Answer duration">
      <div className="chat-duration-fields">
        <div>
          <label htmlFor={`${id}-value`}>Duration</label>
          <input
            id={`${id}-value`}
            type="number"
            inputMode="decimal"
            min={interaction.constraints.minimum}
            step="any"
            value={value}
            disabled={disabled}
            aria-describedby={`${hintId}${value && !valid ? ` ${validationId}` : ""}${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(value && !valid) || Boolean(error)}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-unit`}>Unit</label>
          <select
            id={`${id}-unit`}
            value={unit}
            disabled={disabled || interaction.constraints.allowedUnits.length === 0}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setUnit(event.target.value as DurationUnit)}
          >
            {interaction.constraints.allowedUnits.length === 0 && <option value="">Unavailable</option>}
            {interaction.constraints.allowedUnits.map((allowedUnit) => (
              <option value={allowedUnit} key={allowedUnit}>{durationUnitLabel(allowedUnit)}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="chat-control-hint" id={hintId}>{minimumHint}</p>
      {value && !valid && <p className="chat-control-error" id={validationId} role="alert">Enter a valid duration using an available unit.</p>}
      {error && <p className="chat-control-error" id={errorId} role="alert">{error}</p>}
      <button className="button primary wide" type="submit" disabled={disabled || !valid}>
        {pending ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}

function ScaleInteraction({ disabled, error, interaction, onSubmit, pending }: InteractionControlProps<"SCALE">) {
  const id = useId();
  const errorId = `${id}-error`;
  const { maximum, minimum, step } = interaction.constraints;
  const [value, setValue] = useState(minimum);
  const progress = ((value - minimum) / Math.max(maximum - minimum, step || 1)) * 100;
  const emphasisHue = Math.round(228 - Math.max(0, Math.min(1, progress / 100)) * 210);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    void onSubmit(interaction, { intensity: value });
  }

  return (
    <form className="chat-structured-control chat-scale-control" onSubmit={submit} aria-label="Answer scale">
      <div className="chat-scale-value" aria-live="polite">
        <span>Selected value</span>
        <output htmlFor={`${id}-range`}>{value}</output>
      </div>
      <input
        id={`${id}-range`}
        name="scale"
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        aria-label="Select a value"
        aria-describedby={error ? errorId : undefined}
        aria-valuetext={`${value} on a scale from ${minimum} to ${maximum}`}
        style={{ "--chat-scale-progress": `${progress}%`, "--chat-scale-color": `hsl(${emphasisHue} 72% 52%)` } as React.CSSProperties}
        onChange={(event) => setValue(Number(event.target.value))}
      />
      <div className="chat-scale-limits" aria-hidden="true"><span>{minimum}</span><span>{maximum}</span></div>
      {error && <p className="chat-control-error" id={errorId} role="alert">{error}</p>}
      <button className="button primary wide" type="submit" disabled={disabled}>
        {pending ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}

function MultiSelectInteraction({ disabled, error, interaction, onSubmit, pending }: InteractionControlProps<"MULTI_SELECT">) {
  const id = useId();
  const errorId = `${id}-error`;
  const [selected, setSelected] = useState<AdditionalSymptom[]>([]);
  const [noneSelected, setNoneSelected] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const { allowsEmptySelection, maximumSelections, minimumSelections } = interaction.constraints;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const valid = selected.length >= minimumSelections
    && selected.length <= maximumSelections
    && (selected.length > 0 || (allowsEmptySelection && noneSelected));

  function toggle(value: AdditionalSymptom) {
    if (disabled) return;
    setNoneSelected(false);
    setSelected((current) => {
      if (current.includes(value)) {
        setSelectionError(null);
        return current.filter((item) => item !== value);
      }
      if (current.length >= maximumSelections) {
        setSelectionError(`Choose no more than ${maximumSelections}.`);
        return current;
      }
      setSelectionError(null);
      return [...current, value];
    });
  }

  function chooseNone() {
    if (disabled || !allowsEmptySelection) return;
    setSelected([]);
    setNoneSelected(true);
    setSelectionError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || disabled) return;
    void onSubmit(interaction, { additionalSymptoms: selected });
  }

  return (
    <form className="chat-structured-control chat-multi-control" onSubmit={submit} aria-label="Answer symptom options">
      <div className="chat-option-list" role="group" aria-label="Select all that apply" aria-describedby={error || selectionError ? errorId : undefined}>
        {interaction.options.map((option) => (
          <button
            className="chat-option-button"
            type="button"
            aria-pressed={selectedSet.has(option.value)}
            disabled={disabled}
            key={option.value}
            onClick={() => toggle(option.value)}
          >
            <span>{option.label}</span>
            <span className="chat-option-check" aria-hidden="true"><Icon name="check" size={16} /></span>
          </button>
        ))}
        {allowsEmptySelection && (
          <button
            className="chat-option-button none"
            type="button"
            aria-pressed={noneSelected}
            disabled={disabled}
            onClick={chooseNone}
          >
            <span>None</span>
            <span className="chat-option-check" aria-hidden="true"><Icon name="check" size={16} /></span>
          </button>
        )}
      </div>
      <p className="chat-control-hint">
        {minimumSelections === 0 ? "Choose any that apply, or select None." : `Choose at least ${minimumSelections}.`}
      </p>
      {(selectionError || error) && <p className="chat-control-error" id={errorId} role="alert">{selectionError || error}</p>}
      <button className="button primary wide" type="submit" disabled={disabled || !valid}>
        {pending ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}

function durationUnitLabel(unit: DurationUnit) {
  return unit.charAt(0) + unit.slice(1).toLowerCase();
}
