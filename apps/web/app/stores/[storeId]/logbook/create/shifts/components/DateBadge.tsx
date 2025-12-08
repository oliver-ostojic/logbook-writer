import dayjs from 'dayjs';

export default function DateBadge({ selectedDate }: { selectedDate: string }) {
  const label = dayjs(selectedDate).format('MMMM D, YYYY');
  return (
    <div className="flex justify-center mt-10">
      <span className="inline-flex items-center rounded-full px-4 py-2.5 text-xs font-medium ring-1 ring-inset bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l)_/_0.12)] text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] ring-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l)_/_0.2)]">
        {label}
      </span>
    </div>
  )
}