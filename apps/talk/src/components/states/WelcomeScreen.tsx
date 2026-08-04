import type { IntroConfig } from "@/config/types.ts";
import { Button } from "@/components/primitives/Button.tsx";
import { ArrowRight } from "@/icons/index.tsx";

/** Pre-flow welcome screen, rendered from the backend's intro.json. */
export function WelcomeScreen({ intro, onBegin }: { intro: IntroConfig; onBegin: () => void }) {
  return (
    <div className="bb-state">
      <div className="bb-state__inner bb-welcome">
        <h1 className="bb-state__title">{intro.headline}</h1>
        {intro.supportingCopy.map((line, i) => (
          <p className="bb-state__body" key={i}>
            {line}
          </p>
        ))}
        <ul className="bb-welcome__reassure">
          {intro.reassurances.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <div className="bb-state__actions">
          <Button variant="primary" onClick={onBegin}>
            {intro.cta.label}
            <ArrowRight />
          </Button>
        </div>
        <p className="bb-welcome__privacy">{intro.privacy}</p>
      </div>
    </div>
  );
}
