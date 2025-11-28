'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

const days = [
  { date: '2021-12-27' },
  { date: '2021-12-28' },
  { date: '2021-12-29' },
  { date: '2021-12-30' },
  { date: '2021-12-31' },
  { date: '2022-01-01', isCurrentMonth: true },
  { date: '2022-01-02', isCurrentMonth: true },
  { date: '2022-01-03', isCurrentMonth: true },
  { date: '2022-01-04', isCurrentMonth: true },
  { date: '2022-01-05', isCurrentMonth: true },
  { date: '2022-01-06', isCurrentMonth: true },
  { date: '2022-01-07', isCurrentMonth: true },
  { date: '2022-01-08', isCurrentMonth: true },
  { date: '2022-01-09', isCurrentMonth: true },
  { date: '2022-01-10', isCurrentMonth: true },
  { date: '2022-01-11', isCurrentMonth: true },
  { date: '2022-01-12', isCurrentMonth: true, isToday: true },
  { date: '2022-01-13', isCurrentMonth: true },
  { date: '2022-01-14', isCurrentMonth: true },
  { date: '2022-01-15', isCurrentMonth: true },
  { date: '2022-01-16', isCurrentMonth: true },
  { date: '2022-01-17', isCurrentMonth: true },
  { date: '2022-01-18', isCurrentMonth: true },
  { date: '2022-01-19', isCurrentMonth: true },
  { date: '2022-01-20', isCurrentMonth: true },
  { date: '2022-01-21', isCurrentMonth: true },
  { date: '2022-01-22', isCurrentMonth: true, isSelected: true },
  { date: '2022-01-23', isCurrentMonth: true },
  { date: '2022-01-24', isCurrentMonth: true },
  { date: '2022-01-25', isCurrentMonth: true },
  { date: '2022-01-26', isCurrentMonth: true },
  { date: '2022-01-27', isCurrentMonth: true },
  { date: '2022-01-28', isCurrentMonth: true },
  { date: '2022-01-29', isCurrentMonth: true },
  { date: '2022-01-30', isCurrentMonth: true },
  { date: '2022-01-31', isCurrentMonth: true },
  { date: '2022-02-01' },
  { date: '2022-02-02' },
  { date: '2022-02-03' },
  { date: '2022-02-04' },
  { date: '2022-02-05' },
  { date: '2022-02-06' },
]

export default function Calendar() {
  return (
    <div className="text-center">
      <div className="flex items-center text-gray-900">
        <button
          type="button"
          className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Previous month</span>
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </button>
        <div className="flex-auto text-sm font-semibold">January</div>
        <button
          type="button"
          className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Next month</span>
          <ChevronRightIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="mt-6 grid grid-cols-7 text-xs/6 text-gray-500">
        <div>M</div>
        <div>T</div>
        <div>W</div>
        <div>T</div>
        <div>F</div>
        <div>S</div>
        <div>S</div>
      </div>
      <div className="isolate mt-2 grid grid-cols-7 gap-px rounded-lg bg-gray-200 text-sm shadow ring-1 ring-gray-200">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            data-is-today={day.isToday ? '' : undefined}
            data-is-selected={day.isSelected ? '' : undefined}
            data-is-current-month={day.isCurrentMonth ? '' : undefined}
            className="py-1.5 first:rounded-tl-lg last:rounded-br-lg hover:bg-gray-100 focus:z-10 data-[is-current-month]:bg-white data-[is-selected]:font-semibold data-[is-today]:font-semibold data-[is-selected]:text-white data-[is-current-month]:hover:bg-gray-100 [&:not([data-is-current-month])]:bg-gray-50 data-[is-today]:[&:not([data-is-selected])]:text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] [&:not([data-is-selected])]:data-[is-current-month]:[&:not([data-is-today])]:text-gray-900 [&:not([data-is-selected])]:[&:not([data-is-current-month])]:[&:not([data-is-today])]:text-gray-400 [&:nth-child(36)]:rounded-bl-lg [&:nth-child(7)]:rounded-tr-lg"
          >
            <time
              dateTime={day.date}
              className="mx-auto flex size-7 items-center justify-center rounded-full [[data-is-selected]_&]:[&:not([data-is-today]_*)]:bg-gray-900 [[data-is-selected]_&]:[[data-is-today]_&]:bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]"
            >
              {day.date.split('-').pop()?.replace(/^0/, '') || ''}
            </time>
          </button>
        ))}
      </div>
    </div>
  )
}

