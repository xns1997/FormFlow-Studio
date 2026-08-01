import React from 'react';
import {
  buildDocIllustrationPlan,
  type PlannedStepScreenshot,
} from '../services/io/docs/doc-illustration-plan';
import type { DocScreenshotEntry } from '../services/io/docs/doc-screenshots';

type FocusStyle = React.CSSProperties & {
  '--focus-x': string;
  '--focus-y': string;
  '--focus-width': string;
  '--focus-height': string;
};

function ScreenshotFigure({
  screenshot,
  customizationId,
}: {
  screenshot: PlannedStepScreenshot;
  customizationId: string;
}) {
  const focusStyle: FocusStyle = {
    '--focus-x': `${screenshot.focus.x}%`,
    '--focus-y': `${screenshot.focus.y}%`,
    '--focus-width': `${screenshot.focus.width}%`,
    '--focus-height': `${screenshot.focus.height}%`,
  };
  const responsiveSrc = screenshot.src.replace(/\.png$/, '-1x.png');
  return (
    <figure
      className="docs-v2-screenshot docs-v2-step-screenshot"
      data-doc-screenshot={customizationId}
      style={focusStyle}
    >
      <div className="docs-v2-screenshot-stage">
        <picture>
          <source media="(max-width: 900px)" srcSet={responsiveSrc} />
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            loading="lazy"
            decoding="async"
            width={3200}
            height={2000}
          />
        </picture>
        <span className="docs-v2-screenshot-focus" aria-hidden="true" />
        <strong className="docs-v2-screenshot-callout">{screenshot.callout}</strong>
      </div>
      <figcaption>
        <strong>步骤 {screenshot.sequence}</strong>
        <span>{screenshot.instruction}</span>
      </figcaption>
    </figure>
  );
}

export function DocStepScreenshots({ entry, blockId }: { entry: DocScreenshotEntry; blockId: string }) {
  const plan = buildDocIllustrationPlan(entry);
  const steps = plan.stepsByBlock[blockId] || [];
  if (steps.length === 0) return null;
  return (
    <div className="docs-v2-step-screenshots" aria-label={`${entry.title}的步骤配图`}>
      {steps.map((screenshot) => (
        <ScreenshotFigure
          key={`${blockId}:${screenshot.sequence}:${screenshot.instruction}`}
          screenshot={screenshot}
          customizationId={`${plan.customizationId}-${blockId}-${screenshot.sequence}`}
        />
      ))}
    </div>
  );
}
