'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckIcon } from '@heroicons/react/24/solid'

const stepDefinitions = [
  { id: '01', name: 'Crew', description: "Choose who's working.", path: 'shifts' },
  { id: '02', name: 'Constraints', description: 'Define rules and limits.', path: 'constraints' },
  { id: '03', name: 'Preview', description: 'Inspect drafted schedules.', path: 'preview' },
  { id: '04', name: 'Publish', description: 'Finalize and share logbook.', path: 'publish' },
]

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ProgressBarProps = {
  currentStep: 1 | 2 | 3 | 4;
}

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

  return (
    <div className="sticky top-0 z-50 bg-white lg:border-t lg:border-b lg:border-gray-200">
      <nav aria-label="Progress" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ol
          role="list"
          className="overflow-hidden rounded-md lg:flex lg:rounded-none lg:border-r lg:border-l lg:border-gray-200"
        >
          {steps.map((step, stepIdx) => (
            <li key={step.id} className="relative overflow-hidden lg:flex-1">
              <div
                className={classNames(
                  stepIdx === 0 ? 'rounded-t-md border-b-0' : '',
                  stepIdx === steps.length - 1 ? 'rounded-b-md border-t-0' : '',
                  'overflow-hidden border border-gray-200 lg:border-0',
                )}
              >
                {step.status === 'complete' ? (
                  <Link href={step.href} className="group">
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-full w-1 bg-transparent group-hover:bg-gray-200 lg:top-auto lg:bottom-0 lg:h-1 lg:w-full"
                    />
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className={classNames('flex size-10 items-center justify-center rounded-full', 'bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]')}>
                          <CheckIcon aria-hidden="true" className="size-6 text-white" />
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className="text-base font-medium text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>{step.name}</span>
                        <span className="text-sm font-normal text-gray-500" style={{ fontFamily: 'var(--font-sans)' }}>{step.description}</span>
                      </span>
                    </span>
                  </Link>
                ) : step.status === 'current' ? (
                  <div aria-current="step">
                    <span
                      aria-hidden="true"
                      className={classNames('absolute top-0 left-0 h-full w-1 lg:top-auto lg:bottom-0 lg:h-1 lg:w-full', 'bg-[hsl(var(--brand-h)_var(--brand-s)_60%)]')}
                    />
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className={classNames('flex size-10 items-center justify-center rounded-full border-2', 'border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]')}>
                          <span className={classNames('text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]')} style={{ fontFamily: 'var(--font-heading)' }}>{step.id}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className={classNames('text-base font-medium', 'text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]')} style={{ fontFamily: 'var(--font-heading)' }}>{step.name}</span>
                        <span className="text-sm font-normal text-gray-500" style={{ fontFamily: 'var(--font-sans)' }}>{step.description}</span>
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="cursor-not-allowed">
                    <span
                      className={classNames(
                        stepIdx !== 0 ? 'lg:pl-9' : '',
                        'flex items-start px-6 py-5 text-sm font-medium',
                      )}
                    >
                      <span className="shrink-0">
                        <span className="flex size-10 items-center justify-center rounded-full border-2 border-gray-300">
                          <span className="text-gray-500" style={{ fontFamily: 'var(--font-heading)' }}>{step.id}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 ml-4 flex min-w-0 flex-col">
                        <span className="text-base font-medium text-gray-500" style={{ fontFamily: 'var(--font-heading)' }}>{step.name}</span>
                        <span className="text-sm font-normal text-gray-500" style={{ fontFamily: 'var(--font-sans)' }}>{step.description}</span>
                      </span>
                    </span>
                  </div>
                )}

                {stepIdx !== 0 ? (
                  <>
                    {/* Separator */}
                    <div aria-hidden="true" className="absolute inset-0 top-0 left-0 hidden w-3 lg:block">
                      <svg
                        fill="none"
                        viewBox="0 0 12 82"
                        preserveAspectRatio="none"
                        className="size-full text-gray-300"
                      >
                        <path d="M0.5 0V31L10.5 41L0.5 51V82" stroke="currentcolor" vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
