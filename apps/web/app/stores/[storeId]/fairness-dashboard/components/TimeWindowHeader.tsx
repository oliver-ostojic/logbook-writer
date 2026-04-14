'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';

// =============================================================================
// Types
// =============================================================================

export interface TimeWindowHeaderProps {
  /** All dates with logbook data (format: "YYYY-MM-DD") */
  availableDates: string[];
  /** Currently selected dates (format: "YYYY-MM-DD") */
  selectedDates: string[];
  /** Callback when selection changes */
  onSelectionChange: (dates: string[]) => void;
  /** Optional: border radius for embedded header */
  borderRadius?: string;
}

interface ParsedDates {
  years: number[];
  monthsByYear: Record<number, number[]>;
  datesByYearMonth: Record<string, string[]>;
}

type MonthSelectionState = 'full' | 'partial' | 'none';
type YearSelectionState = 'full' | 'partial' | 'none';

// =============================================================================
// Constants
// =============================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse available dates into structured data for easy lookup
 */
function parseAvailableDates(dates: string[]): ParsedDates {
  const years = new Set<number>();
  const monthsByYear: Record<number, Set<number>> = {};
  const datesByYearMonth: Record<string, string[]> = {};

  for (const dateStr of dates) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;

    years.add(year);

    if (!monthsByYear[year]) {
      monthsByYear[year] = new Set();
    }
    monthsByYear[year].add(month);

    if (!datesByYearMonth[key]) {
      datesByYearMonth[key] = [];
    }
    datesByYearMonth[key].push(dateStr);
  }

  return {
    years: Array.from(years).sort((a, b) => b - a), // Most recent first
    monthsByYear: Object.fromEntries(
      Object.entries(monthsByYear).map(([year, months]) => [
        parseInt(year),
        Array.from(months).sort((a, b) => a - b),
      ])
    ),
    datesByYearMonth,
  };
}

/**
 * Format selected date range intelligently
 * - Furthest date from today first, closest to today last
 * - Same month: "9-10 Jan 2026"
 * - Different months, same year: "9 Jan - 10 Mar 2026"
 * - Different years: "9 Jan 2025 - 10 Mar 2026"
 */
function formatDateRange(selectedDates: string[], availableDates: string[]): string {
  if (selectedDates.length === 0 || selectedDates.length === availableDates.length) return 'All dates';

  // Parse dates and sort
  const dates = selectedDates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  const today = new Date();

  // Determine which is furthest from today
  const earliestDist = Math.abs(earliest.getTime() - today.getTime());
  const latestDist = Math.abs(latest.getTime() - today.getTime());
  const [furthest, closest] = earliestDist > latestDist ? [earliest, latest] : [latest, earliest];

  const furthestDay = furthest.getDate();
  const furthestMonth = furthest.getMonth();
  const furthestYear = furthest.getFullYear();
  const closestDay = closest.getDate();
  const closestMonth = closest.getMonth();
  const closestYear = closest.getFullYear();

  // Single date
  if (selectedDates.length === 1) {
    return `${furthestDay} ${MONTH_NAMES[furthestMonth]} ${furthestYear}`;
  }

  // Same month and year: "9-10 Jan 2026"
  if (furthestMonth === closestMonth && furthestYear === closestYear) {
    return `${furthestDay}-${closestDay} ${MONTH_NAMES[furthestMonth]} ${furthestYear}`;
  }

  // Same year, different months: "9 Jan - 10 Mar 2026"
  if (furthestYear === closestYear) {
    return `${furthestDay} ${MONTH_NAMES[furthestMonth]} - ${closestDay} ${MONTH_NAMES[closestMonth]} ${furthestYear}`;
  }

  // Different years: "9 Jan 2025 - 10 Mar 2026"
  return `${furthestDay} ${MONTH_NAMES[furthestMonth]} ${furthestYear} - ${closestDay} ${MONTH_NAMES[closestMonth]} ${closestYear}`;
}

/**
 * Get the selection state of a month (full, partial, or none)
 */
function getMonthSelectionState(
  year: number,
  monthIndex: number,
  selectedDatesSet: Set<string>,
  datesByYearMonth: Record<string, string[]>
): MonthSelectionState {
  const key = `${year}-${monthIndex}`;
  const availableInMonth = datesByYearMonth[key] || [];

  if (availableInMonth.length === 0) {
    return 'none';
  }

  const selectedCount = availableInMonth.filter(d => selectedDatesSet.has(d)).length;

  if (selectedCount === 0) {
    return 'none';
  } else if (selectedCount === availableInMonth.length) {
    return 'full';
  } else {
    return 'partial';
  }
}

