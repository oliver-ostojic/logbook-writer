'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckIcon } from '@heroicons/react/24/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const stepDefinitions = [
  { id: '01', name: 'Crew', description: "Choose who's working.", path: 'shifts' },
  { id: '02', name: 'Constraints', description: 'Define rules and limits.', path: 'constraints' },
  { id: '03', name: 'Preview', description: 'Inspect drafted schedules.', path: 'preview' },
  { id: '04', name: 'Publish', description: 'Download logbook.', path: 'publish' },
];

type ProgressBarProps = {
  currentStep: 1 | 2 | 3 | 4;
};

export default function ProgressBar({ currentStep }: ProgressBarProps) {
  const params = useParams();
  const storeId = params.storeId as string;

  // Calculate status for each step based on currentStep
  const steps = stepDefinitions.map((step, index) => {
    const stepNumber = index + 1;
    let status: 'complete' | 'current' | 'upcoming';

    if (stepNumber < currentStep) {
      status = 'complete';
    } else if (stepNumber === currentStep) {
      status = 'current';
    } else {
      status = 'upcoming';
    }

    const href = `/stores/${storeId}/logbook/create/${step.path}`;

    return { ...step, status, href };
  });

  // Calculate padding based on current step position
  const currentStepIndex = steps.findIndex(s => s.status === 'current');
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Match padding on all sides when on first or last step
  const paddingHorizontal = (isFirstStep || isLastStep) ? '48px' : '32px';
  const paddingVertical = (isFirstStep || isLastStep) ? '34px' : '18px'; // 14px less than horizontal

  // Glass pill circle for step number
  const StepCircle = ({
    step,
  }: {
    step: (typeof steps)[0];
  }) => {
    const isActive = step.status === 'complete' || step.status === 'current';

    return (
      <div
        className="ai-glass-border shrink-0"
        style={{
          ...aiGlassLightBorderStyle('9999px', '0, 0, 0', isActive ? 0 : 0.08),
          width: 40,
          height: 40,
        }}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('9999px', isActive ? 1 : 0.6),
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...(isActive && {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }),
          }}
        >
          {step.status === 'complete' ? (
            <CheckIcon
              aria-hidden="true"
              className="size-5"
              style={{ color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' }}
            />
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color:
                  step.status === 'current'
                    ? 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))'
                    : '#6B6B6B',
              }}
            >
              {step.id}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Step content (name and description)
  const StepContent = ({ step }: { step: (typeof steps)[0] }) => (
    <div className="ml-3 flex min-w-0 flex-col">
      <span
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '15px',
          fontWeight: 500,
          color:
            step.status === 'current'
              ? 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))'
              : step.status === 'complete'
                ? '#2C2C2C'
                : '#6B6B6B',
        }}
      >
        {step.name}
      </span>
      <span
        className="hidden sm:block"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontSize: '13px',
          fontWeight: 400,
          color: '#6B6B6B',
        }}
      >
        {step.description}
      </span>
    </div>
  );

  // Faded vertical line divider
  const FadedDivider = () => (
    <div
      className="hidden lg:block"
      style={{
        width: 1,
        height: 40,
        background:
          'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.08) 20%, rgba(0,0,0,0.08) 80%, transparent 100%)',
        margin: '0 20px',
        alignSelf: 'center',
      }}
    />
  );

  return (
    <div className="sticky top-4 z-50">
      <div
        className="ai-glass-border"
        style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
      >
        <div
          style={{
            ...aiGlassLightContentStyle('1.5rem', 0.6),
            padding: `${paddingVertical} ${paddingHorizontal}`,
            position: 'relative',
          }}
        >
          <nav aria-label="Progress">
            <ol className="flex items-center justify-center lg:justify-between" style={{ position: 'relative' }}>
              {steps.map((step, stepIdx) => (
                <React.Fragment key={step.id}>
                  <li
                    className={
                      step.status !== 'current' ? 'hidden lg:flex' : 'flex'
                    }
                    style={{ alignItems: 'center', position: 'relative', zIndex: 1 }}
                  >
                    {/* Red tinted glass pill overlay for current step */}
                    {step.status === 'current' && (
                      <div
                        className="ai-glass-border"
                        style={{
                          ...aiGlassLightBorderStyle('1.5rem', '220, 38, 38', 0.25),
                          position: 'absolute',
                          top: -16,
                          bottom: -16,
                          left: stepIdx === 0 ? -32 : -20,
                          right: stepIdx === steps.length - 1 ? -32 : -20,
                          zIndex: -1,
                        }}
                      >
                        <div
                          style={{
                            ...aiGlassLightContentStyle('1.5rem', 1),
                            width: '100%',
                            height: '100%',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.12)',
                          }}
                        />
                      </div>
                    )}
                    {step.status === 'complete' ? (
                      <Link href={step.href} className="group flex items-center">
                        <StepCircle step={step} />
                        <StepContent step={step} />
                      </Link>
                    ) : step.status === 'current' ? (
                      <div aria-current="step" className="flex items-center">
                        <StepCircle step={step} />
                        <StepContent step={step} />
                      </div>
                    ) : (
                      <div className="flex items-center cursor-not-allowed">
                        <StepCircle step={step} />
                        <StepContent step={step} />
                      </div>
                    )}
                  </li>

                  {/* Faded vertical line divider (except after last item) */}
                  {stepIdx < steps.length - 1 && <FadedDivider />}
                </React.Fragment>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </div>
  );
}
