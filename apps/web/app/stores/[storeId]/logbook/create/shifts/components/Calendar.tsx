'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useMemo, useState } from 'react';

dayjs.extend(isoWeek);

type CalendarProps = {
  selectedDate: string; // YYYY-MM-DD
  onChange: (date: string) => void;
};

export default function Calendar({ selectedDate, onChange }: CalendarProps) {
  const selected = dayjs(selectedDate);
  const [visibleMonth, setVisibleMonth] = useState(dayjs(selectedDate).startOf('month'));

  const days = useMemo(() => {
    const start = visibleMonth.startOf('month').startOf('isoWeek');
    const end = visibleMonth.endOf('month').endOf('isoWeek');
    const list: Array<{ date: string; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean }> = [];
    let cur = start;
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      const iso = cur.format('YYYY-MM-DD');
      list.push({
        date: iso,
        isCurrentMonth: cur.month() === visibleMonth.month(),
        isToday: cur.isSame(dayjs(), 'day'),
        isSelected: cur.isSame(selected, 'day'),
      });
      cur = cur.add(1, 'day');
    }
    return list;
  }, [visibleMonth, selectedDate]);

  const monthLabel = visibleMonth.format('MMMM');

  return (
    <div className="text-center">
      <div className="flex items-center text-gray-900">
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => m.subtract(1, 'month'))}
          className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Previous month</span>
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
        </button>
        <div className="flex-auto text-sm font-semibold">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => m.add(1, 'month'))}
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
        {days.map((day, idx) => (
          <button
            key={day.date}
            type="button"
            onClick={() => onChange(day.date)}
            data-is-today={day.isToday ? '' : undefined}
            data-is-selected={day.isSelected ? '' : undefined}
            data-is-current-month={day.isCurrentMonth ? '' : undefined}
            className="py-1.5 first:rounded-tl-lg last:rounded-br-lg hover:bg-gray-100 focus:z-10 data-[is-current-month]:bg-white data-[is-selected]:font-semibold data-[is-today]:font-semibold data-[is-selected]:text-white data-[is-current-month]:hover:bg-gray-100 [&:not([data-is-current-month])]:bg-gray-50 data-[is-today]:[&:not([data-is-selected])]:text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] [&:not([data-is-selected])]:data-[is-current-month]:[&:not([data-is-today])]:text-gray-900 [&:not([data-is-selected])]:[&:not([data-is-current-month])]:[&:not([data-is-today])]:text-gray-400 [&:nth-child(36)]:rounded-bl-lg [&:nth-child(7)]:rounded-tr-lg"
          >
            <time
              dateTime={day.date}
              className="mx-auto flex size-7 items-center justify-center rounded-full [[data-is-selected]_&]:bg-gray-900 [[data-is-selected]_&]:text-white"
            >
              {day.date.split('-').pop()?.replace(/^0/, '') || ''}
            </time>
          </button>
        ))}
      </div>
    </div>
  )
}