/**
 * Get the selection state of a year (full, partial, or none)
 */
function getYearSelectionState(
  year: number,
  selectedDatesSet: Set<string>,
  datesByYearMonth: Record<string, string[]>,
  monthsByYear: Record<number, number[]>
): YearSelectionState {
  const months = monthsByYear[year] || [];
  if (months.length === 0) return 'none';

  let totalAvailable = 0;
  let totalSelected = 0;

  for (const month of months) {
    const key = `${year}-${month}`;
    const datesInMonth = datesByYearMonth[key] || [];
    totalAvailable += datesInMonth.length;
    totalSelected += datesInMonth.filter(d => selectedDatesSet.has(d)).length;
  }

  if (totalSelected === 0) return 'none';
  if (totalSelected === totalAvailable) return 'full';
  return 'partial';
}

/**
 * Toggle all dates in a month (select all if not fully selected, deselect all if fully selected)
 */
function toggleMonth(
  year: number,
  monthIndex: number,
  currentSelectedDates: string[],
  datesByYearMonth: Record<string, string[]>
): string[] {
  const key = `${year}-${monthIndex}`;
  const datesInMonth = datesByYearMonth[key] || [];
  const selectedSet = new Set(currentSelectedDates);

  // Check current state
  const allSelected = datesInMonth.every(d => selectedSet.has(d));

  if (allSelected) {
    // Deselect all dates in this month
    return currentSelectedDates.filter(d => !datesInMonth.includes(d));
  } else {
    // Select all dates in this month
    const newSet = new Set(currentSelectedDates);
    datesInMonth.forEach(d => newSet.add(d));
    return Array.from(newSet);
  }
}

/**
 * Toggle a single day
 */
function toggleDay(date: string, currentSelectedDates: string[]): string[] {
  const selectedSet = new Set(currentSelectedDates);

  if (selectedSet.has(date)) {
    selectedSet.delete(date);
  } else {
    selectedSet.add(date);
  }

  return Array.from(selectedSet);
}

/**
 * Get days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day of week the month starts on (0 = Sunday)
 */
