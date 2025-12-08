export default function GenerateLogbookSection() {
  return (
    <div className="bg-gray-50 pb-12 sm:pb-16">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-start justify-between gap-6">
              {/* Left: Title and text */}
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Generate logbook</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                  <p>
                    Make sure your role constraint settings all look correct, then hit finish to generate your logbook.
                  </p>
                </div>
              </div>
              
              {/* Right: Finish button */}
              <div className="flex-shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center rounded-md bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[hsl(var(--brand-h)_var(--brand-s)_calc(var(--brand-l)_-_5%))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]"
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}