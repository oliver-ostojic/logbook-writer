import { XCircleIcon } from '@heroicons/react/20/solid'

interface ErrorMessageBoxProps {
  errors: string[];
}

export default function ErrorMessageBox({ errors }: ErrorMessageBoxProps) {
  if (errors.length === 0) return null;

  return (
    <div className="rounded-xl bg-red-50 p-4">
      <div className="flex">
        <div className="shrink-0">
          <XCircleIcon aria-hidden="true" className="size-5 text-red-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800" style={{ fontFamily: 'var(--font-sans)' }}>The constraint submissions are infeasible for the solver.</h3>
          <div className="mt-2 text-sm text-red-700">
            <ul role="list" className="list-disc space-y-1 pl-5">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