function getMonthStartDay(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// =============================================================================
// Component
// =============================================================================

const MONTHS_PER_PAGE = 6;

export function TimeWindowHeader({
  availableDates,
  selectedDates,
  onSelectionChange,
  borderRadius = '1.5rem 1.5rem 0 0',
}: TimeWindowHeaderProps) {
  // Calendar dropdown state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(0);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const calendarButtonRef = useRef<HTMLDivElement>(null);

  // Parse available dates
  const parsedDates = useMemo(() => parseAvailableDates(availableDates), [availableDates]);

  // Selected year (default to most recent with data)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Month pagination start index (for showing 6 months at a time)
  const [monthStartIndex, setMonthStartIndex] = useState(0);

  // Update selected year when parsedDates changes (to default to most recent year with data)
  useEffect(() => {
    if (parsedDates.years.length > 0) {
      setSelectedYear(parsedDates.years[0]); // years are sorted most recent first
    }
  }, [parsedDates.years]);

  // Create a Set for efficient lookup
  const selectedDatesSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  // Get months with data for selected year
  const monthsWithData = useMemo(() => {
    return parsedDates.monthsByYear[selectedYear] || [];
  }, [parsedDates, selectedYear]);

  // Reset month start index and calendar month index when year changes
  useEffect(() => {
    setMonthStartIndex(0);
    setCalendarMonthIndex(0);
  }, [selectedYear]);

  // Close calendar when tutorial advances past the calendar step
  useEffect(() => {
    const handleClose = () => setIsCalendarOpen(false);
    window.addEventListener('tutorial-close-calendar', handleClose);
    return () => window.removeEventListener('tutorial-close-calendar', handleClose);
  }, []);

  // Update calendar position on window resize
  useEffect(() => {
    if (!isCalendarOpen) return;

    const updatePosition = () => {
      if (calendarRef.current && calendarButtonRef.current) {
        const rect = calendarButtonRef.current.getBoundingClientRect();
        calendarRef.current.style.top = `${rect.bottom + window.scrollY + 32}px`;
        calendarRef.current.style.right = `${window.innerWidth - rect.right}px`;
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isCalendarOpen]);


  // Calculate visible months (limited to MONTHS_PER_PAGE)
  const visibleMonths = useMemo(() => {
    return monthsWithData.slice(monthStartIndex, monthStartIndex + MONTHS_PER_PAGE);
  }, [monthsWithData, monthStartIndex]);

  // Navigation state
  const canGoLeft = monthStartIndex > 0;
  const canGoRight = monthStartIndex + MONTHS_PER_PAGE < monthsWithData.length;

  // Handle month click
  const handleMonthClick = (monthIndex: number) => {
    const newDates = toggleMonth(selectedYear, monthIndex, selectedDates, parsedDates.datesByYearMonth);
    onSelectionChange(newDates);
  };

  // Handle day click
  const handleDayClick = (date: string) => {
    const newDates = toggleDay(date, selectedDates);
    onSelectionChange(newDates);
  };

  // Handle year change
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  // Handle month pagination
  const handleMonthPrev = () => {
    setMonthStartIndex(prev => Math.max(0, prev - MONTHS_PER_PAGE));
  };

  const handleMonthNext = () => {
    setMonthStartIndex(prev => Math.min(monthsWithData.length - MONTHS_PER_PAGE, prev + MONTHS_PER_PAGE));
  };

  // Calendar navigation
  const calendarCanGoLeft = calendarMonthIndex > 0;
  const calendarCanGoRight = calendarMonthIndex < monthsWithData.length - 1;
  const currentCalendarMonth = monthsWithData[calendarMonthIndex];

  const handleCalendarPrev = () => {
    if (calendarCanGoLeft) setCalendarMonthIndex(i => i - 1);
  };

  const handleCalendarNext = () => {
    if (calendarCanGoRight) setCalendarMonthIndex(i => i + 1);
  };

  return (
    <>
      {/* Header */}
      <div data-tutorial-id="dashboard-time-header" style={{ margin: '0', width: '100%' }}>
        <GlassPillCard padding="1rem" borderRadius={borderRadius} contentStyle={{ width: '100%' }}>
          <div className="flex items-center justify-between" style={{ width: '100%' }}>
            {/* Left: Month Pagination */}
            <div data-tutorial-id="dashboard-month-pagination" className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), flexShrink: 0 }}>
              <div
                className="flex items-center gap-1"
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.4),
                  padding: '0 6px',
                  height: '36px',
                }}
              >
                {/* Left arrow */}
                <button
                  onClick={handleMonthPrev}
                  disabled={!canGoLeft}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 4px',
                    cursor: canGoLeft ? 'pointer' : 'default',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: canGoLeft ? '#6B6B6B' : '#D1D1D1',
                  }}
                >
                  ◀
                </button>

                {/* Month buttons */}
                {visibleMonths.length > 0 ? (
                  visibleMonths.map((monthIndex) => {
                    const state = getMonthSelectionState(
                      selectedYear,
                      monthIndex,
                      selectedDatesSet,
                      parsedDates.datesByYearMonth
                    );

                    return (
                      <button
                        key={monthIndex}
                        onClick={() => handleMonthClick(monthIndex)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '0 8px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: state === 'full' ? 600 : state === 'partial' ? 500 : 400,
                          color: state === 'none' ? '#6B6B6B' : '#2C2C2C',
                          position: 'relative',
                        }}
                      >
                        {MONTH_NAMES[monthIndex]}
                        {/* Partial indicator dot */}
                        {state === 'partial' && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              background: '#2C2C2C',
                            }}
                          />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <span
                    style={{
                      padding: '0 8px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      color: '#9A999E',
                    }}
                  >
                    No data
                  </span>
                )}

                {/* Right arrow */}
                <button
                  onClick={handleMonthNext}
                  disabled={!canGoRight}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0 4px',
                    cursor: canGoRight ? 'pointer' : 'default',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    color: canGoRight ? '#6B6B6B' : '#D1D1D1',
                  }}
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Right: Dropdowns */}
            <div className="flex items-center gap-3">
              {/* Year Dropdown */}
              <Menu as="div" style={{ position: 'relative', zIndex: 100 }}>
                <div data-tutorial-id="dashboard-year-dropdown" className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <MenuButton
                    className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '0 14px',
                      height: '36px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {selectedYear}
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  </MenuButton>
                </div>

                <MenuItems
                  anchor="bottom end"
                  portal={false}
                  transition
                  className="w-24 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                  style={{
                    zIndex: 100,
                    ...aiGlassLightBorderStyle('0.75rem'),
                    marginTop: 8,
                  }}
                >
                  <div style={{ ...aiGlassLightContentStyle('0.75rem', 0.9), padding: '4px' }}>
                    {parsedDates.years.map((year) => {
                      const yearState = getYearSelectionState(
                        year,
                        selectedDatesSet,
                        parsedDates.datesByYearMonth,
                        parsedDates.monthsByYear
                      );

                      return (
                        <MenuItem key={year}>
                          {({ active }) => (
                            <button
                              onClick={() => handleYearChange(year)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '8px 12px',
                                textAlign: 'left',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                                color: selectedYear === year ? '#2C2C2C' : '#6B6B6B',
                                fontWeight: yearState === 'full' ? 600 : 400,
                                background: active ? 'rgba(0,0,0,0.05)' : 'transparent',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                              }}
                            >
                              <span>{year}</span>
                              {/* Red dot for partial selection */}
                              {yearState === 'partial' && (
                                <span
                                  style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: '#dc2626',
                                    marginLeft: '8px',
                                  }}
                                />
                              )}
                            </button>
                          )}
                        </MenuItem>
                      );
                    })}
                  </div>
                </MenuItems>
              </Menu>

              {/* All Dates Button */}
              <div data-tutorial-id="dashboard-calendar-btn" ref={calendarButtonRef} style={{ flexShrink: 0 }}>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                  <button
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '0 14px',
                      height: '36px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                      cursor: 'pointer',
                      border: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDateRange(selectedDates, availableDates)}
                    {isCalendarOpen ? (
                      <ChevronUpIcon className="ml-2 h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="ml-2 h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </GlassPillCard>
      </div>

      {/* Calendar dropdown - portal to document.body, absolute positioning to scroll with page */}
      {isCalendarOpen && calendarButtonRef.current && currentCalendarMonth !== undefined && typeof document !== 'undefined' &&
        createPortal(
          <div
            data-tutorial-id="dashboard-calendar-popup"
            ref={(el) => {
              calendarRef.current = el;
              if (el && calendarButtonRef.current) {
                const rect = calendarButtonRef.current.getBoundingClientRect();
                // Use absolute positioning with scroll offset so it scrolls with the page
                // Align top with bottom of the header (where mini cards start)
                el.style.top = `${rect.bottom + window.scrollY + 32}px`;
                el.style.right = `${window.innerWidth - rect.right}px`;
              }
            }}
            className="ai-glass-border"
            style={{
              ...aiGlassLightBorderStyle('1.5rem'),
              position: 'absolute',
              zIndex: 99999,
            }}
          >
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem', 0.95),
              padding: '14px 18px',
            }}
          >
            {/* Month Header with Arrows */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                marginBottom: '14px',
              }}
            >
              <button
                onClick={handleCalendarPrev}
                disabled={!calendarCanGoLeft}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '5px',
                  cursor: calendarCanGoLeft ? 'pointer' : 'default',
                  color: calendarCanGoLeft ? '#6B6B6B' : '#D1D1D1',
                  fontSize: '12px',
                  fontFamily: 'var(--font-open-sans)',
                }}
              >
                ◀
              </button>
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#2C2C2C',
                  minWidth: '92px',
                  textAlign: 'center',
                }}
              >
                {FULL_MONTH_NAMES[currentCalendarMonth]}
              </span>
              <button
                onClick={handleCalendarNext}
                disabled={!calendarCanGoRight}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '5px',
                  cursor: calendarCanGoRight ? 'pointer' : 'default',
                  color: calendarCanGoRight ? '#6B6B6B' : '#D1D1D1',
                  fontSize: '12px',
                  fontFamily: 'var(--font-open-sans)',
                }}
              >
                ▶
              </button>
            </div>

                {/* Day Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: '5px',
                  }}
                >
                  {/* Day headers */}
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div
                      key={i}
                      style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '12px',
                        color: '#9A999E',
                        padding: '5px',
                      }}
                    >
                      {d}
                    </div>
                  ))}

                  {/* Empty cells for start offset */}
                  {Array.from({ length: getMonthStartDay(selectedYear, currentCalendarMonth) }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}

                  {/* Day cells */}
                  {Array.from({ length: getDaysInMonth(selectedYear, currentCalendarMonth) }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${selectedYear}-${String(currentCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const key = `${selectedYear}-${currentCalendarMonth}`;
                    const datesInMonth = parsedDates.datesByYearMonth[key] || [];
                    const availableDatesSet = new Set(datesInMonth);
                    const hasData = availableDatesSet.has(dateStr);
                    const isSelected = selectedDatesSet.has(dateStr);

                    return (
                      <button
                        key={day}
                        onClick={() => hasData && handleDayClick(dateStr)}
                        disabled={!hasData}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          border: 'none',
                          background: isSelected ? 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' : 'transparent',
                          color: hasData ? (isSelected ? 'white' : '#6B6B6B') : '#D1D1D1',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '13px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: hasData ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mixBlendMode: isSelected ? 'multiply' : 'normal',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
