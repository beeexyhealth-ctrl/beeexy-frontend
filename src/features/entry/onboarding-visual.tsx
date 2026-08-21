import { Icon } from "@/components/ui/icon";
import type { OnboardingVisualName } from "./onboarding-data";

const visualContent: Record<OnboardingVisualName, React.ReactNode> = {
  understand: (
    <>
      <span className="visual-orbit orbit-one" />
      <span className="visual-orbit orbit-two" />
      <span className="visual-core"><Icon name="activity" size={43} /></span>
      <span className="visual-chip chip-one"><i />Today</span>
      <span className="visual-chip chip-two"><Icon name="heart" size={13} />Your notes</span>
    </>
  ),
  guidance: (
    <>
      <span className="visual-path" />
      <span className="visual-step-dot dot-one"><Icon name="message" size={18} /></span>
      <span className="visual-step-dot dot-two"><Icon name="sparkles" size={21} /></span>
      <span className="visual-step-dot dot-three"><Icon name="chevron-right" size={18} /></span>
      <span className="visual-caption">A focused path forward</span>
    </>
  ),
  connected: (
    <>
      <span className="visual-ring ring-one" />
      <span className="visual-ring ring-two" />
      <span className="visual-core connected-core"><span>B</span><i /></span>
      <span className="visual-node node-one"><Icon name="document" size={17} /></span>
      <span className="visual-node node-two"><Icon name="calendar" size={17} /></span>
      <span className="visual-node node-three"><Icon name="heart" size={17} /></span>
    </>
  ),
};

export function OnboardingVisual({ name }: { name: OnboardingVisualName }) {
  return <div className={`onboarding-visual visual-${name}`} aria-hidden="true">{visualContent[name]}</div>;
}
