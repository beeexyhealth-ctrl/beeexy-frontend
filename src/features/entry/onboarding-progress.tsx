export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="onboarding-progress" role="group" aria-label={`Step ${current} of ${total}`}>
      <ol aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <li className={index + 1 <= current ? "active" : ""} key={index} />
        ))}
      </ol>
      <span>{current}<i>/</i>{total}</span>
    </div>
  );
}
